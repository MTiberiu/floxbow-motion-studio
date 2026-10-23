import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  safeFile,
  type ProjectManifest,
  manifestSchema,
} from "@motion/project-loader";
import { parseEditTimeline, type EditTimeline } from "@motion/sdk/timeline";
import { subtitleContentSchema } from "@motion/lyrics-sync/subtitles";
import { standaloneTextClipSchema } from "@motion/sdk/editor";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function renameWithTransientWindowsRetry(
  source: string,
  destination: string,
  renameFile = rename,
  platform = process.platform,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        platform !== "win32" ||
        !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") ||
        attempt >= 3
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
export async function readEditor(projectRoot: string, m: ProjectManifest) {
  if (!m.editTimeline)
    throw new Error(
      "This project has no editable timeline. Add editTimeline to project.json.",
    );
  const file = await safeFile(projectRoot, m.editTimeline);
  const text = await readFile(file, "utf8");
  const timeline = parseEditTimeline(JSON.parse(text), m);
  for (const clip of timeline.clips)
    if (clip.componentId === "text") standaloneTextClipSchema.parse(clip);
  return {
    timeline,
    revision: hash(text),
  };
}
const locks = new Map<string, Promise<unknown>>();
export async function saveEditor(
  projectRoot: string,
  m: ProjectManifest,
  timeline: unknown,
  revision: string,
) {
  const key = path.resolve(projectRoot);
  const previous = locks.get(key) ?? Promise.resolve();
  const job = previous
    .catch(() => {})
    .then(async () => {
      if (
        timeline &&
        typeof timeline === "object" &&
        "durationInFrames" in timeline &&
        typeof timeline.durationInFrames === "number" &&
        timeline.durationInFrames < m.durationInFrames
      )
        throw new Error("Timeline duration cannot be shortened.");
      const t = parseEditTimeline(timeline);
      if (t.fps !== m.fps || t.durationInFrames < m.durationInFrames)
        throw new Error(
          "Timeline FPS must match the project and duration cannot be shortened.",
        );
      for (const c of t.clips)
        if (c.componentId === "subtitles")
          subtitleContentSchema.parse(c.content);
      for (const c of t.clips)
        if (c.componentId === "text") standaloneTextClipSchema.parse(c);
      const current = await readEditor(projectRoot, m);
      if (current.revision !== revision)
        throw new Error(
          "CONFLICT: The project changed on disk. Reload it before saving; your draft has been kept.",
        );
      const file = await safeFile(projectRoot, m.editTimeline!);
      const temporary = file + "." + randomUUID() + ".tmp";
      const timelineText = JSON.stringify(t, null, 2) + "\n";
      if (t.durationInFrames === m.durationInFrames) {
        try {
          await writeFile(temporary, timelineText, { flag: "wx" });
          if ((await readEditor(projectRoot, m)).revision !== revision)
            throw new Error("CONFLICT: The project changed while saving.");
          await renameWithTransientWindowsRetry(temporary, file);
        } finally {
          await unlink(temporary).catch(() => {});
        }
        return readEditor(projectRoot, m);
      }
      const manifestFile = await safeFile(projectRoot, "project.json");
      const manifestText = await readFile(manifestFile, "utf8");
      const diskManifest = manifestSchema.parse(JSON.parse(manifestText));
      if (
        diskManifest.id !== m.id ||
        diskManifest.durationInFrames !== m.durationInFrames
      )
        throw new Error(
          "CONFLICT: The project settings changed. Reload before saving.",
        );
      const updatedManifest = manifestSchema.parse({
        ...diskManifest,
        durationInFrames: t.durationInFrames,
      });
      const manifestTemporary = manifestFile + "." + randomUUID() + ".tmp";
      const manifestOutput = JSON.stringify(updatedManifest, null, 2) + "\n";
      try {
        await writeFile(temporary, timelineText, { flag: "wx" });
        await writeFile(manifestTemporary, manifestOutput, { flag: "wx" });
        if (
          (await readEditor(projectRoot, m)).revision !== revision ||
          (await readFile(manifestFile, "utf8")) !== manifestText
        )
          throw new Error("CONFLICT: The project changed while saving.");
        await renameWithTransientWindowsRetry(temporary, file);
        try {
          await renameWithTransientWindowsRetry(
            manifestTemporary,
            manifestFile,
          );
        } catch (error) {
          const rollback = file + "." + randomUUID() + ".rollback";
          try {
            await writeFile(
              rollback,
              `${JSON.stringify(current.timeline, null, 2)}\n`,
              { flag: "wx" },
            );
            await renameWithTransientWindowsRetry(rollback, file);
          } finally {
            await unlink(rollback).catch(() => {});
          }
          throw error;
        }
      } finally {
        await unlink(temporary).catch(() => {});
        await unlink(manifestTemporary).catch(() => {});
      }
      return { timeline: t, revision: hash(timelineText) };
    });
  locks.set(key, job);
  try {
    return await job;
  } finally {
    if (locks.get(key) === job) locks.delete(key);
  }
}
