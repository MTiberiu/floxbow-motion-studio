import { useEffect, useRef, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import type { PlayerRef, CallbackListener } from "@remotion/player";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { EditableVideoProps, EditableComponent } from "@motion/sdk/editor";
import {
  componentInfosSchema,
  parseEditTimeline,
  type EditTimeline,
} from "@motion/sdk/timeline";
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
  const [error, setError] = useState("");
  const parentOrigin = document.referrer
    ? new URL(document.referrer).origin
    : "";
  useEffect(() => {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(parentOrigin)) return;
    const send = (type: string, extra: Record<string, unknown> = {}) =>
      parent.postMessage(
        { channel: "motion-editor-v1", projectId: manifest.id, type, ...extra },
        parentOrigin,
      );
    const ready = () => {
      const components = componentInfosSchema.parse(
        (module.editorComponents ?? []).map(({ component, ...info }) => info),
      );
      send("ready", { components });
    };
    const report = () =>
      send("frame", {
        frame: player.current?.getCurrentFrame() ?? 0,
        playing: player.current?.isPlaying() ?? false,
      });
    const onFrame: CallbackListener<"frameupdate"> = () => report();
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
          case "document":
            setTimeline(parseEditTimeline(e.data.timeline, manifest));
            setError("");
            break;
          case "seek":
            if (Number.isInteger(e.data.frame)) {
              player.current?.pause();
              player.current?.seekTo(
                Math.max(
                  0,
                  Math.min(manifest.durationInFrames - 1, e.data.frame),
                ),
              );
              report();
            }
            break;
          case "play":
            player.current?.play();
            break;
          case "pause":
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
    const p = player.current;
    p?.addEventListener("frameupdate", onFrame);
    p?.addEventListener("play", report);
    p?.addEventListener("pause", report);
    p?.addEventListener("seeked", report);
    ready();
    report();
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("project-module-updated", refreshMetadata);
      p?.removeEventListener("frameupdate", onFrame);
      p?.removeEventListener("play", report);
      p?.removeEventListener("pause", report);
      p?.removeEventListener("seeked", report);
    };
  }, [parentOrigin, module, manifest]);
  return (
    <>
      {error && <pre role="alert">{error}</pre>}
      <StudioPlayer
        composition={module.default}
        manifest={manifest}
        playerRef={player}
        inputProps={{ timeline }}
      />
    </>
  );
}
export function mountPreview(module: VideoModule, manifest: ProjectManifest) {
  createRoot(document.getElementById("root")!).render(
    <PreviewHost module={module} manifest={manifest} />,
  );
}
