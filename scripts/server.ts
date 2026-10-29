import { createServer as createViteServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import http from "node:http";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { discover, safeFile } from "@motion/project-loader";
import { readEditor, saveEditor } from "./editor-store";
import {
  readStoryboard,
  saveStoryboard,
  storyboardTiming,
} from "./storyboard-store";
import {
  publicMediaAvailability,
  readMediaRegistry,
  readMediaWithAvailability,
  registerMediaAsset,
  registerPoseStudioPngs,
  registerStoryboardPngs,
  removeMediaAsset,
} from "./media-store";
import { pickMediaFile } from "./audio-file-picker";
import { createProject, removeProject } from "./project-scaffold";
import {
  streamRegisteredImage,
  streamRegisteredMedia,
  streamStoryboardReference,
} from "./media-stream";
import { probeAudioDuration } from "./audio-probe";
import { probeVideo } from "./video-probe";
import { resolveMedia } from "@motion/project-loader/media";
import { whisperResultToSubtitleTiming } from "@motion/lyrics-sync/subtitles";
import { transcribeAudioWithWhisper } from "./whisper-service";
import { transcribeVideoClipAudio } from "./video-transcription";
import { readProjectSettings, saveProjectCanvasSize } from "./project-settings";
import { createMusicAnalysisReport, readMusicAnalysisReport, saveMusicAnalysisReport } from "./music-analysis-report";
import { buildMusicLyricsMap, getLyricsSourceRevision, getMusicAnalysisSourceRevision, musicLyricsMapRevision, readMusicLyricsArtifacts, saveMusicLyricsArtifacts } from "./music-lyrics-map";
import type { EditTimeline } from "@motion/sdk/timeline";
export const root = path.resolve(import.meta.dirname, "..");
export const projectsDir = path.join(root, "projects");
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};
const shellCsp = (preview: string) =>
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: ${preview}; connect-src 'self' ws://127.0.0.1:*; frame-src ${preview}; object-src 'none'; base-uri 'none'`;
const previewCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
export type ServerOptions = {
  audioFilePicker?: () => Promise<string | undefined>;
  mediaFilePicker?: (
    type: "audio" | "image" | "video",
  ) => Promise<string | undefined>;
  /** Test seam for deterministic local-worker responses; production uses the existing Python adapter. */
  transcribeAudio?: (audioPath: string) => Promise<unknown>;
  /** Test seam for video audio extraction; production uses FFmpeg and the same Whisper worker. */
  transcribeVideoAudio?: (
    videoPath: string,
    sourceStartSeconds: number,
    durationSeconds: number,
  ) => Promise<unknown>;
};

