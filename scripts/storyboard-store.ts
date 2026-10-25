import { readFile, writeFile, unlink, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  safeFile,
  manifestSchema,
  projectId as projectIdSchema,
  type ProjectManifest,
} from "@motion/project-loader";
import {
  storyboardSchema,
  emptyStoryboard,
  sceneFingerprint,
  type Storyboard,
} from "@motion/project-loader/storyboard";
import { getSubtitleCues } from "@motion/lyrics-sync/subtitles";
import { renderStoryboardSvg } from "@motion/project-loader/storyboard-svg";
import { withProjectWriteLock } from "./project-write-lock";
import { readEditor, renameWithTransientWindowsRetry } from "./editor-store";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
async function target(root: string) {
  const base = await realpath(root);
  const file = path.join(base, "storyboard.json");
  try {
    if ((await lstat(file)).isSymbolicLink())
      throw new Error("Storyboard must not be a symlink");
    await safeFile(base, "storyboard.json");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return file;
}
export async function readStoryboard(root: string, projectId: string) {
  const file = await target(root);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      const m = manifestSchema.parse(
        JSON.parse(
          await readFile(await safeFile(root, "project.json"), "utf8"),
        ),
      );
      return {
        document: emptyStoryboard(projectId, {
          width: m.width,
          height: m.height,
          fps: m.fps,
        }),
        revision: "missing",
      };
    }
    throw e;
  }
  if (Buffer.byteLength(text) > 8_000_000)
    throw new Error("Storyboard exceeds 8 MB");
  const document = storyboardSchema.parse(JSON.parse(text));
  if (document.projectId !== projectId)
    throw new Error("Storyboard project identity mismatch");
  return { document, revision: digest(text) };
}
export async function saveStoryboard(
  root: string,
  projectId: string,
  input: unknown,
  revision: string,
) {
  return withProjectWriteLock(root, async () => {
    const document = storyboardSchema.parse(input);
    if (document.projectId !== projectId)
      throw new Error("Storyboard project identity mismatch");
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(await safeFile(root, "project.json"), "utf8")),
    );
    if (document.scenes.some((s) => s.timelineSceneId)) {
      const timeline = manifest.editTimeline
        ? (await readEditor(root, manifest)).timeline
        : null;
      if (
        document.scenes.some(
          (s) =>
            s.timelineSceneId &&
            !timeline?.scenes?.some((t) => t.id === s.timelineSceneId),
        )
      )
        throw new Error(
          "Linked Timeline scene is missing. Unlink it or choose an existing saved scene.",
        );
    }
    if (
      document.composition.width !== manifest.width ||
      document.composition.height !== manifest.height ||
      document.composition.fps !== manifest.fps
    )
      throw new Error(
        "Project composition changed. Reopen Storyboard Designer before saving.",
      );
    if ((await readStoryboard(root, projectId)).revision !== revision)
      throw new Error(
        "CONFLICT: Storyboard changed on disk. Export your draft or reload before saving.",
      );
    const text = JSON.stringify(document, null, 2) + "\n";
    if (Buffer.byteLength(text) > 8_000_000)
      throw new Error("Storyboard exceeds 8 MB");
    const file = await target(root),
      temporary = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, text, { flag: "wx" });
      if ((await readStoryboard(root, projectId)).revision !== revision)
        throw new Error("CONFLICT: Storyboard changed while saving.");
      await renameWithTransientWindowsRetry(temporary, file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return { document, revision: digest(text) };
  });
}
export async function storyboardTiming(
  root: string,
  manifest: ProjectManifest,
) {
  if (!manifest.editTimeline)
    return { revision: "missing", cues: [], scenes: [], audio: [] };
  const { timeline, revision } = await readEditor(root, manifest);
  return {
    revision,
    cues: getSubtitleCues(timeline),
    scenes: timeline.scenes ?? [],
    audio: timeline.clips
      .filter((c) => ["soundtrack", "video-audio"].includes(c.componentId))
      .map((c) => ({
        clipId: c.id,
        assetId: String(c.content.assetId),
        start: c.from / timeline.fps,
        duration: c.durationInFrames / timeline.fps,
        sourceStart:
          typeof c.content.sourceStartSeconds === "number"
            ? c.content.sourceStartSeconds
            : 0,
      })),
  };
}
/** Read-only agent contract. Only a validated project and IDs, never arbitrary paths. */
export async function resolveStoryboardContext(
  projectsRoot: string,
  projectId: string,
  operation: string,
  identity?: string,
  setId?: string,
) {
  projectIdSchema.parse(projectId);
  const manifestFile = await safeFile(
    projectsRoot,
    `${projectId}/project.json`,
  );
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestFile, "utf8")),
  );
  if (manifest.id !== projectId) throw new Error("Project identity mismatch");
  const root = path.dirname(manifestFile);
  const snapshot = await readStoryboard(root, projectId),
    doc = snapshot.document;
  const scene = doc.scenes.find((s) => s.id === identity);
  const briefs = (sceneId: string) =>
    doc.briefs
      .filter((b) => b.sceneId === sceneId)
      .map((b) => ({
        ...b,
        stale:
          b.sourceFingerprint !==
          sceneFingerprint(
            doc,
            doc.scenes.find((s) => s.id === sceneId)!,
          ),
      }));
  let result: unknown;
  switch (operation) {
    case "listStoryboardScenes":
      result = doc.scenes.map(({ id, name }) => ({ id, name }));
      break;
    case "getStoryboardReference":
      result = doc.references.find((r) => r.id === identity);
      break;
    case "getStoryboardObject":
      result = doc.scenes
        .flatMap((s) => s.objects)
        .find((o) => o.id === identity);
      break;
    case "getStoryboardScene":
      result = scene;
      break;
    case "listSceneSets":
      result = scene?.sets;
      break;
    case "getDirectorBrief":
      result = scene && briefs(scene.id);
      break;
    case "getSetContext": {
      const index = scene?.sets.findIndex((s) => s.id === setId) ?? -1;
      if (!scene || index < 0) break;
      const set = scene.sets[index];
      result = {
        scene: { ...scene, sets: undefined },
        set,
        precedingSet: scene.sets[index - 1] ?? null,
        followingSet: scene.sets[index + 1] ?? null,
        references: doc.references,
        briefs: briefs(scene.id),
        sketchSource: `storyboard.json#${scene.id}/${set.id}`,
        renderedSketch: {
          mediaType: "image/svg+xml",
          content: renderStoryboardSvg(doc, set),
          referenceBase: "studio-shell-origin",
        },
        timing: await storyboardTiming(root, manifest),
      };
      break;
    }
    default:
      throw new Error("Unknown storyboard operation");
  }
  if (result === undefined) throw new Error("Storyboard identity not found");
  return {
    version: 1,
    projectId,
    revision: snapshot.revision,
    composition: doc.composition,
    currentProjectComposition: {
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
    },
    aspectRatio: doc.composition.width / doc.composition.height,
    result,
  };
}
