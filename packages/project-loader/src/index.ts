import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  manifestSchema,
  projectId,
  relativeFile,
  type ProjectRecord,
} from "./schema";
export * from "./schema";
export async function safeFile(root: string, relative: string) {
  relativeFile.parse(relative);
  const base = await realpath(root);
  const target = await realpath(path.resolve(base, relative));
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error("Path escapes project directory");
  if (!(await stat(target)).isFile())
    throw new Error("Expected a regular file");
  return target;
}
export async function discover(root: string): Promise<ProjectRecord[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (e) => {
        try {
          projectId.parse(e.name);
          const file = await safeFile(root, `${e.name}/project.json`);
          const manifest = manifestSchema.parse(
            JSON.parse(await readFile(file, "utf8")),
          );
          if (manifest.id !== e.name)
            throw new Error("Project ID must match its folder name");
          const dir = path.join(root, e.name);
          await safeFile(dir, manifest.entry);
      for (const media of [manifest.timeline, manifest.audio, manifest.editTimeline])
            if (media) await safeFile(dir, media);
          return { id: e.name, manifest };
        } catch (error) {
          return {
            id: e.name,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
  );
}
