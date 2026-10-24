import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createProject } from "./project-scaffold";
import { readEditor, saveEditor } from "./editor-store";
import { readMediaRegistry, registerMediaAsset } from "./media-store";
import { probeVideo } from "./video-probe";
import { manifestSchema } from "@motion/project-loader/schema";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { resizeTimelineScene } from "../apps/desktop/src/timeline-scenes";
import { createSceneMoment } from "../apps/desktop/src/scene-moments";
import { renderProject } from "../packages/renderer/src/render";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tempRootParent = path.join(root, ".test-tmp");
await mkdir(tempRootParent, { recursive: true });
const tempRoot = await import("node:fs/promises").then(({ mkdtemp }) =>
  mkdtemp(path.join(tempRootParent, "scene-acceptance-")),
);
const projectId = `scene-acceptance-${Date.now()}`;
const projectsDirectory = path.join(tempRoot, "projects");

async function runFfmpeg(args: string[]) {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...args,
  ]);
}

async function register(
  projectRoot: string,
  sourcePath: string,
  type: "image" | "audio" | "video",
) {
  const snapshot = await readMediaRegistry(projectRoot);
  const next = await registerMediaAsset(
    projectRoot,
    sourcePath,
    type,
    snapshot.revision,
  );
  return next.registry.assets.at(-1)!.id;
}

