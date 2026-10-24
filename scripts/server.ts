import { createServer as createViteServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { discover, safeFile } from "@motion/project-loader";
import { readEditor, saveEditor } from "./editor-store";
import {
  publicMediaAvailability,
  readMediaRegistry,
  readMediaWithAvailability,
  registerMediaAsset,
  removeMediaAsset,
} from "./media-store";
import { pickMediaFile } from "./audio-file-picker";
import { createProject } from "./project-scaffold";
import { streamRegisteredImage, streamRegisteredMedia } from "./media-stream";
import { probeAudioDuration } from "./audio-probe";
import { probeVideo } from "./video-probe";
import { resolveMedia } from "@motion/project-loader/media";
import { whisperResultToSubtitleTiming } from "@motion/lyrics-sync/subtitles";
import { transcribeAudioWithWhisper } from "./whisper-service";
import { transcribeVideoClipAudio } from "./video-transcription";
import {
  readProjectSettings,
  saveProjectCanvasSize,
} from "./project-settings";
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
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; frame-src ${preview}; object-src 'none'; base-uri 'none'`;
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
export async function startServers(
  built = false,
  portOffset = 0,
  options: ServerOptions = {},
) {
  let previewOrigin = "";
  let shellOrigin = "";
  const servers: http.Server[] = [];
  const vites: ViteDevServer[] = [];
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
            !file.endsWith(".tmp")
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
            res.writeHead(403).end("Only the studio shell can change Canvas settings");
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
            if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
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
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
          return;
        }
        const mediaStream =
          /^\/api\/media\/([a-z0-9-]+)\/assets\/([a-z0-9-]+)\/stream$/.exec(
            pathname,
          );
        if (
          !isShell &&
          mediaStream &&
          (req.method === "GET" || req.method === "HEAD")
        ) {
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
            !videoProbe
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
                ? (input.timelineStartFrame as number) /
                  (input.fps as number)
                : 0;
              if (videoSource) {
                const video = await probeVideo(resolved.path);
                const sourceEnd =
                  (input.sourceStartSeconds as number) +
                  (input.sourceDurationSeconds as number);
                if (sourceEnd > video.durationInSeconds + 1 / (input.fps as number))
                  throw new Error(
                    "The selected video clip timing exceeds the registered video duration.",
                  );
              }
              const availableDuration =
                (input.durationInFrames as number) /
                  (input.fps as number) -
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
                : await (options.transcribeAudio ??
                    transcribeAudioWithWhisper)(resolved.path);
              const result = whisperResultToSubtitleTiming(
                raw,
                Math.min(
                  availableDuration,
                  videoSource
                    ? input.sourceDurationSeconds as number
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
          const project = await createProject(projectsDir, input.id);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ project: { id: project.id, manifest: project } }),
          );
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
      await Promise.all(vites.map((v) => v.close()));
      await Promise.all(
        servers.map(
          (s) => new Promise<void>((resolve) => s.close(() => resolve())),
        ),
      );
    },
  };
}
