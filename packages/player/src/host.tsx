import { useEffect, useRef, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import type { PlayerRef, CallbackListener } from "@remotion/player";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  serializableComponentInfo,
  standaloneTextModule,
  standaloneImageModule,
  type EditableVideoProps,
  type EditableComponent,
} from "@motion/sdk/editor";
import {
  componentInfosSchema,
  parseEditTimeline,
  type EditTimeline,
} from "@motion/sdk/timeline";
import { timelinePlaybackEnd } from "@motion/sdk/timeline-analysis";
import { StudioPlayer } from "./index";
type VideoModule = {
  default: ComponentType<EditableVideoProps>;
  editorComponents?: EditableComponent[];
};
function PreviewHost({
  module,
  manifest,
}: {
  module: VideoModule;
  manifest: ProjectManifest;
}) {
  const player = useRef<PlayerRef>(null);
  const [timeline, setTimeline] = useState<EditTimeline>();
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const [error, setError] = useState("");
  const playbackCheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configuredPlaybackEnd = useRef(manifest.durationInFrames);
  const activePlaybackEnd = useRef(manifest.durationInFrames);
  const sourcesFor = (document: EditTimeline, componentId: string) =>
    Object.fromEntries(
      document.clips
        .filter(
          (c) =>
            c.componentId === componentId &&
            typeof c.content.assetId === "string" &&
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.content.assetId),
        )
        .map((c) => [
          String(c.content.assetId),
          `${location.origin}/api/media/${encodeURIComponent(manifest.id)}/assets/${encodeURIComponent(String(c.content.assetId))}/stream`,
        ]),
    );
  const audioSources = timeline ? sourcesFor(timeline, "soundtrack") : {};
  const imageSources = timeline ? sourcesFor(timeline, "image") : undefined;
  const requestedParentOrigin =
    new URLSearchParams(location.search).get("hostOrigin") ?? "";
  const previewPort = Number(location.port);
  const expectedParentOrigin =
    Number.isInteger(previewPort) && previewPort > 1
      ? `http://127.0.0.1:${previewPort - 1}`
      : "";
  const parentOrigin =
    requestedParentOrigin === expectedParentOrigin ? requestedParentOrigin : "";
  useEffect(() => {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(parentOrigin)) return;
    const send = (type: string, extra: Record<string, unknown> = {}) =>
      parent.postMessage(
        { channel: "motion-editor-v1", projectId: manifest.id, type, ...extra },
        parentOrigin,
      );
    const mediaError = (event: Event) => {
      if (event.target instanceof HTMLAudioElement) {
        const message =
          "The selected audio could not be decoded or played. Check that the MP3/WAV is available and supported.";
        setError(message);
        send("error", { message });
      }
    };
    const ready = () => {
      const components = componentInfosSchema.parse(
        [
          standaloneTextModule,
          standaloneImageModule,
          ...(module.editorComponents ?? []).filter(
            (component) =>
              component.id !== standaloneTextModule.id &&
              component.id !== standaloneImageModule.id,
          ),
        ].map(serializableComponentInfo),
      );
      send("ready", { components });
    };
    const report = () =>
      send("frame", {
        frame: player.current?.getCurrentFrame() ?? 0,
        playing: player.current?.isPlaying() ?? false,
      });
    const onFrame: CallbackListener<"frameupdate"> = () => {
      const currentPlayer = player.current;
      const currentFrame = currentPlayer?.getCurrentFrame() ?? 0;
      if (
        currentPlayer?.isPlaying() &&
        currentFrame + 1 >= activePlaybackEnd.current
      ) {
        currentPlayer.pause();
        report();
        return;
      }
      report();
    };
    const onPlay = () => {
      const currentFrame = player.current?.getCurrentFrame() ?? 0;
      const duration =
        timelineRef.current?.durationInFrames ?? manifest.durationInFrames;
      activePlaybackEnd.current =
        currentFrame >= configuredPlaybackEnd.current
          ? duration
          : configuredPlaybackEnd.current;
      report();
    };
    const clearPlaybackCheck = () => {
      if (playbackCheck.current) {
        clearTimeout(playbackCheck.current);
        playbackCheck.current = null;
      }
    };
    const receive = (e: MessageEvent) => {
      if (
        e.source !== parent ||
        e.origin !== parentOrigin ||
        e.data?.channel !== "motion-editor-v1" ||
        e.data.projectId !== manifest.id
      )
        return;
      try {
        switch (e.data.type) {
          case "hello":
            ready();
            report();
            break;
          case "document": {
            const next = parseEditTimeline(e.data.timeline);
            if (next.fps !== manifest.fps)
              throw new Error("Timeline FPS does not match project.json");
            timelineRef.current = next;
            configuredPlaybackEnd.current = timelinePlaybackEnd(next);
            activePlaybackEnd.current = configuredPlaybackEnd.current;
            setTimeline(next);
            setError("");
            break;
          }
          case "playback-boundary": {
            const duration =
              timelineRef.current?.durationInFrames ??
              manifest.durationInFrames;
            if (
              !Number.isInteger(e.data.endFrame) ||
              e.data.endFrame < 1 ||
              e.data.endFrame > duration
            )
              throw new Error("The preview playback boundary is invalid.");
            configuredPlaybackEnd.current = e.data.endFrame;
            const currentFrame = player.current?.getCurrentFrame() ?? 0;
            activePlaybackEnd.current =
              currentFrame >= e.data.endFrame ? duration : e.data.endFrame;
            break;
          }
          case "inspect-frame": {
            if (
              typeof e.data.requestId !== "string" ||
              e.data.requestId.length > 80
            )
              break;
            requestAnimationFrame(() => {
              const root = document.querySelector<HTMLElement>(
                "[data-flox-composition-root='true']",
              );
              const bounds = root?.getBoundingClientRect();
              if (!root || !bounds || bounds.width <= 0 || bounds.height <= 0) {
                send("inspect-frame-result", {
                  requestId: e.data.requestId,
                  error: "Composition bounds are unavailable.",
                });
                return;
              }
              const currentFrame = Math.round(
                player.current?.getCurrentFrame() ?? 0,
              );
              const scaleX = bounds.width / manifest.width;
              const scaleY = bounds.height / manifest.height;
              const nodes = Array.from(
                root.querySelectorAll<HTMLElement>("[data-flox-visual-id]"),
              ).flatMap((element, index) => {
                const rect = element.getBoundingClientRect();
                const left = Math.max(bounds.left, rect.left);
                const top = Math.max(bounds.top, rect.top);
                const right = Math.min(bounds.right, rect.right);
                const bottom = Math.min(bounds.bottom, rect.bottom);
                if (right <= left || bottom <= top) return [];
                let opacity = 1;
                let visible = true;
                for (
                  let current: HTMLElement | null = element;
                  current && current !== root;
                  current = current.parentElement
                ) {
                  const style = getComputedStyle(current);
                  opacity *= Number.parseFloat(style.opacity || "1");
                  if (
                    style.display === "none" ||
                    style.visibility === "hidden" ||
                    opacity <= 0.01
                  ) {
                    visible = false;
                    break;
                  }
                }
                if (!visible) return [];
                const owner = element.closest<HTMLElement>(
                  "[data-flox-clip-id]",
                );
                const clipId = owner?.dataset.floxClipId;
                const clip = timelineRef.current?.clips.find(
                  (item) => item.id === clipId,
                );
                const value = (number: number) =>
                  Math.round(number * 100) / 100;
                const text = (
                  element.innerText ||
                  element.getAttribute("alt") ||
                  ""
                )
                  .trim()
                  .replace(/\s+/g, " ")
                  .slice(0, 300);
                return [
                  {
                    id: element.dataset.floxVisualId ?? "",
                    label:
                      element.dataset.floxLabel ??
                      element.getAttribute("aria-label") ??
                      element.tagName.toLowerCase(),
                    editability:
                      element.dataset.floxEditability ?? "unclassified",
                    editTarget: element.dataset.floxEditTarget ?? null,
                    clipId: clipId ?? null,
                    trackId: owner?.dataset.floxTrackId ?? null,
                    componentId: owner?.dataset.floxComponentId ?? null,
                    clipLocalFrame:
                      clip && currentFrame >= clip.from
                        ? currentFrame - clip.from
                        : null,
                    text: text || null,
                    visible: true,
                    opacity: value(opacity),
                    bounds: {
                      x: value((left - bounds.left) / scaleX),
                      y: value((top - bounds.top) / scaleY),
                      width: value((right - left) / scaleX),
                      height: value((bottom - top) / scaleY),
                    },
                    domOrder: index,
                    boundsKind: "dom-border-box",
                    zIndex: getComputedStyle(element).zIndex,
                  },
                ];
              });
              send("inspect-frame-result", {
                requestId: e.data.requestId,
                frame: currentFrame,
                width: manifest.width,
                height: manifest.height,
                fps: manifest.fps,
                durationInFrames:
                  timelineRef.current?.durationInFrames ??
                  manifest.durationInFrames,
                nodes,
              });
            });
            break;
          }
          case "seek":
            if (Number.isInteger(e.data.frame)) {
              const duration =
                timelineRef.current?.durationInFrames ??
                manifest.durationInFrames;
              const frame = Math.max(0, Math.min(duration - 1, e.data.frame));
              if (player.current?.isPlaying())
                activePlaybackEnd.current =
                  frame >= configuredPlaybackEnd.current
                    ? duration
                    : configuredPlaybackEnd.current;
              player.current?.seekTo(frame);
              report();
            }
            break;
          case "play":
            clearPlaybackCheck();
            onPlay();
            player.current?.play();
            if (
              timelineRef.current?.clips.some(
                (clip) => clip.componentId === "soundtrack",
              )
            )
              playbackCheck.current = setTimeout(() => {
                playbackCheck.current = null;
                const audio = document.querySelector<HTMLAudioElement>(
                  'audio[src*="/api/media/"]',
                );
                if (audio?.paused && player.current?.isPlaying()) {
                  const message =
                    "Audio playback is blocked by browser settings. Allow sound for FloxBow, then press Play again.";
                  player.current.pause();
                  setError(message);
                  send("error", { message });
                  report();
                }
              }, 2000);
            break;
          case "pause":
            clearPlaybackCheck();
            player.current?.pause();
            report();
            break;
        }
      } catch (e) {
        setError(String(e));
        send("error", { message: String(e) });
      }
    };
    const refreshMetadata = () => ready();
    window.addEventListener("message", receive);
    window.addEventListener("project-module-updated", refreshMetadata);
    document.addEventListener("error", mediaError, true);
    const p = player.current;
    p?.addEventListener("frameupdate", onFrame);
    p?.addEventListener("play", onPlay);
    p?.addEventListener("pause", report);
    p?.addEventListener("seeked", report);
    ready();
    report();
    return () => {
      clearPlaybackCheck();
      window.removeEventListener("message", receive);
      window.removeEventListener("project-module-updated", refreshMetadata);
      document.removeEventListener("error", mediaError, true);
      p?.removeEventListener("frameupdate", onFrame);
      p?.removeEventListener("play", onPlay);
      p?.removeEventListener("pause", report);
      p?.removeEventListener("seeked", report);
    };
  }, [parentOrigin, module, manifest]);
  return (
    <>
      {error && <pre role="alert">{error}</pre>}
      <StudioPlayer
        composition={module.default}
        manifest={{
          ...manifest,
          durationInFrames:
            timeline?.durationInFrames ?? manifest.durationInFrames,
        }}
        playerRef={player}
        inputProps={{ timeline, audioSources, imageSources }}
      />
    </>
  );
}
export function mountPreview(module: VideoModule, manifest: ProjectManifest) {
  createRoot(document.getElementById("root")!).render(
    <PreviewHost module={module} manifest={manifest} />,
  );
}