try {
  const manifest = manifestSchema.parse(
    await createProject(projectsDirectory, projectId),
  );
  const projectRoot = path.join(projectsDirectory, projectId);
  const assetDirectory = path.join(tempRoot, "generated-media");
  await mkdir(assetDirectory, { recursive: true });

  const backgroundPath = path.join(assetDirectory, "background.png");
  const foregroundPath = path.join(assetDirectory, "foreground.png");
  const neutralPath = path.join(assetDirectory, "character-neutral.png");
  const speakingPath = path.join(assetDirectory, "character-speaking.png");
  const videoPath = path.join(assetDirectory, "moving-video.mp4");
  const audioPath = path.join(assetDirectory, "soundtrack.wav");
  for (const [file, color] of [
    [backgroundPath, "0x224466"],
    [foregroundPath, "0x66aa44"],
    [neutralPath, "0xe8cc33"],
    [speakingPath, "0xee5533"],
  ] as const)
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=320x180:d=0.04`,
      "-frames:v",
      "1",
      file,
    ]);
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=44100",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    videoPath,
  ]);
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100:duration=8",
    "-c:a",
    "pcm_s16le",
    audioPath,
  ]);

  const backgroundId = await register(projectRoot, backgroundPath, "image");
  const foregroundId = await register(projectRoot, foregroundPath, "image");
  const neutralId = await register(projectRoot, neutralPath, "image");
  const speakingId = await register(projectRoot, speakingPath, "image");
  const videoId = await register(projectRoot, videoPath, "video");
  const audioId = await register(projectRoot, audioPath, "audio");
  const videoInfo = await probeVideo(videoPath);

  const scenes = [0, 1, 2, 3].map((index) => ({
    id: `scene-${index + 1}`,
    name: ["Forest", "Arrival", "Action", "Close"][index],
    from: index * 60,
    durationInFrames: 60,
  }));
  const tracks = [
    { id: "captions", name: "Text", kind: "visual" as const },
    { id: "characters", name: "Characters", kind: "visual" as const },
    { id: "front", name: "Foreground", kind: "visual" as const },
    { id: "video", name: "Video", kind: "visual" as const },
    { id: "background", name: "Background", kind: "visual" as const },
    { id: "audio", name: "Audio", kind: "audio" as const },
  ];
  const group = {
    id: "guide-character",
    name: "Guide",
    category: "characters" as const,
    members: [
      {
        id: "guide-neutral",
        assetId: neutralId,
        label: "Neutral",
        role: "pose" as const,
        offsetX: 0,
        offsetY: 0,
      },
      {
        id: "guide-speaking",
        assetId: speakingId,
        label: "Speaking",
        role: "pose" as const,
        offsetX: 0,
        offsetY: 0,
      },
    ],
  };
  const bgClips = scenes.map((scene, index) => ({
    id: `background-${index + 1}`,
    sceneId: scene.id,
    trackId: "background",
    componentId: "image",
    label: `Background ${index + 1}`,
    from: scene.from,
    durationInFrames: scene.durationInFrames,
    content: { assetId: backgroundId },
    props: {
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      anchor: "center",
      fit: "fill",
    },
  }));
  let timeline = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 240,
    trackOrder: "top-down",
    tracks,
    scenes,
    assetGroups: [group],
    clips: [
      ...bgClips,
      {
        id: "forest-foreground",
        sceneId: "scene-1",
        trackId: "front",
        componentId: "image",
        label: "Foreground PNG",
        from: 0,
        durationInFrames: 60,
        content: { assetId: foregroundId },
        props: {
          x: 24,
          y: 42,
          width: 35,
          height: 60,
          anchor: "center",
          fit: "contain",
        },
      },
      {
        id: "guide-clip",
        sceneId: "scene-1",
        trackId: "characters",
        componentId: "character",
        label: "Guide",
        from: 0,
        durationInFrames: 60,
        content: {
          groupId: group.id,
          poseEvents: [
            {
              id: "guide-neutral-event",
              atFrame: 0,
              memberId: "guide-neutral",
            },
            {
              id: "guide-speaking-event",
              atFrame: 30,
              memberId: "guide-speaking",
            },
          ],
        },
        props: {
          x: 75,
          y: 90,
          width: 24,
          height: 50,
          anchor: "bottom-center",
          fit: "contain",
        },
      },
      {
        id: "title-text",
        trackId: "captions",
        componentId: "text",
        label: "Opening title",
        from: 0,
        durationInFrames: 120,
        content: { text: "Four scene acceptance" },
        props: {
          x: 50,
          y: 12,
          width: 80,
          height: 15,
          fontSize: 46,
          color: "#ffffff",
          alignment: "center",
          anchor: "top-center",
        },
      },
      {
        id: "action-video",
        sceneId: "scene-3",
        trackId: "video",
        componentId: "video",
        label: "Action video",
        from: 120,
        durationInFrames: 60,
        content: {
          assetId: videoId,
          sourceStartSeconds: 0,
          sourceDurationSeconds: videoInfo.durationInSeconds,
        },
        props: {
          x: 50,
          y: 50,
          width: 50,
          height: 80,
          anchor: "center",
          fit: "contain",
          volume: 0,
        },
      },
      {
        id: "soundtrack",
        trackId: "audio",
        componentId: "soundtrack",
        label: "Soundtrack",
        from: 0,
        durationInFrames: 240,
        content: { assetId: audioId },
        props: {},
      },
    ],
  });
  timeline = createSceneMoment(timeline, "scene-1", 45, "Guide speaks");

  const sceneBeforeRipple = timeline.scenes![1].from;
  const extended = resizeTimelineScene(timeline, "scene-1", 75);
  if (extended.scenes![1].from !== sceneBeforeRipple + 15)
    throw new Error(
      "Extending Scene 1 did not move the following scene and clips.",
    );
  timeline = resizeTimelineScene(extended, "scene-1", 60);
  if (timeline.scenes![1].from !== sceneBeforeRipple)
    throw new Error(
      "Restoring Scene 1 did not restore the following scene timing.",
    );

  const disk = await readEditor(projectRoot, manifest);
  const saved = await saveEditor(
    projectRoot,
    manifest,
    timeline,
    disk.revision,
  );
  const reloaded = await readEditor(
    projectRoot,
    manifestSchema.parse(
      JSON.parse(
        await readFile(path.join(projectRoot, "project.json"), "utf8"),
      ),
    ),
  );
  if (
    reloaded.timeline.clips.length !== 9 ||
    reloaded.timeline.scenes?.length !== 4
  )
    throw new Error(
      "The saved four-scene acceptance project did not reload completely.",
    );
  const moment = reloaded.timeline.sceneMoments?.[0];
  if (moment?.characterStates[0]?.poseEventId !== "guide-speaking-event")
    throw new Error(
      "The Scene Moment did not retain its active character pose reference.",
    );

  const compositionSource = `import { Canvas } from "@motion/sdk";
import { TimelineComposition, type EditableVideoProps, standaloneTextModule, standaloneImageModule, standaloneVideoModule, standaloneCharacterModule } from "@motion/sdk/editor";
import { subtitleModule } from "@motion/lyrics-sync/component";
import { parseEditTimeline } from "@motion/sdk/timeline";
import savedTimeline from "./edit-timeline.json";
export const editorComponents = [subtitleModule, standaloneTextModule, standaloneImageModule, standaloneVideoModule, standaloneCharacterModule];
export default function Video({ timeline }: EditableVideoProps) { return <Canvas background="#000000" style={{padding:0}}><TimelineComposition timeline={timeline ?? parseEditTimeline(savedTimeline)} components={editorComponents} /></Canvas>; }
`;
  await writeFile(path.join(projectRoot, "Composition.tsx"), compositionSource);
  const output = await renderProject(tempRoot, projectId);
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,codec_name",
    "-of",
    "json",
    output,
  ]);
  const streams = (
    JSON.parse(stdout) as { streams: Array<{ codec_type: string }> }
  ).streams;
  if (!streams.some((stream) => stream.codec_type === "video"))
    throw new Error("The acceptance MP4 has no video stream.");
  if (!streams.some((stream) => stream.codec_type === "audio"))
    throw new Error("The acceptance MP4 has no soundtrack stream.");
  console.log(
    `PASS: four scenes saved and reloaded; shared image, text, video, character and audio clips rendered to ${path.basename(output)} with video and audio streams.`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
