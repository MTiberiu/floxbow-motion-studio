import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  renderStill,
} from "@remotion/renderer";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { discover, projectId } from "@motion/project-loader";
import { safeFile } from "@motion/project-loader";
import { editTimelineSchema } from "@motion/sdk/timeline";
import { standaloneTextClipSchema } from "@motion/sdk/editor";
import { readMediaRegistry } from "../../../scripts/media-store";
import { streamRegisteredAudio } from "../../../scripts/media-stream";
import { resolveMedia } from "@motion/project-loader/media";
import { probeAudioDuration } from "../../../scripts/audio-probe";
import {
  findLargeTimelineGaps,
  lastTimelineClipEnd,
} from "@motion/sdk/timeline-analysis";

async function startRenderAudioServer(projectRoot: string, assetIds: string[]) {
  if (!assetIds.length)
    return { sources: {} as Record<string, string>, close: async () => {} };
  const allowed = new Set(assetIds);
  const token = randomUUID();
  const server = createServer((request, response) => {
    const match = new URL(
      request.url ?? "/",
      "http://127.0.0.1",
    ).pathname.match(/^\/([a-f0-9-]+)\/([a-z0-9-]+)$/);
    if (!match || match[1] !== token || !allowed.has(match[2])) {
      response.writeHead(404).end();
      return;
    }
    void streamRegisteredAudio(
      projectRoot,
      match[2],
      request.headers.range,
      response,
    ).catch((error) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(
        error instanceof Error ? error.message : "Audio source failed.",
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not start the local render audio source.");
  const sources = Object.fromEntries(
    assetIds.map((assetId) => [
      assetId,
      "http://127.0.0.1:" + address.port + "/" + token + "/" + assetId,
    ]),
  );
  return {
    sources,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
export async function renderProject(root: string, id: string, still = false) {
  projectId.parse(id);
  const p = (await discover(path.join(root, "projects"))).find(
    (p) => p.id === id,
  );
  if (!p?.manifest) throw new Error(p?.error ?? "Unknown project");
  const m = p.manifest;
  let timeline: ReturnType<typeof editTimelineSchema.parse> | undefined;
  if (m.editTimeline) {
    const timelineFile = await safeFile(
      path.join(root, "projects", id),
      m.editTimeline,
    );
    const { readFile } = await import("node:fs/promises");
    timeline = editTimelineSchema.parse(
      JSON.parse(await readFile(timelineFile, "utf8")),
    );
    for (const clip of timeline.clips)
      if (clip.componentId === "text") standaloneTextClipSchema.parse(clip);
    if (
      timeline.fps !== m.fps ||
      timeline.durationInFrames !== m.durationInFrames
    )
      throw new Error(
        "The saved editable Timeline duration does not match project.json. Save the project in FloxBow before rendering.",
      );
  }
  const soundtrackIds = [
    ...new Set(
      (timeline?.clips ?? [])
        .filter((clip) => clip.componentId === "soundtrack")
        .map((clip) => {
          const assetId = clip.content.assetId;
          if (
            typeof assetId !== "string" ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assetId)
          )
            throw new Error(
              "The soundtrack Timeline clip has an invalid media ID.",
            );
          return assetId;
        }),
    ),
  ];
  if (soundtrackIds.length) {
    const registry = await readMediaRegistry(path.join(root, "projects", id));
    for (const assetId of soundtrackIds) {
      const media = await resolveMedia(
        path.join(root, "projects", id),
        registry.registry,
        assetId,
      );
      if (media.status !== "ready") {
        throw new Error(
          media.status === "missing"
            ? "The soundtrack audio file is missing. Relink it in Project Media before rendering."
            : media.message,
        );
      }
      const durationInSeconds = await probeAudioDuration(media.path);
      const clips = timeline!.clips.filter(
        (clip) =>
          clip.componentId === "soundtrack" && clip.content.assetId === assetId,
      );
      if (
        clips.some(
          (clip) =>
            clip.durationInFrames + 1 < durationInSeconds * timeline!.fps,
        )
      ) {
        throw new Error(
          "The soundtrack Timeline clip is shorter than its audio. Reselect the soundtrack before rendering.",
        );
      }
    }
  }
  if (timeline) {
    const contentEnd = lastTimelineClipEnd(timeline);
    if (contentEnd < timeline.durationInFrames)
      console.warn(
        `Timeline clip ranges end at ${(contentEnd / timeline.fps).toFixed(2)}s; the saved project and MP4 boundary remains ${(timeline.durationInFrames / timeline.fps).toFixed(2)}s. Trailing time is preserved.`,
      );
    const gaps = findLargeTimelineGaps(timeline);
    if (gaps.length) {
      console.warn(
        `Timeline export warning: ${gaps.length} empty interval${gaps.length === 1 ? "" : "s"} of at least 5 seconds. Project duration and export are unchanged.`,
      );
      for (const gap of gaps) {
        const start = (gap.from / timeline.fps).toFixed(2);
        const end = (gap.end / timeline.fps).toFixed(2);
        console.warn(
          `  Track ${gap.trackId}: ${start}s–${end}s; between ${gap.previousClipId ?? "project start"} and ${gap.nextClipId ?? "project end"}`,
        );
      }
    }
  }
  await mkdir(path.join(root, ".studio"), { recursive: true });
  const job = await mkdtemp(path.join(root, ".studio/render-"));
  let audioServer:
    Awaited<ReturnType<typeof startRenderAudioServer>> | undefined;
  try {
    await mkdir(path.join(root, "out"), { recursive: true });
    audioServer = await startRenderAudioServer(
      path.join(root, "projects", id),
      soundtrackIds,
    );
    const entry = path.join(job, "entry.tsx");
    const entrySource = [
      "import React from 'react';",
      "import {registerRoot,Composition} from 'remotion';",
      "import {TimelineSoundtrackAudio} from '@motion/sdk/editor';",
      `import Video from ${JSON.stringify(path.join(root, "projects", id, m.entry).replaceAll("\\", "/"))};`,
      `const audioSources=${JSON.stringify(audioServer.sources)};`,
      `const timeline=${JSON.stringify(timeline)};`,
      "const Rendered=(props)=><><Video {...props} timeline={props.timeline??timeline} audioSources={audioSources}/><TimelineSoundtrackAudio timeline={props.timeline??timeline} audioSources={audioSources}/></>;",
      `registerRoot(()=> <Composition id="Video" component={Rendered} defaultProps={{timeline,audioSources}} width={${m.width}} height={${m.height}} fps={${m.fps}} durationInFrames={${m.durationInFrames}}/>);`,
    ].join("\n");
    await writeFile(entry, entrySource);
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
    await audioServer?.close();
    await rm(job, { recursive: true, force: true });
  }
}
