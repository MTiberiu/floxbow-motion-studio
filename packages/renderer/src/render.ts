import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  renderStill,
} from "@remotion/renderer";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { discover, projectId } from "@motion/project-loader";
export async function renderProject(root: string, id: string, still = false) {
  projectId.parse(id);
  const p = (await discover(path.join(root, "projects"))).find(
    (p) => p.id === id,
  );
  if (!p?.manifest) throw new Error(p?.error ?? "Unknown project");
  const m = p.manifest;
  await mkdir(path.join(root, ".studio"), { recursive: true });
  const job = await mkdtemp(path.join(root, ".studio/render-"));
  await mkdir(path.join(root, "out"), { recursive: true });
  try {
    const entry = path.join(job, "entry.tsx");
    await writeFile(
      entry,
      `import React from 'react';import {registerRoot,Composition} from 'remotion';import Video from ${JSON.stringify(path.join(root, "projects", id, m.entry).replaceAll("\\", "/"))};registerRoot(()=> <Composition id="Video" component={Video} width={${m.width}} height={${m.height}} fps={${m.fps}} durationInFrames={${m.durationInFrames}}/>);`,
    );
    const serveUrl = await bundle({
      entryPoint: entry,
      rootDir: root,
      outDir: path.join(job, "bundle"),
    });
    const composition = await selectComposition({ serveUrl, id: "Video" });
    const output = path.join(root, "out", `${id}.${still ? "png" : "mp4"}`);
    if (still)
      await renderStill({
        serveUrl,
        composition,
        output,
        frame: Math.min(60, m.durationInFrames - 1),
        imageFormat: "png",
      });
    else
      await renderMedia({
        serveUrl,
        composition,
        codec: "h264",
        outputLocation: output,
        concurrency: 2,
        onProgress: (p) =>
          process.stdout.write(`\rRendering ${Math.round(p.progress * 100)}%`),
      });
    return output;
  } finally {
    await rm(job, { recursive: true, force: true });
  }
}
