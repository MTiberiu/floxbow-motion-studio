import type { ComponentType } from "react";
import { StudioPlayer } from "@motion/player";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { EditableVideoProps } from "@motion/sdk/editor";

export function PlayerIntegrationExample({
  composition,
  manifest,
}: {
  composition: ComponentType<EditableVideoProps>;
  manifest: ProjectManifest;
}) {
  return <StudioPlayer composition={composition} manifest={manifest} />;
}
