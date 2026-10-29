import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectId } from "@motion/project-loader";

export async function createProject(projectsDirectory: string, rawId: string, width = 1920, height = 1080) {
  const id = projectId.parse(rawId);
  await mkdir(projectsDirectory, { recursive: true });
  const target = path.join(projectsDirectory, id);
  await mkdir(target);
  const manifest = {
    id,
    name: id
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" "),
    type: "explainer",
    width,
    height,
    fps: 30,
    durationInFrames: 180,
    entry: "Composition.tsx",
    sdkVersion: "0.1.0",
    editTimeline: "edit-timeline.json",
    timeline: "timing/lyrics.json",
  };
  try {
    await mkdir(path.join(target, "assets"));
    await mkdir(path.join(target, "scenes"));
    await mkdir(path.join(target, "timing"));
    await writeFile(
      path.join(target, "Composition.tsx"),
      `import { Canvas } from "@motion/sdk";
import { TimelineComposition, type EditableVideoProps } from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";
import { standaloneImageModule } from "@motion/sdk/editor";
import savedTimeline from "./edit-timeline.json";

export const editorComponents = [subtitleModule, standaloneImageModule];

export default function Video({ timeline, audioSources }: EditableVideoProps) {
  return (
    <Canvas background="#000000" style={{ padding: 0 }}>
      <TimelineComposition
        timeline={timeline ?? parseEditTimeline(savedTimeline)}
        components={editorComponents}
      />
    </Canvas>
  );
}

`,
    );
    await writeFile(
      path.join(target, "edit-timeline.json"),
      JSON.stringify(
        {
          version: 1,
          fps: 30,
          durationInFrames: 180,
          trackOrder: "top-down",
          tracks: [
            { id: "captions", name: "Captions", kind: "visual" },
            { id: "visuals", name: "Visuals", kind: "visual" },
          ],
          clips: [],
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(target, "timing", "lyrics.json"),
      JSON.stringify(
        { version: 1, units: "seconds", status: "unverified", lines: [] },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(target, "project.json"),
      JSON.stringify(manifest, null, 2),
    );
    await writeFile(
      path.join(target, "README.md"),
      `# ${manifest.name}\n\nA new, empty six-second motion project. The composition registers the reusable subtitle clip module and includes a top-down Visuals and Captions track stack. Add content from the editor or write project-owned React scenes.\n\nRead [Create a video](../../docs/CREATE_VIDEO.md), [the SDK guide](../../docs/MOTION_SDK.md), and [the editable timeline contract](../../docs/TIMELINE_EDITOR.md). Project-local media belongs in assets/.\n`,
    );
    return manifest;
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

export async function removeProject(projectsDirectory: string, rawId: string) {
  const id = projectId.parse(rawId);
  const projectsRoot = await realpath(projectsDirectory);
  const projectRoot = await realpath(path.join(projectsRoot, id));
  if (
    path.dirname(projectRoot) !== projectsRoot ||
    path.basename(projectRoot) !== id
  ) {
    throw new Error("Project folder is outside the local projects directory");
  }
  await rm(projectRoot, { recursive: true, force: false });
}
