import { createRoot } from "react-dom/client";
import { mountPreview } from "@motion/player/host";
import type { ProjectManifest } from "@motion/project-loader/schema";
const mediaPlaybackErrorEvent = "motion-preview-media-error";
function fail(error: unknown) {
  const container = document.getElementById("root")!;
  container.replaceChildren();
  const message = document.createElement("pre");
  message.setAttribute("role", "alert");
  message.textContent = `Preview could not load. Fix the project file, then use Reload preview.\n\n${String(error)}`;
  container.append(message);
}
function reportMediaPlaybackError(error: unknown) {
  const message = String(error);
  if (
    !/MediaPlaybackError|PIPELINE_ERROR_READ|FFmpegDemuxer|while playing the video/i.test(
      message,
    )
  )
    return false;
  window.dispatchEvent(
    new CustomEvent(mediaPlaybackErrorEvent, { detail: { message } }),
  );
  return true;
}
window.addEventListener("error", (event) => {
  if (reportMediaPlaybackError(event.message)) event.preventDefault();
  else fail(event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  if (reportMediaPlaybackError(event.reason)) event.preventDefault();
  else fail(event.reason);
});
const id = new URLSearchParams(location.search).get("project");
try {
  const res = await fetch(`/api/projects`);
  const list = await res.json();
  const project = list.find((p: { id: string }) => p.id === id);
  if (!project?.manifest)
    throw new Error(project?.error ?? "Project not found");
  const manifest: ProjectManifest = project.manifest;
  const module = await import(
    /* @vite-ignore */ `/projects/${manifest.id}/${manifest.entry}`
  );
  if (typeof module.default !== "function")
    throw new Error("Composition must default-export a React component");
  mountPreview(module, manifest);
} catch (error) {
  fail(error);
}
if (import.meta.hot) {
  import.meta.hot.on("vite:error", (payload) => fail(payload.err.message));
  import.meta.hot.on("vite:afterUpdate", () =>
    window.dispatchEvent(new Event("project-module-updated")),
  );
  import.meta.hot.on("studio:change", () => location.reload());
}
