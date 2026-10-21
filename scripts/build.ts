import { build } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { discover } from "@motion/project-loader";
import { root, projectsDir } from "./server";
await build({
  configFile: false,
  root: path.join(root, "apps/desktop"),
  plugins: [react()],
  base: "./",
  build: { outDir: path.join(root, "dist/shell"), emptyOutDir: true },
});
const records = await discover(projectsDir);
for (const record of records) {
  if (!record.manifest) continue;
  try {
    const m = record.manifest;
    const generated = path.join(root, ".studio/build", m.id);
    await mkdir(generated, { recursive: true });
    await writeFile(
      path.join(generated, "index.html"),
      '<!doctype html><html><head><title>Composition preview</title></head><body style="margin:0;background:#0c111b;color:white"><div id="root" style="height:100vh"></div><script type="module" src="./entry.tsx"></script></body></html>',
    );
    await writeFile(
      path.join(generated, "entry.tsx"),
      `import {mountPreview} from '@motion/player/host';import * as video from ${JSON.stringify(path.join(projectsDir, m.id, m.entry).replaceAll("\\", "/"))};mountPreview(video,${JSON.stringify(m)});`,
    );
    await build({
      configFile: false,
      root: generated,
      plugins: [react()],
      base: "./",
      build: {
        outDir: path.join(root, "dist/preview", m.id),
        emptyOutDir: true,
      },
    });
  } catch (e) {
    record.error = `Compilation failed: ${e instanceof Error ? e.message : String(e)}`;
    delete record.manifest;
    console.error(record.id, record.error);
  }
}
await writeFile(
  path.join(root, "dist/projects.json"),
  JSON.stringify(records, null, 2),
);
if (records.some((p) => p.error)) process.exitCode = 1;