async function sha256File(filePath: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

export async function startServers(
  built = false,
  portOffset = 0,
  options: ServerOptions = {},
) {
  let previewOrigin = "";
  let shellOrigin = "";
  const servers: http.Server[] = [];
  const vites: ViteDevServer[] = [];
  type MusicAnalysisJob = {
    id: string;
    projectId: string;
    status: "queued" | "running" | "complete" | "failed" | "canceled";
    stage: string;
    message: string;
    error?: string;
    child?: ChildProcess;
  };
  const musicAnalysisJobs = new Map<string, MusicAnalysisJob>();
  const activeMusicAnalysisByProject = new Map<string, string>();
  const getProjects = async () =>
    built
      ? JSON.parse(
          await readFile(path.join(root, "dist/projects.json"), "utf8"),
        )
      : discover(projectsDir);
  async function make(kind: "shell" | "preview") {
    const isShell = kind === "shell";
    const dir = built
      ? path.join(root, "dist", kind)
      : isShell
        ? path.join(root, "apps/desktop")
        : root;
    const vite = built
      ? null
      : await createViteServer({
          configFile: false,
          root: dir,
          plugins: [react()],
          server: {
            middlewareMode: true,
            watch: { ignored: ["**/.studio/**", "**/out/**", "**/dist/**"] },
            hmr: {
              port: (isShell ? 24680 : 24681) + portOffset,
              host: "127.0.0.1",
              overlay: false,
            },
            fs: { strict: true, allow: [root] },
          },
          appType: "custom",
          optimizeDeps: {
            include: [
              "react",
              "react-dom/client",
              "remotion",
              "@remotion/player",
            ],
          },
        });
    if (vite) {
      vites.push(vite);
      if (!isShell) {
        vite.watcher.add(projectsDir);
        let timer: ReturnType<typeof setTimeout>;
        vite.watcher.on("all", (_event, file) => {
          if (
            file.replaceAll("\\", "/").includes("/projects/") &&
            !file.endsWith(".tmp") &&
            !file.replaceAll("\\", "/").includes("/.floxbow/visual-inspection/")
          ) {
            clearTimeout(timer);
            timer = setTimeout(
              () =>
                vite.ws.send({
                  type: "custom",
                  event: "studio:change",
                  data: {},
                }),
              180,
            );
          }
        });
      }
    }
    const server = http.createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader(
          "Content-Security-Policy",
          isShell ? shellCsp(previewOrigin) : previewCsp,
        );
        res.setHeader("Cache-Control", "no-store");
        const storyboardRoute =
          isShell &&
          /^\/api\/storyboard\/([a-z0-9-]+)(?:\/(timing|media)\/??([a-z0-9-]+)?)?$/.exec(
            pathname,
          );
        if (storyboardRoute) {
          const [, id, action, assetId] = storyboardRoute;
          const project = (await getProjects()).find(
            (p: { id: string }) => p.id === id,
          );
          if (!project?.manifest) throw new Error("Unknown storyboard project");
          await safeFile(projectsDir, `${id}/project.json`);
          const projectRoot = path.join(projectsDir, id);
          if (req.method === "GET") {
            if (action === "media" && assetId) {
              await streamStoryboardReference(
                projectRoot,
                assetId,
                res,
                new URL(req.url ?? "/", "http://localhost").searchParams.get(
                  "assetId",
                ) ?? undefined,
              );
              return;
            }
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify(
                action === "timing"
                  ? await storyboardTiming(projectRoot, project.manifest)
                  : await readStoryboard(projectRoot, id),
              ),
            );
            return;
          }
          if (req.method !== "PUT" || action) {
            res.writeHead(405).end();
            return;
          }
          if (built) {
            res
              .writeHead(409)
              .end(
                "Storyboard editing requires the live development workspace.",
              );
            return;
          }
          if (
            req.headers.origin !== shellOrigin ||
            !req.headers["content-type"]?.startsWith("application/json")
          ) {
            res
              .writeHead(403)
              .end("Only the studio shell can save storyboards");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 8_000_000)
              throw new Error("Storyboard request exceeds 8 MB");
          }
          const input = JSON.parse(body);
          if (
            !input ||
            typeof input.revision !== "string" ||
            Object.keys(input).some(
              (k) => !["document", "revision"].includes(k),
            )
          )
            throw new Error("Invalid storyboard save request");
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              await saveStoryboard(
                projectRoot,
                id,
                input.document,
                input.revision,
              ),
            ),
          );
          return;
        }
        const inspectionRoute =
          isShell && /^\/api\/visual-inspection\/([a-z0-9-]+)$/.exec(pathname);
        if (inspectionRoute) {
          if (req.method !== "POST") {
            res.writeHead(405).end();
            return;
          }
          if (
            req.headers.origin !== shellOrigin ||
            !req.headers["content-type"]?.startsWith("application/json")
          ) {
            res
              .writeHead(403)
              .end("Only the studio shell can save inspection context");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 12_000_000)
              throw new Error("Visual inspection package exceeds 12 MiB");
          }
          const input = JSON.parse(body) as Record<string, unknown>;
          const expectedKeys = [
            "request",
            "frame",
            "fps",
            "durationInFrames",
            "width",
            "height",
            "revision",
            "stateVersion",
            "selectedClipId",
            "selectedClipLabel",
            "dirty",
            "nodes",
            "timelineElements",
            "imageDataUrl",
          ];
          if (
            !input ||
            Object.keys(input).length !== expectedKeys.length ||
            expectedKeys.some((key) => !Object.hasOwn(input, key)) ||
            typeof input.request !== "string" ||
            input.request.trim().length < 1 ||
            input.request.length > 4000 ||
            typeof input.frame !== "number" ||
            !Number.isInteger(input.frame) ||
            typeof input.fps !== "number" ||
            !Number.isInteger(input.fps) ||
            typeof input.durationInFrames !== "number" ||
            !Number.isInteger(input.durationInFrames) ||
            typeof input.width !== "number" ||
            !Number.isInteger(input.width) ||
            typeof input.height !== "number" ||
            !Number.isInteger(input.height) ||
            typeof input.stateVersion !== "number" ||
            !Number.isInteger(input.stateVersion) ||
            typeof input.revision !== "string" ||
            input.revision.length > 256 ||
            typeof input.selectedClipId !== "string" ||
            input.selectedClipId.length > 160 ||
            typeof input.selectedClipLabel !== "string" ||
            input.selectedClipLabel.length > 300 ||
            typeof input.dirty !== "boolean" ||
            !Array.isArray(input.nodes) ||
            input.nodes.length > 500 ||
            !Array.isArray(input.timelineElements) ||
            input.timelineElements.length > 3000 ||
            input.timelineElements.some(
              (item) =>
                !item ||
                typeof item !== "object" ||
                typeof item.clipId !== "string" ||
                typeof item.label !== "string" ||
                typeof item.trackId !== "string" ||
                typeof item.trackName !== "string" ||
                typeof item.componentId !== "string" ||
                typeof item.componentName !== "string" ||
                typeof item.fromFrame !== "number" ||
                typeof item.durationInFrames !== "number" ||
                typeof item.endFrame !== "number" ||
                typeof item.localFrame !== "number" ||
                typeof item.editability !== "string" ||
                typeof item.sourceRef !== "string" ||
                !Array.isArray(item.editableFields) ||
                item.editableFields.length > 50 ||
                item.editableFields.some(
                  (field: Record<string, unknown>) =>
                    !field ||
                    typeof field !== "object" ||
                    typeof field.key !== "string" ||
                    (field.target !== "content" && field.target !== "props") ||
                    typeof field.label !== "string" ||
                    (field.type !== "text" &&
                      field.type !== "number" &&
                      field.type !== "color" &&
                      field.type !== "select" &&
                      field.type !== "boolean"),
                ),
            ) ||
            typeof input.imageDataUrl !== "string" ||
            !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
              input.imageDataUrl,
            )
          )
            throw new Error("Visual inspection context has an invalid shape");
          const id = inspectionRoute[1];
          const project = (await getProjects()).find(
            (candidate: { id: string; manifest?: unknown }) =>
              candidate.id === id,
          );
          if (!project?.manifest) throw new Error("Unknown project");
          const manifest = project.manifest as {
            fps: number;
            width: number;
            height: number;
            durationInFrames: number;
          };
          if (
            input.frame < 0 ||
            input.frame >= input.durationInFrames ||
            input.fps !== manifest.fps ||
            input.width !== manifest.width ||
            input.height !== manifest.height ||
            input.durationInFrames < 1
          )
            throw new Error(
              "Visual inspection frame does not match the project",
            );
          const imageBytes = Buffer.from(
            input.imageDataUrl.slice("data:image/png;base64,".length),
            "base64",
          );
          if (
            imageBytes.length < 24 ||
            imageBytes.length > 8_000_000 ||
            !imageBytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            throw new Error("Canvas capture is not a valid PNG under 8 MiB");
          const projectRoot = path.join(projectsDir, id);
          const captureId = randomUUID();
          const inspectionRoot = path.join(
            projectRoot,
            ".floxbow",
            "visual-inspection",
          );
          const outputDirectory = path.join(inspectionRoot, captureId);
          await mkdir(outputDirectory, { recursive: true });
          const realProject = await realpath(projectRoot);
          const realOutput = await realpath(outputDirectory);
          const relativeOutput = path.relative(realProject, realOutput);
          if (
            relativeOutput.startsWith("..") ||
            path.isAbsolute(relativeOutput)
          )
            throw new Error("Inspection output escaped the project directory");
          const absoluteDirectory = realOutput;
          const frameSeconds = Number(input.frame) / Number(input.fps);
          const metadata = {
            schemaVersion: 2,
            projectId: id,
            capturedAt: new Date().toISOString(),
            frame: input.frame,
            timeSeconds: Math.round(frameSeconds * 1000) / 1000,
            fps: input.fps,
            durationInFrames: input.durationInFrames,
            composition: { width: input.width, height: input.height },
            editor: {
              revision: input.revision,
              stateVersion: input.stateVersion,
              dirty: input.dirty,
              selectedClipId: input.selectedClipId,
              selectedClipLabel: input.selectedClipLabel,
            },
            elements: input.nodes,
            timelineElements: input.timelineElements,
            screenshot: {
              file: "frame.png",
              width: imageBytes.readUInt32BE(16),
              height: imageBytes.readUInt32BE(20),
            },
            request: input.request,
            note: "timelineElements lists Timeline clips active at the captured frame and their declared editable fields. elements lists explicitly registered DOM visuals with measured bounds; transparent image pixels are not segmented. WebGL internals and exact occlusion are not enumerated.",
          };
          const requestText = [
            "# FloxBow visual edit request",
            "",
            input.request,
            "",
            `Project: ${id}`,
            `Frame: ${input.frame} (${frameSeconds.toFixed(3)} s at ${input.fps} fps)`,
            `Selected Timeline clip: ${input.selectedClipLabel || input.selectedClipId || "none"} (${input.selectedClipId || "none"})`,
            `Editor state: ${input.dirty ? "unsaved draft" : "saved"}; state version ${input.stateVersion}; revision ${input.revision}`,
            `Timeline elements active at this frame: ${input.timelineElements.length}. Search inspection.json.timelineElements for the visible text or object. Each entry includes its clip ID, track, component, frame range, sourceRef, content, props, and declared editableFields. Change only fields listed in editableFields through the Inspector contract.`,
            `Screenshot: ${path.join(absoluteDirectory, "frame.png")}`,
            `Inspection data: ${path.join(absoluteDirectory, "inspection.json")}`,
            "Use timelineElements as the frame-specific lookup index and visual nodes in elements for measured bounds. A clip with no declared editableFields is identifiable but is not directly Inspector-editable; follow its sourceRef to inspect the owning component and supported editing path.",
          ].join("\n");
          const atomicWrite = async (name: string, data: string | Buffer) => {
            const target = path.join(absoluteDirectory, name);
            const temporary = `${target}.${randomUUID()}.tmp`;
            await writeFile(temporary, data, { flag: "wx" });
            await rename(temporary, target);
          };
          await atomicWrite("frame.png", imageBytes);
          await atomicWrite(
            "inspection.json",
            `${JSON.stringify(metadata, null, 2)}\n`,
          );
          await atomicWrite("request.md", `${requestText}\n`);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              captureId,
              directory: absoluteDirectory,
              screenshot: path.join(absoluteDirectory, "frame.png"),
              inspection: path.join(absoluteDirectory, "inspection.json"),
              request: path.join(absoluteDirectory, "request.md"),
              copiedText: requestText,
            }),
          );
          return;
        }
        const projectSettingsRoute =
          /^\/api\/projects\/([a-z0-9-]+)\/settings$/.exec(pathname);
        if (isShell && projectSettingsRoute) {
          const [, id] = projectSettingsRoute;
          const project = (await getProjects()).find(
            (candidate: { id: string; manifest?: unknown }) =>
              candidate.id === id && candidate.manifest,
          );
          if (!project) {
            res.writeHead(404).end("Unknown project");
            return;
          }
          if (req.method === "GET") {
            const settings = await readProjectSettings(
              path.join(projectsDir, id),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(settings));
            return;
          }
          if (req.method !== "PUT") {
            res.writeHead(405).end();
            return;
          }
          if (
            req.headers.origin !== shellOrigin ||
            !req.headers["content-type"]?.startsWith("application/json")
          ) {
            res
              .writeHead(403)
              .end("Only the studio shell can change Canvas settings");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 2_048)
              throw new Error("Canvas settings request too large");
          }
          const input = JSON.parse(body);
          if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            Object.keys(input).some(
              (key) => !["revision", "width", "height"].includes(key),
            ) ||
            typeof input.revision !== "string" ||
            typeof input.width !== "number" ||
            typeof input.height !== "number"
          )
            throw new Error("Canvas settings request is invalid.");
          let saved;
          try {
            saved = await saveProjectCanvasSize(
              path.join(projectsDir, id),
              input.revision,
              input.width,
              input.height,
            );
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith("CONFLICT:")
            ) {
              res.writeHead(409, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ message: error.message }));
              return;
            }
            if (
              error instanceof Error &&
              error.message.startsWith("Canvas dimensions")
            ) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ message: error.message }));
              return;
            }
            throw error;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(saved));
          return;
        }
        if (isShell && pathname.startsWith("/api/edit/")) {
          const id = pathname.slice("/api/edit/".length);
          const p = (await getProjects()).find(
            (p: { id: string }) => p.id === id,
          );
          if (!p?.manifest) throw new Error("Unknown project");
          let result;
          if (req.method === "PUT") {
            if (
              req.headers.origin !== shellOrigin ||
              !req.headers["content-type"]?.startsWith("application/json")
            ) {
              res
                .writeHead(403)
                .end("Only the studio shell can save a timeline");
              return;
            }
            let body = "";
            for await (const chunk of req) {
              body += chunk.toString();
              if (Buffer.byteLength(body) > 2_000_000)
                throw new Error("Timeline too large");
            }
            const data = JSON.parse(body);
            result = await saveEditor(
              path.join(projectsDir, id),
              p.manifest,
              data.timeline,
              data.revision,
            );
          } else if (req.method === "GET")
            result = await readEditor(path.join(projectsDir, id), p.manifest);
          else {
            res.writeHead(405).end();
            return;
          }
          if (req.method === "PUT" && result && typeof result === "object" && "timeline" in result && "revision" in result) {
            const saved = result as { timeline: EditTimeline; revision: string };
            try {
              const projectRoot = path.join(projectsDir, id);
              const music = await readMusicAnalysisReport(projectRoot);
              if (music) {
                const existing = await readMusicLyricsArtifacts(projectRoot);
                const currentLyricsRevision = getLyricsSourceRevision(saved.timeline);
                const stale = !existing.map || !existing.brief || existing.map.sources.lyrics.revision !== currentLyricsRevision || existing.map.sources.musicAnalysis.reportRevision !== getMusicAnalysisSourceRevision(music) || existing.brief.mapRevision !== musicLyricsMapRevision(existing.map);
                if (stale) {
                  const { map, brief } = buildMusicLyricsMap({ projectId: id, music, timeline: saved.timeline });
                  await saveMusicLyricsArtifacts(projectRoot, map, brief);
                  result = { ...saved, musicLyricsCorrelation: { status: "updated" } };
                } else result = { ...saved, musicLyricsCorrelation: { status: "unchanged" } };
              }
            } catch (error) {
              result = { ...saved, musicLyricsCorrelation: { status: "stale", message: error instanceof Error ? error.message : String(error) } };
            }
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
          return;
        }
        const mediaStream =
          /^\/api\/media\/([a-z0-9-]+)\/assets\/([a-z0-9-]+)\/stream$/.exec(
            pathname,
          );
        if (mediaStream && (req.method === "GET" || req.method === "HEAD")) {
          const [, id, assetId] = mediaStream;
          const project = (await getProjects()).find(
            (candidate: { id: string }) => candidate.id === id,
          );
          if (!project?.manifest) {
            res.writeHead(404).end("Unknown project");
            return;
          }
          if (req.method === "HEAD") {
            const registry = await readMediaRegistry(
              path.join(projectsDir, id),
            );
            const resolved = await resolveMedia(
              path.join(projectsDir, id),
              registry.registry,
              assetId,
            );
            if (resolved.status !== "ready") {
              res.writeHead(404).end("The selected audio file is unavailable.");
              return;
            }
            const info = await stat(resolved.path);
            res
              .writeHead(200, {
                "Content-Type":
                  resolved.type === "image"
                    ? "image/png"
                    : resolved.type === "video"
                      ? "video/mp4"
                      : path.extname(resolved.path).toLowerCase() === ".mp3"
                        ? "audio/mpeg"
                        : "audio/wav",
                "Content-Length": info.size,
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
              })
              .end();
          } else {
            await streamRegisteredMedia(
              path.join(projectsDir, id),
              assetId,
              req.headers.range,
              res,
            );
          }
          return;
        }
        if (isShell && pathname.startsWith("/api/media/")) {
          const route = pathname.slice("/api/media/".length).split("/");
          const id = decodeURIComponent(route[0] ?? "");
          const removingAsset = route.length === 3 && route[1] === "assets";
          const soundtrackProbe =
            route.length === 4 &&
            route[1] === "assets" &&
            route[3] === "soundtrack";
          const transcription =
            route.length === 4 &&
            route[1] === "assets" &&
            route[3] === "transcription";
          const imageThumbnail =
            route.length === 4 &&
            route[1] === "assets" &&
            route[3] === "thumbnail";
          const videoProbe =
            route.length === 4 && route[1] === "assets" && route[3] === "video";
          const poseStudioImport =
            route.length === 2 && route[1] === "pose-studio";
          const storyboardPublish =
            route.length === 2 && route[1] === "storyboard-publish";
          const musicAnalysis = route.length === 2 && route[1] === "music-analysis";
          const musicLyricsMap = route.length === 2 && route[1] === "music-lyrics-map";
          const musicAnalysisJob = route.length === 4 && route[1] === "music-analysis" && route[2] === "jobs";
          const assetId = removingAsset ? decodeURIComponent(route[2]) : "";
          const probedAssetId = soundtrackProbe
            ? decodeURIComponent(route[2])
            : "";
          const transcriptionAssetId = transcription
            ? decodeURIComponent(route[2])
            : "";
          if (
            route.length !== 1 &&
            !removingAsset &&
            !soundtrackProbe &&
            !transcription &&
            !imageThumbnail &&
            !videoProbe &&
            !poseStudioImport &&
            !storyboardPublish &&
            !musicAnalysis &&
            !musicLyricsMap &&
            !musicAnalysisJob
          ) {
            res.writeHead(404).end("Unknown media operation");
            return;
          }
          const project = (await getProjects()).find(
            (candidate: { id: string; manifest?: unknown }) =>
              candidate.id === id,
          );
          if (!project?.manifest) {
            res.writeHead(404).end("Unknown project");
            return;
          }
          if (musicAnalysis || musicAnalysisJob || musicLyricsMap) {
            if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
              res.writeHead(405).end();
              return;
            }
            if (req.method !== "GET" && (req.headers.origin !== shellOrigin || !req.headers["content-type"]?.startsWith("application/json"))) {
              res.writeHead(403, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Only the FloxBow shell can control Music Analysis." }));
              return;
            }
            if (built) {
              res.writeHead(409, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Music Analysis is available in the live development workspace." }));
              return;
            }
            const projectRoot = path.join(projectsDir, id);
            if (musicLyricsMap) {
              if (req.method === "GET") {
                const [artifacts, music] = await Promise.all([readMusicLyricsArtifacts(projectRoot), readMusicAnalysisReport(projectRoot)]);
                let stale = false;
                if (artifacts.map) {
                  if (!music || !project.manifest?.editTimeline) stale = true;
                  else {
                    const current = await readEditor(projectRoot, project.manifest);
                    stale = artifacts.map.sources.lyrics.revision !== getLyricsSourceRevision(current.timeline) || artifacts.map.sources.musicAnalysis.reportRevision !== getMusicAnalysisSourceRevision(music) || !artifacts.brief || artifacts.brief.mapRevision !== musicLyricsMapRevision(artifacts.map);
                  }
                }
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Cache-Control", "no-store");
                res.end(JSON.stringify({ ...artifacts, stale }));
                return;
              }
              if (req.method !== "POST") { res.writeHead(405).end(); return; }
              let body = "";
              for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 1_000) throw new Error("Music × Lyrics request is too large."); }
              if (body.trim() && body.trim() !== "{}") throw new Error("Music × Lyrics analysis uses the saved project Timeline and does not accept lyric copies.");
              const music = await readMusicAnalysisReport(projectRoot);
              if (!music) throw new Error("Run Analyze Music before building the full-song correlation.");
              if (!project.manifest?.editTimeline) throw new Error("This project has no saved editable Timeline to read subtitle cues from.");
              const source = await readEditor(projectRoot, project.manifest);
              const { map, brief } = buildMusicLyricsMap({ projectId: id, music, timeline: source.timeline });
              const saved = await saveMusicLyricsArtifacts(projectRoot, map, brief);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ...saved, stale: false }));
              return;
            }
            if (musicAnalysis && req.method === "GET") {
              const report = await readMusicAnalysisReport(projectRoot);
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(JSON.stringify({ report }));
              return;
            }
            if (musicAnalysis && req.method === "POST") {
              let body = "";
              for await (const chunk of req) {
                body += chunk.toString();
                if (Buffer.byteLength(body) > 8_000) throw new Error("Music Analysis request is too large.");
              }
              const input = JSON.parse(body);
              if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "assetId") || typeof input.assetId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(input.assetId))
                throw new Error("Choose one registered audio asset to analyze.");
              const activeId = activeMusicAnalysisByProject.get(id);
              const existingJob = activeId ? musicAnalysisJobs.get(activeId) : undefined;
              if (existingJob && (existingJob.status === "queued" || existingJob.status === "running")) {
                res.writeHead(409, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Music Analysis is already running for this project." }));
                return;
              }
              const registry = await readMediaRegistry(projectRoot);
              const asset = registry.registry.assets.find(item => item.id === input.assetId);
              if (!asset || asset.type !== "audio") throw new Error("Select a registered MP3 or WAV audio asset.");
              const resolved = await resolveMedia(projectRoot, registry.registry, asset.id);
              if (resolved.status !== "ready" || resolved.type !== "audio") {
                res.writeHead(resolved.status === "missing" ? 404 : 422, { "Content-Type": "application/json" }).end(JSON.stringify({ message: resolved.status === "missing" ? "The selected audio file is missing." : resolved.status === "invalid" ? resolved.message : "The selected asset is not audio." }));
                return;
              }
              const job: MusicAnalysisJob = { id: randomUUID(), projectId: id, status: "queued", stage: "queued", message: "Preparing analysis…" };
              musicAnalysisJobs.set(job.id, job);
              activeMusicAnalysisByProject.set(id, job.id);
              const worker = path.join(root, "scripts", "music-analysis-worker.py");
              void (async () => {
                const isCanceled = () => job.status === "canceled";
                try {
                  job.status = "running";
                  job.stage = "starting";
                  job.message = "Starting the isolated analysis worker…";
                  let python = process.env.STUDIO_MUSIC_ANALYSIS_PYTHON;
                  if (!python) {
                    const isolatedPython = path.join(root, ".studio", "music-analysis-runtime", "Scripts", "python.exe");
                    try { await stat(isolatedPython); python = isolatedPython; } catch { python = "python"; }
                  }
                  const musicCache = path.join(root, ".studio", "music-analysis-cache");
                  await mkdir(musicCache, { recursive: true });
                  job.stage = "source-check";
                  job.message = "Checking the selected audio file…";
                  const sourceInfo = await stat(resolved.path);
                  const sourceSha256 = await sha256File(resolved.path);
                  const output: Buffer[] = [];
                  let outputBytes = 0;
                  let stderrBuffer = "";
                  const child = spawn(python, [worker, resolved.path], { cwd: root, windowsHide: true, env: { ...process.env, FLOXBOW_MUSIC_CACHE: musicCache, FLOXBOW_MUSIC_SOURCE_SHA256: sourceSha256 }, stdio: ["ignore", "pipe", "pipe"] });
                  job.child = child;
                  child.stdout?.on("data", (chunk: Buffer) => {
                    outputBytes += chunk.length;
                    if (outputBytes > 32_000_000) { child.kill(); job.error = "Music Analysis returned more than 32 MB."; return; }
                    output.push(Buffer.from(chunk));
                  });
                  child.stderr?.on("data", (chunk: Buffer) => {
                    stderrBuffer += chunk.toString("utf8");
                    const lines = stderrBuffer.split(/[\r\n]+/);
                    stderrBuffer = lines.pop() ?? "";
                    for (const line of lines) {
                      try {
                        const event = JSON.parse(line);
                        if (event.type === "progress" && typeof event.stage === "string" && typeof event.message === "string") {
                          job.stage = event.stage;
                          job.message = event.message.slice(0, 500);
                        }
                      } catch {
                        const percent = /(?:downloading|download|fetching)[^\n]*?(\d{1,3})%/i.exec(line)?.[1];
                        if (percent) job.message = `Downloading model files… ${percent}%`;
                        else if (/demix|separat|stems/i.test(line) && /\d{1,3}%/.test(line)) job.message = "Separating audio into stems…";
                      }
                    }
                  });
                  const exitCode: number = await new Promise((resolveExit, rejectExit) => {
                    child.once("error", rejectExit);
                    child.once("close", code => resolveExit(code ?? -1));
                  });
                  job.child = undefined;
                  if (isCanceled()) return;
                  if (job.error) throw new Error(job.error);
                  const resultText = Buffer.concat(output).toString("utf8").trim();
                  const workerResult = JSON.parse(resultText) as Record<string, unknown>;
                  if (exitCode !== 0 || typeof workerResult.error === "string")
                    throw new Error(typeof workerResult.error === "string" ? workerResult.error : `Analysis worker exited with code ${exitCode}.`);
                  const finalInfo = await stat(resolved.path);
                  const finalSha256 = await sha256File(resolved.path);
                  if (sourceInfo.size !== finalInfo.size || sourceSha256 !== finalSha256)
                    throw new Error("The selected audio changed during analysis. Run Music Analysis again.");
                  const report = createMusicAnalysisReport({ projectId: id, assetId: asset.id, displayName: asset.displayName, fileSha256: sourceSha256, sizeBytes: sourceInfo.size, modifiedAt: sourceInfo.mtime, worker: workerResult });
                  await saveMusicAnalysisReport(projectRoot, report);
                  job.status = "complete";
                  job.stage = "complete";
                  job.message = report.status === "complete" ? "Music Analysis report saved." : "Report saved with some analysis unavailable.";
                } catch (error) {
                  if (isCanceled()) return;
                  job.status = "failed";
                  job.stage = "failed";
                  job.error = error instanceof Error ? error.message : String(error);
                  job.message = job.error;
                } finally {
                  if (activeMusicAnalysisByProject.get(id) === job.id) activeMusicAnalysisByProject.delete(id);
                  const cleanup = setTimeout(() => musicAnalysisJobs.delete(job.id), 30 * 60 * 1000);
                  cleanup.unref();
                }
              })();
              res.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ jobId: job.id }));
              return;
            }
            if (musicAnalysisJob) {
              const jobId = decodeURIComponent(route[3] ?? "");
              const job = musicAnalysisJobs.get(jobId);
              if (!job || job.projectId !== id) {
                res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Music Analysis job not found." }));
                return;
              }
              if (req.method === "DELETE") {
                if (job.status === "queued" || job.status === "running") {
                  job.status = "canceled";
                  job.stage = "canceled";
                  job.message = "Analysis canceled.";
                  job.child?.kill();
                }
              }
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(JSON.stringify({ jobId: job.id, status: job.status, stage: job.stage, message: job.message, error: job.error }));
              return;
            }
          }
          if (poseStudioImport) {
            if (req.method !== "POST") {
              res.writeHead(405).end();
              return;
            }
            if (
              req.headers.origin !== shellOrigin ||
              !req.headers["content-type"]?.startsWith("application/json")
            ) {
              res
                .writeHead(403)
                .end("Only the studio shell can import pose assets");
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              const part = Buffer.from(chunk);
              size += part.length;
              if (size > 24_000_000)
                throw new Error("Pose import request too large");
              chunks.push(part);
            }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).some(
                (key) => key !== "revision" && key !== "poses",
              ) ||
              typeof input.revision !== "string"
            )
              throw new Error(
                "A media registry revision and pose PNG images are required.",
              );
            const saved = await registerPoseStudioPngs(
              path.join(projectsDir, id),
              input.revision,
              input.poses,
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(saved));
            return;
          }
          if (storyboardPublish) {
            if (req.method !== "POST") {
              res.writeHead(405).end();
              return;
            }
            if (
              req.headers.origin !== shellOrigin ||
              !req.headers["content-type"]?.startsWith("application/json")
            ) {
              res.writeHead(403).end("Only the studio shell can publish Storyboard images");
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              const part = Buffer.from(chunk);
              size += part.length;
              if (size > 128_000) throw new Error("Storyboard image publish request too large");
              chunks.push(part);
            }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!input || typeof input !== "object" || Array.isArray(input) ||
                Object.keys(input).some((key) => key !== "revision" && key !== "referenceIds") ||
                typeof input.revision !== "string" || !Array.isArray(input.referenceIds) ||
                input.referenceIds.some((referenceId: unknown) => typeof referenceId !== "string"))
              throw new Error("A media registry revision and Storyboard image IDs are required.");
            const savedStoryboard = await readStoryboard(path.join(projectsDir, id), id);
            const referenceIds = [...new Set(input.referenceIds as string[])];
            const references = referenceIds.map((referenceId) => {
              const reference = savedStoryboard.document.references.find((item) => item.id === referenceId);
              if (!reference || !reference.file)
                throw new Error(`Storyboard image is not saved in the project: ${referenceId}`);
              if (reference.file !== `assets/storyboard/references/${reference.id}.png`)
                throw new Error(`Storyboard image path is invalid: ${referenceId}`);
              return { id: reference.id, name: reference.name };
            });
            const saved = await registerStoryboardPngs(
              path.join(projectsDir, id),
              input.revision,
              references,
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(saved));
            return;
          }
          if (transcription) {
            if (req.method !== "POST") {
              res.writeHead(405).end();
              return;
            }
            if (
              req.headers.origin !== shellOrigin ||
              !req.headers["content-type"]?.startsWith("application/json")
            ) {
              res.writeHead(403, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                  message: "Only the studio shell can request transcription.",
                }),
              );
              return;
            }
            if (built) {
              res.writeHead(409, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                  message:
                    "Local transcription is available in the live development workspace.",
                }),
              );
              return;
            }
            let body = "";
            for await (const chunk of req) {
              body += chunk.toString();
              if (Buffer.byteLength(body) > 2048)
                throw new Error("Transcription request too large");
            }
            const input = JSON.parse(body) as {
              fps?: unknown;
              durationInFrames?: unknown;
              sourceClipId?: unknown;
              timelineStartFrame?: unknown;
              sourceStartSeconds?: unknown;
              sourceDurationSeconds?: unknown;
            };
            if (
              !input ||
              Object.keys(input).some(
                (key) =>
                  ![
                    "fps",
                    "durationInFrames",
                    "sourceClipId",
                    "timelineStartFrame",
                    "sourceStartSeconds",
                    "sourceDurationSeconds",
                  ].includes(key),
              ) ||
              typeof input.fps !== "number" ||
              !Number.isInteger(input.fps) ||
              input.fps < 1 ||
              input.fps > 240 ||
              typeof input.durationInFrames !== "number" ||
              !Number.isInteger(input.durationInFrames) ||
              input.durationInFrames < 1 ||
              input.durationInFrames > input.fps * 60 * 60 * 24
            )
              throw new Error("The editable project duration is invalid.");
            const projectRoot = path.join(projectsDir, id);
            const registry = await readMediaRegistry(projectRoot);
            const resolved = await resolveMedia(
              projectRoot,
              registry.registry,
              transcriptionAssetId,
            );
            if (resolved.status !== "ready") {
              res
                .writeHead(resolved.status === "missing" ? 404 : 422, {
                  "Content-Type": "application/json",
                })
                .end(
                  JSON.stringify({
                    message:
                      resolved.status === "missing"
                        ? "The selected audio file is missing."
                        : resolved.message,
                  }),
                );
              return;
            }
            const videoSource = resolved.type === "video";
            if (
              resolved.type !== "audio" &&
              (!videoSource ||
                typeof input.sourceClipId !== "string" ||
                !/^[A-Za-z0-9_-]{1,120}$/.test(input.sourceClipId) ||
                !Number.isInteger(input.timelineStartFrame) ||
                (input.timelineStartFrame as number) < 0 ||
                (input.timelineStartFrame as number) >=
                  (input.durationInFrames as number) ||
                typeof input.sourceStartSeconds !== "number" ||
                !Number.isFinite(input.sourceStartSeconds) ||
                input.sourceStartSeconds < 0 ||
                typeof input.sourceDurationSeconds !== "number" ||
                !Number.isFinite(input.sourceDurationSeconds) ||
                input.sourceDurationSeconds <= 0 ||
                input.sourceDurationSeconds > 86_400 ||
                (input.timelineStartFrame as number) +
                  Math.round(
                    input.sourceDurationSeconds * (input.fps as number),
                  ) >
                  (input.durationInFrames as number))
            ) {
              res.writeHead(422, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  message:
                    "Choose an audio asset or a Timeline video clip with valid embedded-audio timing.",
                }),
              );
              return;
            }
            try {
              const timelineStartSeconds = videoSource
                ? (input.timelineStartFrame as number) / (input.fps as number)
                : 0;
              if (videoSource) {
                const video = await probeVideo(resolved.path);
                const sourceEnd =
                  (input.sourceStartSeconds as number) +
                  (input.sourceDurationSeconds as number);
                if (
                  sourceEnd >
                  video.durationInSeconds + 1 / (input.fps as number)
                )
                  throw new Error(
                    "The selected video clip timing exceeds the registered video duration.",
                  );
              }
              const availableDuration =
                (input.durationInFrames as number) / (input.fps as number) -
                timelineStartSeconds;
              const raw = videoSource
                ? await (options.transcribeVideoAudio
                    ? options.transcribeVideoAudio(
                        resolved.path,
                        input.sourceStartSeconds as number,
                        input.sourceDurationSeconds as number,
                      )
                    : transcribeVideoClipAudio(
                        resolved.path,
                        input.sourceStartSeconds as number,
                        input.sourceDurationSeconds as number,
                        undefined,
                        options.transcribeAudio,
                      ))
                : await (options.transcribeAudio ?? transcribeAudioWithWhisper)(
                    resolved.path,
                  );
              const result = whisperResultToSubtitleTiming(
                raw,
                Math.min(
                  availableDuration,
                  videoSource
                    ? (input.sourceDurationSeconds as number)
                    : availableDuration,
                ),
              );
              const timing = videoSource
                ? {
                    ...result.timing,
                    segments: result.timing.segments.map((segment) => ({
                      ...segment,
                      start: segment.start + timelineStartSeconds,
                      end: segment.end + timelineStartSeconds,
                    })),
                  }
                : result.timing;
              const response = JSON.stringify({ ...result, timing });
              if (Buffer.byteLength(response) > 1_000_000)
                throw new Error(
                  "The Whisper result is too large to transfer safely. Try a shorter audio file.",
                );
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(response);
            } catch (error) {
              res.writeHead(422, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                  message:
                    error instanceof Error
                      ? error.message
                      : "Local Whisper transcription failed.",
                }),
              );
            }
            return;
          }
          if (imageThumbnail && req.method !== "GET") {
            res.writeHead(405).end();
            return;
          }
          if (videoProbe && req.method !== "GET") {
            res.writeHead(405).end();
            return;
          }
          if (built) {
            res
              .writeHead(409)
              .end(
                "Media registration is available in the live development workspace.",
              );
            return;
          }
          const projectRoot = path.join(projectsDir, id);
          if (imageThumbnail) {
            await streamRegisteredImage(
              projectRoot,
              decodeURIComponent(route[2]),
              res,
            );
            return;
          }
          if (videoProbe) {
            const videoAssetId = decodeURIComponent(route[2]);
            const registry = await readMediaRegistry(projectRoot);
            const resolved = await resolveMedia(
              projectRoot,
              registry.registry,
              videoAssetId,
            );
            if (resolved.status !== "ready") {
              res.writeHead(resolved.status === "missing" ? 404 : 422, {
                "Content-Type": "application/json",
              });
              res.end(
                JSON.stringify({
                  message:
                    resolved.status === "missing"
                      ? "The selected video file is missing."
                      : resolved.message,
                }),
              );
              return;
            }
            if (resolved.type !== "video") {
              res.writeHead(422, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  message: "The requested media asset is not a video.",
                }),
              );
              return;
            }
            try {
              const metadata = await probeVideo(resolved.path);
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(JSON.stringify({ assetId: videoAssetId, ...metadata }));
            } catch (error) {
              res.writeHead(422, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  message:
                    error instanceof Error
                      ? error.message
                      : "The selected MP4 video could not be decoded.",
                }),
              );
            }
            return;
          }
          if (soundtrackProbe) {
            if (req.method !== "GET") {
              res.writeHead(405).end();
              return;
            }
            const registry = await readMediaRegistry(projectRoot);
            const resolved = await resolveMedia(
              projectRoot,
              registry.registry,
              probedAssetId,
            );
            if (resolved.status !== "ready") {
              res.writeHead(resolved.status === "missing" ? 404 : 422, {
                "Content-Type": "application/json",
              });
              res.end(
                JSON.stringify({
                  message:
                    resolved.status === "missing"
                      ? "The selected audio file is missing."
                      : resolved.message,
                }),
              );
              return;
            }
            if (resolved.type !== "audio") {
              res.writeHead(422, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  message: "The soundtrack must be an audio asset.",
                }),
              );
              return;
            }
            let durationInSeconds: number;
            try {
              durationInSeconds = await probeAudioDuration(resolved.path);
            } catch (error) {
              res.writeHead(422, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  message:
                    error instanceof Error
                      ? error.message
                      : "The selected audio could not be decoded.",
                }),
              );
              return;
            }
            const asset = registry.registry.assets.find(
              (item) => item.id === probedAssetId,
            )!;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                assetId: probedAssetId,
                displayName: asset.displayName,
                durationInSeconds,
              }),
            );
            return;
          }
          if (removingAsset) {
            if (req.method !== "DELETE") {
              res.writeHead(405).end();
              return;
            }
            if (
              req.headers.origin !== shellOrigin ||
              !req.headers["content-type"]?.startsWith("application/json")
            ) {
              res
                .writeHead(403)
                .end("Only the studio shell can remove media assets");
              return;
            }
            let body = "";
            for await (const chunk of req) {
              body += chunk.toString();
              if (Buffer.byteLength(body) > 2_048)
                throw new Error("Media request too large");
            }
            const input = JSON.parse(body);
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length !== 1 ||
              typeof input.revision !== "string"
            )
              throw new Error(
                "A media registry revision is required; arbitrary file data is not accepted",
              );

            try {
              const saved = await removeMediaAsset(
                projectRoot,
                assetId,
                input.revision,
              );
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ revision: saved.revision }));
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.startsWith("The media asset is not registered:")
              ) {
                res.writeHead(404).end(error.message);
                return;
              }
              throw error;
            }
            return;
          }
          if (req.method === "GET") {
            const snapshot = await readMediaWithAvailability(projectRoot);
            const availability = new Map(
              snapshot.availability.map((entry) => [
                entry.assetId,
                publicMediaAvailability(entry),
              ]),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                revision: snapshot.revision,
                assets: snapshot.registry.assets.map((asset) => ({
                  id: asset.id,
                  type: asset.type,
                  displayName: asset.displayName,
                  status: availability.get(asset.id)?.status ?? "invalid",
                  message: availability.get(asset.id)?.message,
                })),
              }),
            );
            return;
          }
          if (req.method !== "POST") {
            res.writeHead(405).end();
            return;
          }
          if (
            req.headers.origin !== shellOrigin ||
            !req.headers["content-type"]?.startsWith("application/json")
          ) {
            res.writeHead(403).end("Only the studio shell can register media");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 2_048)
              throw new Error("Media request too large");
          }
          const input = JSON.parse(body);
          if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            Object.keys(input).some(
              (key) => key !== "revision" && key !== "type",
            ) ||
            typeof input.revision !== "string" ||
            (input.type !== undefined &&
              input.type !== "audio" &&
              input.type !== "image" &&
              input.type !== "video")
          )
            throw new Error(
              "A media registry revision and supported media type are required; file paths are not accepted",
            );

          const current = await readMediaRegistry(projectRoot);
          if (current.revision !== input.revision) {
            res
              .writeHead(409)
              .end(
                "CONFLICT: The media registry changed. Reload it before adding media.",
              );
            return;
          }
          const mediaType = input.type ?? "audio";
          const selectedPath = await (
            options.mediaFilePicker ??
            (mediaType === "audio" && options.audioFilePicker
              ? () => options.audioFilePicker!()
              : () => pickMediaFile(mediaType))
          )(mediaType);
          if (!selectedPath) {
            res.writeHead(204).end();
            return;
          }
          const saved = await registerMediaAsset(
            projectRoot,
            selectedPath,
            mediaType,
            input.revision,
          );
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ revision: saved.revision }));
          return;
        }
        if (isShell && pathname === "/api/projects" && req.method === "POST") {
          if (built) {
            res
              .writeHead(409)
              .end(
                "Project creation is available in the live development workspace. Restart with npm run dev to edit source projects.",
              );
            return;
          }
          if (
            req.headers.origin !== shellOrigin ||
            !req.headers["content-type"]?.startsWith("application/json")
          ) {
            res
              .writeHead(403)
              .end("Only the studio shell can create a project");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 2048)
              throw new Error("Project request too large");
          }
          const input = JSON.parse(body);
          if (typeof input.id !== "string")
            throw new Error("Project ID is required");
          const width = input.width ?? 1920;
          const height = input.height ?? 1080;
          if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width < 16 || width > 7680 ||
            height < 16 || height > 7680
          )
            throw new Error("Canvas dimensions must be whole numbers between 16 and 7680 pixels.");
          const project = await createProject(projectsDir, input.id, width, height);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ project: { id: project.id, manifest: project } }),
          );
          return;
        }
        if (isShell && pathname.startsWith("/api/projects/") && req.method === "DELETE") {
          if (built) {
            res.writeHead(409).end("Project deletion is available in the live development workspace.");
            return;
          }
          if (req.headers.origin !== shellOrigin) {
            res.writeHead(403).end("Only the studio shell can delete a project");
            return;
          }
          const id = decodeURIComponent(pathname.slice("/api/projects/".length));
          const project = (await getProjects()).find((candidate: { id: string }) => candidate.id === id);
          if (!project) {
            res.writeHead(404).end("Project not found");
            return;
          }
          try {
            await removeProject(projectsDir, id);
          } catch (error) {
            if (error instanceof Error && error.message.includes("outside the local projects directory")) {
              res.writeHead(400).end(error.message);
              return;
            }
            throw error;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ id, deleted: true }));
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405).end();
          return;
        }
        if (pathname === "/api/projects") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(await getProjects()));
          return;
        }
        if (isShell && pathname === "/api/capability-resource") {
          const relative =
            new URL(req.url ?? "/", "http://localhost").searchParams.get(
              "path",
            ) ?? "";
          if (!(
            relative.startsWith("docs/") || relative.startsWith("examples/")
          ))
            throw new Error("Only public docs and examples can be opened here");
          if (!/\.(md|tsx|ts)$/.test(relative))
            throw new Error("Unsupported capability resource type");
          const file = await safeFile(root, relative);
          const info = await stat(file);
          if (info.size > 500_000)
            throw new Error("Capability resource is too large");
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(await readFile(file, "utf8"));
          return;
        }
        if (isShell && pathname === "/api/state") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              previewOrigin,
              built,
              projects: await getProjects(),
            }),
          );
          return;
        }
        if (isShell && pathname.startsWith("/api/timeline/")) {
          const id = pathname.slice("/api/timeline/".length);
          const p = (await getProjects()).find(
            (p: { id: string }) => p.id === id,
          );
          if (!p?.manifest?.timeline)
            throw new Error("No timeline for this project");
          res.setHeader("Content-Type", "application/json");
          res.end(
            await readFile(
              await safeFile(path.join(projectsDir, id), p.manifest.timeline),
            ),
          );
          return;
        }
        if (vite) {
          if (pathname === "/" || pathname === "/preview.html") {
            const htmlFile = isShell
              ? path.join(dir, "index.html")
              : path.join(root, "apps/desktop/preview.html");
            let html = await readFile(htmlFile, "utf8");
            if (!isShell)
              html = html.replace(
                "/src/preview.tsx",
                "/apps/desktop/src/preview.tsx",
              );
            res.setHeader("Content-Type", "text/html");
            res.end(await vite.transformIndexHtml(req.url!, html));
            return;
          }
          vite.middlewares(req, res, () => {
            res.writeHead(404).end("Not found");
          });
          return;
        }
        const relative = decodeURIComponent(
          pathname === "/" ? "/index.html" : pathname,
        ).slice(1);
        const file = await safeFile(dir, relative);
        res.setHeader(
          "Content-Type",
          mime[path.extname(file)] ?? "application/octet-stream",
        );
        res.setHeader("Content-Length", (await stat(file)).size);
        res.end(await readFile(file));
      } catch (e) {
        res
          .writeHead(
            e instanceof Error && e.message.startsWith("CONFLICT:") ? 409 : 400,
            { "Content-Type": "text/plain" },
          )
          .end(e instanceof Error ? e.message : String(e));
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen((isShell ? 5173 : 5174) + portOffset, "127.0.0.1", resolve);
    });
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  }
  try {
    previewOrigin = await make("preview");
    shellOrigin = await make("shell");
  } catch (error) {
    await Promise.all(vites.map((v) => v.close()));
    servers.forEach((s) => s.close());
    throw error;
  }
  return {
    url: shellOrigin + "/",
    previewOrigin,
    close: async () => {
      for (const job of musicAnalysisJobs.values()) {
        if (job.status === "queued" || job.status === "running") {
          job.status = "canceled";
          job.child?.kill();
        }
      }
      await Promise.all(vites.map((v) => v.close()));
      await Promise.all(
        servers.map(
          (s) => new Promise<void>((resolve) => s.close(() => resolve())),
        ),
      );
    },
  };
}
