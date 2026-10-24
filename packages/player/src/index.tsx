import { Component, type ComponentType, type ReactNode, type Ref } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
  TimelineSoundtrackAudio,
  TimelineMediaSourcesProvider,
  TimelineVideoAudio,
  type EditableVideoProps,
} from "@motion/sdk/editor";
import type { ProjectManifest } from "@motion/project-loader/schema";
class Boundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <pre role="alert">Composition failed: {this.state.error}</pre>
    ) : (
      this.props.children
    );
  }
}
function AudioAwareComposition({
  composition,
  audioSources,
  imageSources,
  videoSources,
  timeline,
  projectId,
  ...props
}: EditableVideoProps & {
  composition: ComponentType<EditableVideoProps>;
  projectId: string;
}) {
  const Video = composition;
  const sourceMap = Object.fromEntries(
    (timeline?.clips ?? [])
      .filter(
        (clip) =>
          clip.componentId === "soundtrack" &&
          typeof clip.content.assetId === "string",
      )
      .map((clip) => {
        const assetId = String(clip.content.assetId);
        return [
          assetId,
          audioSources?.[assetId] ??
            `${location.origin}/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/stream`,
        ];
      }),
  );
  const imageSourceMap = Object.fromEntries(
    [
      ...new Set([
        ...(timeline?.clips ?? [])
          .filter(
            (clip) =>
              clip.componentId === "image" &&
              typeof clip.content.assetId === "string",
          )
          .map((clip) => String(clip.content.assetId)),
        ...(timeline?.clips ?? [])
          .filter((clip) => clip.componentId === "character")
          .flatMap(
            (clip) =>
              (timeline?.assetGroups ?? [])
                .find((group) => group.id === clip.content.groupId)
                ?.members.map((member) => member.assetId) ?? [],
          ),
      ]),
    ].map((assetId) => [
      assetId,
      imageSources?.[assetId] ??
        `${location.origin}/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/stream`,
    ]),
  );
  const videoSourceMap = Object.fromEntries(
    (timeline?.clips ?? [])
      .filter(
        (clip) =>
          (clip.componentId === "video" ||
            clip.componentId === "video-audio") &&
          typeof clip.content.assetId === "string",
      )
      .map((clip) => {
        const assetId = String(clip.content.assetId);
        return [
          assetId,
          videoSources?.[assetId] ??
            `${location.origin}/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/stream`,
        ];
      }),
  );
  return (
    <>
      <TimelineMediaSourcesProvider
        imageSources={timeline ? imageSourceMap : imageSources}
        videoSources={timeline ? videoSourceMap : videoSources}
      >
        <Video
          {...props}
          timeline={timeline}
          audioSources={sourceMap}
          imageSources={timeline ? imageSourceMap : imageSources}
          videoSources={timeline ? videoSourceMap : videoSources}
        />
      </TimelineMediaSourcesProvider>
      <TimelineSoundtrackAudio timeline={timeline} audioSources={sourceMap} />
      <TimelineVideoAudio timeline={timeline} videoSources={videoSourceMap} />
    </>
  );
}
export function StudioPlayer({
  composition,
  manifest,
  playerRef,
  inputProps,
  masterVolume = 1,
}: {
  composition: ComponentType<EditableVideoProps>;
  manifest: ProjectManifest;
  playerRef?: Ref<PlayerRef>;
  inputProps?: EditableVideoProps;
  masterVolume?: number;
}) {
  return (
    <Boundary>
      <Player
        ref={playerRef}
        inputProps={{
          ...(inputProps ?? {}),
          composition,
          projectId: manifest.id,
        }}
        component={AudioAwareComposition}
        initialFrame={Math.min(manifest.fps * 2, manifest.durationInFrames - 1)}
        durationInFrames={manifest.durationInFrames}
        compositionWidth={manifest.width}
        compositionHeight={manifest.height}
        fps={manifest.fps}
        controls
        showVolumeControls={false}
        initialVolume={masterVolume}
        loop={false}
        style={{ width: "100%", height: "100%" }}
        errorFallback={({ error }) => (
          <pre role="alert">Composition failed: {error.message}</pre>
        )}
      />
    </Boundary>
  );
}
