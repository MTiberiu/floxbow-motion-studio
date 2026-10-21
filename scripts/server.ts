import { createServer as createViteServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { discover, safeFile } from "@motion/project-loader";
import {readEditor,saveEditor} from './editor-store';
import { readMediaRegistry, readMediaWithAvailability, registerAudioAsset, publicMediaAvailability } from "./media-store";
import { pickAudioFile } from "./audio-file-picker";
import { createProject } from "./project-scaffold";
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
};
export async function startServers(built = false, portOffset = 0, options: ServerOptions = {}) {
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
            watch:{ignored:['**/.studio/**','**/out/**','**/dist/**']},
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
          if (file.replaceAll("\\", "/").includes("/projects/") && !file.endsWith('.tmp')) {
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
        if(isShell&&pathname.startsWith('/api/edit/')){
          const id=pathname.slice('/api/edit/'.length);const p=(await getProjects()).find((p:{id:string})=>p.id===id);
          if(!p?.manifest)throw new Error('Unknown project');
          let result;
          if(req.method==='PUT'){
            if(req.headers.origin!==shellOrigin||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403).end('Only the studio shell can save a timeline');return;}
            let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>2_000_000)throw new Error('Timeline too large');}
            const data=JSON.parse(body);result=await saveEditor(path.join(projectsDir,id),p.manifest,data.timeline,data.revision);
          }else if(req.method==='GET')result=await readEditor(path.join(projectsDir,id),p.manifest);
          else {res.writeHead(405).end();return;}
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
        }
        if (isShell && pathname.startsWith("/api/media/")) {
          const id = decodeURIComponent(pathname.slice("/api/media/".length));
          const project = (await getProjects()).find(
            (candidate: { id: string; manifest?: unknown }) => candidate.id === id,
          );
          if (!project?.manifest) {
            res.writeHead(404).end("Unknown project");
            return;
          }
          if (built) {
            res.writeHead(409).end("Media registration is available in the live development workspace.");
            return;
          }
          const projectRoot = path.join(projectsDir, id);
          if (req.method === "GET") {
            const snapshot = await readMediaWithAvailability(projectRoot);
            const availability = new Map(
              snapshot.availability.map((entry) => [entry.assetId, publicMediaAvailability(entry)]),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              revision: snapshot.revision,
              assets: snapshot.registry.assets.map((asset) => ({
                id: asset.id,
                type: asset.type,
                displayName: asset.displayName,
                status: availability.get(asset.id)?.status ?? "invalid",
                message: availability.get(asset.id)?.message,
              })),
            }));
            return;
          }
          if (req.method !== "POST") {
            res.writeHead(405).end();
            return;
          }
          if (req.headers.origin !== shellOrigin || !req.headers["content-type"]?.startsWith("application/json")) {
            res.writeHead(403).end("Only the studio shell can register audio");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 2_048) throw new Error("Media request too large");
          }
          const input = JSON.parse(body);
          if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            Object.keys(input).length !== 1 ||
            typeof input.revision !== "string"
          )
            throw new Error("A media registry revision is required; file paths are not accepted");

          const current = await readMediaRegistry(projectRoot);
          if (current.revision !== input.revision) {
            res.writeHead(409).end("CONFLICT: The media registry changed. Reload it before adding audio.");
            return;
          }
          const selectedPath = await (options.audioFilePicker ?? pickAudioFile)();
          if (!selectedPath) {
            res.writeHead(204).end();
            return;
          }
          const saved = await registerAudioAsset(projectRoot, selectedPath, input.revision);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ revision: saved.revision }));
          return;
        }
        if (isShell && pathname === "/api/projects" && req.method === "POST") {
          if (built) {
            res.writeHead(409).end("Project creation is available in the live development workspace. Restart with npm run dev to edit source projects.");
            return;
          }
          if (req.headers.origin !== shellOrigin || !req.headers["content-type"]?.startsWith("application/json")) {
            res.writeHead(403).end("Only the studio shell can create a project");
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 2048) throw new Error("Project request too large");
          }
          const input = JSON.parse(body);
          if (typeof input.id !== "string") throw new Error("Project ID is required");
          const project = await createProject(projectsDir, input.id);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ project: { id: project.id, manifest: project } }));
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
          const relative = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? "";
          if (!(relative.startsWith("docs/") || relative.startsWith("examples/")))
            throw new Error("Only public docs and examples can be opened here");
          if (!/\.(md|tsx|ts)$/.test(relative)) throw new Error("Unsupported capability resource type");
          const file = await safeFile(root, relative);
          const info = await stat(file);
          if (info.size > 500_000) throw new Error("Capability resource is too large");
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
          .writeHead(e instanceof Error&&e.message.startsWith('CONFLICT:')?409:400, { "Content-Type": "text/plain" })
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
