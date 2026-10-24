import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { safeFile, manifestSchema } from "@motion/project-loader";
import { renameWithTransientWindowsRetry } from "./editor-store";
import { withProjectWriteLock } from "./project-write-lock";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export async function readProjectSettings(projectRoot: string) {
  const file = await safeFile(projectRoot, "project.json");
  const text = await readFile(file, "utf8");
  const manifest = manifestSchema.parse(JSON.parse(text));
  return {
    manifest,
    revision: hash(text),
  };
}

export async function saveProjectCanvasSize(
  projectRoot: string,
  expectedRevision: string,
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    width < 16 ||
    width > 7680 ||
    !Number.isInteger(height) ||
    height < 16 ||
    height > 7680
  )
    throw new Error(
      "Canvas dimensions must be whole pixels between 16 and 7680.",
    );

  return withProjectWriteLock(projectRoot, async () => {
    const current = await readProjectSettings(projectRoot);
    if (current.revision !== expectedRevision)
      throw new Error(
        "CONFLICT: Project settings changed on disk. Reload before changing the Canvas format.",
      );
    const file = await safeFile(projectRoot, "project.json");
    const diskText = await readFile(file, "utf8");
    if (hash(diskText) !== expectedRevision)
      throw new Error("CONFLICT: Project settings changed while preparing the save.");
    const rawManifest = JSON.parse(diskText) as Record<string, unknown>;
    const nextRawManifest = {
      ...rawManifest,
      width,
      height,
    };
    const manifest = manifestSchema.parse(nextRawManifest);
    const temporary = `${file}.${randomUUID()}.tmp`;
    const contents = `${JSON.stringify(nextRawManifest, null, 2)}\n`;
    try {
      await writeFile(temporary, contents, { flag: "wx" });
      if (
        (await readProjectSettings(projectRoot)).revision !== expectedRevision
      )
        throw new Error("CONFLICT: Project settings changed while saving.");
      await renameWithTransientWindowsRetry(temporary, file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return { manifest, revision: hash(contents) };
  });
}
