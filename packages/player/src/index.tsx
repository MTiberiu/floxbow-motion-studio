import { Component, type ComponentType, type ReactNode, type Ref } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import type {EditableVideoProps} from '@motion/sdk/editor';
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
export function StudioPlayer({
  composition,
  manifest,
  playerRef,
  inputProps,
}: {
  composition: ComponentType<EditableVideoProps>;
  manifest: ProjectManifest;
  playerRef?:Ref<PlayerRef>;
  inputProps?:EditableVideoProps;
}) {
  return (
    <Boundary>
      <Player
        ref={playerRef}
        inputProps={inputProps??{}}
        component={composition}
        initialFrame={Math.min(manifest.fps * 2, manifest.durationInFrames - 1)}
        durationInFrames={manifest.durationInFrames}
        compositionWidth={manifest.width}
        compositionHeight={manifest.height}
        fps={manifest.fps}
        controls
        loop
        style={{ width: "100%", height: "100%" }}
        errorFallback={({ error }) => (
          <pre role="alert">Composition failed: {error.message}</pre>
        )}
      />
    </Boundary>
  );
}
