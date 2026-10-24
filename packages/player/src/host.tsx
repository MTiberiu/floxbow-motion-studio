import { useEffect, useRef, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import type { PlayerRef, CallbackListener } from "@remotion/player";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  serializableComponentInfo,
  standaloneTextModule,
  standaloneImageModule,
  standaloneVideoModule,
  type EditableVideoProps,
  type EditableComponent,
} from "@motion/sdk/editor";
import {
  componentInfosSchema,
  parseEditTimeline,
  type EditTimeline,
} from "@motion/sdk/timeline";
import { timelinePlaybackEnd } from "@motion/sdk/timeline-analysis";
import { pendingSeekTarget } from "./seek-sync";
import { isValidMasterVolume } from "./master-volume";
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
  const pendingSeekFrame = useRef<number | null>(null);
  const [timeline, setTimeline] = useState<EditTimeline>();
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const [error, setError] = useState("");
  const [masterVolume, setMasterVolume] = useState(1);
  const playbackCheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configuredPlaybackEnd = useRef(manifest.durationInFrames);
  const activePlaybackEnd = useRef(manifest.durationInFrames);
  const endedAtPlaybackBoundary = useRef(false);
  const playbackWasActive = useRef(false);
  const sourcesFor = (document: EditTimeline, componentId: string) =>
    Object.fromEntries(
      document.clips
        .filter(
          (c) =>
            (c.componentId === componentId ||
              (componentId === "video" && c.componentId === "video-audio")) &&
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
  const videoSources = timeline ? sourcesFor(timeline, "video") : undefined;
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
      if (
        event.target instanceof HTMLAudioElement ||
        event.target instanceof HTMLVideoElement
      ) {
        const message =
          event.target instanceof HTMLVideoElement
            ? "The selected MP4 video could not be decoded or played. Check that the registered file is available and supported."
            : "The selected audio could not be decoded or played. Check that the MP3/WAV is available and supported.";
        setError(message);
        send("error", { message });
      }
    };
    const ready = () => {
      const components = componentInfosSchema.parse(
        [
          standaloneTextModule,
          standaloneImageModule,
          standaloneVideoModule,
          ...(module.editorComponents ?? []).filter(
            (component) =>
              component.id !== standaloneTextModule.id &&
              component.id !== standaloneImageModule.id &&
              component.id !== standaloneVideoModule.id,
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
      if (pendingSeekFrame.current !== null) {
        if (currentFrame !== pendingSeekFrame.current) return;
        pendingSeekFrame.current = null;
      }
      if (
        playbackWasActive.current &&
        currentFrame + 1 >= activePlaybackEnd.current
      ) {
        endedAtPlaybackBoundary.current = true;
        playbackWasActive.current = false;
        if (currentPlayer?.isPlaying()) currentPlayer.pause();
        report();
        return;
      }
      report();
    };
    const onPlay = () => {
      if (endedAtPlaybackBoundary.current) {
        player.current?.seekTo(0);
        activePlaybackEnd.current = configuredPlaybackEnd.current;
        endedAtPlaybackBoundary.current = false;
      }
      playbackWasActive.current = true;
      report();
    };
    const onPause = () => {
      const currentFrame = player.current?.getCurrentFrame() ?? 0;
      if (
        playbackWasActive.current &&
        currentFrame + 1 >= activePlaybackEnd.current
      )
        endedAtPlaybackBoundary.current = true;
      playbackWasActive.current = false;
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
            endedAtPlaybackBoundary.current = false;
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
            endedAtPlaybackBoundary.current = false;
            break;
          }
          case "master-volume": {
            if (!isValidMasterVolume(e.data.volume))
              throw new Error("Preview volume must be between 0 and 1.");
            setMasterVolume(e.data.volume);
            break;
          }
          case "seek":
            if (Number.isInteger(e.data.frame)) {
              const duration =
                timelineRef.current?.durationInFrames ??
                manifest.durationInFrames;
              const frame = Math.max(0, Math.min(duration - 1, e.data.frame));
              activePlaybackEnd.current =
                frame >= configuredPlaybackEnd.current
                  ? duration
                  : configuredPlaybackEnd.current;
              endedAtPlaybackBoundary.current = false;
              pendingSeekFrame.current = pendingSeekTarget(
                player.current?.getCurrentFrame() ?? frame,
                frame,
              );
              player.current?.seekTo(frame);
              // Remotion may still report the previous frame synchronously
              // after seekTo(). Acknowledge the requested frame and ignore
              // old frameupdate callbacks until the player reaches it.
              send("frame", {
                frame,
                playing: player.current?.isPlaying() ?? false,
              });
            }
            break;
          case "play":
            clearPlaybackCheck();
            onPlay();
            player.current?.play();
            if (
              timelineRef.current?.clips.some(
                (clip) =>
                  clip.componentId === "soundtrack" ||
                  clip.componentId === "video-audio",
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
    p?.addEventListener("pause", onPause);
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
      p?.removeEventListener("pause", onPause);
      p?.removeEventListener("seeked", report);
    };
  }, [parentOrigin, module, manifest]);
  useEffect(() => {
    player.current?.setVolume(masterVolume);
  }, [masterVolume]);
  return (
    <div data-preview-master-volume={masterVolume}>
      {error && <pre role="alert">{error}</pre>}
      <StudioPlayer
        composition={module.default}
        manifest={{
          ...manifest,
          durationInFrames:
            timeline?.durationInFrames ?? manifest.durationInFrames,
        }}
        playerRef={player}
        masterVolume={masterVolume}
        inputProps={{ timeline, audioSources, imageSources, videoSources }}
      />
    </div>
  );
}
export function mountPreview(module: VideoModule, manifest: ProjectManifest) {
  createRoot(document.getElementById("root")!).render(
    <PreviewHost module={module} manifest={manifest} />,
  );
}
