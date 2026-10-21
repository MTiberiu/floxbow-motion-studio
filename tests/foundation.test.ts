import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { manifestSchema, discover, safeFile } from "@motion/project-loader";
import {
  fromLyrics,
  reconcile,
  parseTimeline,
  toJSON,
  toSRT,
  toLRC,
  toWords,
} from "@motion/lyrics-sync";
import { parseCapabilityRegistry } from "@motion/animations/registry";
import { createProject } from "../scripts/project-scaffold";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { readEditor, saveEditor } from "../scripts/editor-store";
const manifest = {
  id: "test-video",
  name: "Test",
  type: "explainer",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 180,
  entry: "Composition.tsx",
  sdkVersion: "0.1.0",
};
test("manifest rejects traversal, incompatible SDK and invalid dimensions", () => {
  assert.equal(manifestSchema.parse(manifest).id, "test-video");
  for (const patch of [
    { entry: "../evil.tsx" },
    { entry: "C:/evil.tsx" },
    { entry: "x\\evil.tsx" },
    { sdkVersion: "9.0.0" },
    { fps: 0 },
    { width: 0 },
    { durationInFrames: 1.2 },
    { id: "../escape" },
  ])
    assert.throws(() => manifestSchema.parse({ ...manifest, ...patch }));
});
test("discovery isolates malformed projects and detects added folders", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const root = await mkdtemp(path.join(tempRoot, "motion-test-"));
  try {
    await mkdir(path.join(root, "broken"));
    await writeFile(path.join(root, "broken/project.json"), "{");
    assert.equal((await discover(root))[0].id, "broken");
    await mkdir(path.join(root, "test-video"));
    await writeFile(
      path.join(root, "test-video/project.json"),
      JSON.stringify(manifest),
    );
    await writeFile(
      path.join(root, "test-video/Composition.tsx"),
      "export default ()=>null",
    );
    const list = await discover(root);
    assert.equal(list.length, 2);
    assert.ok(list.find((p) => p.id === "broken")?.error);
    assert.equal(list.find((p) => p.id === "test-video")?.manifest?.fps, 30);
    await assert.rejects(safeFile(root, "../escape"));
    await writeFile(
      path.join(root, "test-video/project.json"),
      JSON.stringify({ ...manifest, id: "wrong" }),
    );
    assert.match(
      (await discover(root)).find((p) => p.id === "test-video")!.error!,
      /match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("lyrics never invent timing and reconciliation preserves repeated occurrences", () => {
  const t = fromLyrics("go go\nmissing");
  assert.equal(t.lines[0].words[0].start, null);
  assert.equal(toSRT(t), "");
  const matched = reconcile("go go\nmissing", {
    segments: [
      {
        words: [
          { word: "Go!", start: 1, end: 2, score: 0.8 },
          { word: "go", start: 3, end: 4, score: 0.9 },
        ],
      },
    ],
  });
  assert.equal(matched.lines[0].words[1].start, 3);
  assert.equal(matched.lines[1].words[0].start, null);
  assert.equal(matched.status, "unverified");
  assert.match(toSRT(matched), /00:00:01,000 --> 00:00:04,000/);
  assert.equal(toLRC(matched), "[00:01.00]go go");
  assert.equal(JSON.parse(toWords(matched)).length, 3);
  assert.deepEqual(parseTimeline(JSON.parse(toJSON(matched))), matched);
});
test("timeline rejects reversed intervals, duplicate IDs and invalid repeats", () => {
  const t = reconcile("one two", {
    segments: [
      {
        words: [
          { word: "one", start: 1, end: 2 },
          { word: "two", start: 3, end: 4 },
        ],
      },
    ],
  });
  const reverse = structuredClone(t);
  reverse.lines[0].words[0].end = 0;
  assert.throws(() => parseTimeline(reverse));
  const duplicate = structuredClone(t);
  duplicate.lines[0].words[1].id = duplicate.lines[0].words[0].id;
  assert.throws(() => parseTimeline(duplicate));
  const repeat = structuredClone(t);
  repeat.lines[0].repeatOf = "no-such-line";
  assert.throws(() => parseTimeline(repeat));
  const overlap = structuredClone(t);
  overlap.lines[0].words[1].start = 1.5;
  assert.throws(() => parseTimeline(overlap));
});

test("capability registry imports, docs, examples and references resolve", async () => {
  const registry = parseCapabilityRegistry(
    JSON.parse(await readFile("packages/animation-library/registry.json", "utf8")),
  );
  const packageRecords = await Promise.all(
    (await readdir("packages", { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directory = path.join("packages", entry.name);
        const metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
        return { directory, metadata };
      }),
  );
  for (const capability of registry.capabilities) {
    const owner = packageRecords.find(({ metadata }) => metadata.name === capability.api.importPath.split("/").slice(0, 2).join("/"));
    assert.ok(owner, `Missing package for ${capability.api.importPath}`);
    const subpath = capability.api.importPath.slice(owner.metadata.name.length);
    const exportKey = subpath ? `.${subpath}` : ".";
    const target = typeof owner.metadata.exports === "string"
      ? owner.metadata.exports
      : owner.metadata.exports?.[exportKey];
    assert.equal(typeof target, "string", `Unexported path ${capability.api.importPath}`);
    await readFile(path.join(owner.directory, target.slice(2)));
    await readFile(capability.documentation);
  }
  for (const example of registry.examples) {
    assert.ok(!example.path.startsWith("projects/"), "Examples must not be user projects");
    await readFile(example.path);
  }
});

test("Create Project scaffold creates a blank, valid editable project", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const projects = await mkdtemp(path.join(tempRoot, "motion-starter-"));
  try {
    const manifest = await createProject(projects, "neutral-video");
    assert.equal(manifest.id, "neutral-video");
    assert.equal(manifest.name, "Neutral Video");
    const timeline = parseEditTimeline(
      JSON.parse(await readFile(path.join(projects, manifest.id, manifest.editTimeline), "utf8")),
      manifest,
    );
    assert.equal(timeline.clips.length, 0);
    assert.deepEqual(timeline.tracks.map((track) => track.name), ["Visuals", "Captions"]);
    await assert.rejects(createProject(projects, "../escape"));
  } finally {
    await rm(projects, { recursive: true, force: true });
  }
});

test("three scaffolded projects are independently discoverable and editable", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const projects = await mkdtemp(path.join(tempRoot, "motion-isolated-projects-"));
  try {
    const ids = ["isolation-alpha", "isolation-bravo", "isolation-charlie"];
    const manifests = await Promise.all(ids.map(async (id) => manifestSchema.parse(await createProject(projects, id))));
    for (const manifest of manifests) {
      const directory = path.join(projects, manifest.id);
      for (const file of ["project.json", "Composition.tsx", "edit-timeline.json"])
        await stat(path.join(directory, file));
      for (const folder of ["assets", "scenes", "timing"])
        assert.ok((await stat(path.join(directory, folder))).isDirectory());
    }
    assert.deepEqual((await discover(projects)).map((p) => p.id), ids);

    const firstDirectory = path.join(projects, ids[0]);
    const secondDirectory = path.join(projects, ids[1]);
    const firstManifest = manifests[0];
    const secondManifest = manifests[1];
    const firstBefore = await readEditor(firstDirectory, firstManifest);
    const secondBefore = await readEditor(secondDirectory, secondManifest);
    const changed = structuredClone(firstBefore.timeline);
    changed.clips.push({
      id: "only-alpha",
      trackId: "captions",
      componentId: "subtitles",
      label: "Alpha only",
      from: 0,
      durationInFrames: 90,
      content: { text: "Alpha content", status: "unverified" },
      props: {},
    });
    await saveEditor(firstDirectory, firstManifest, changed, firstBefore.revision);

    assert.equal((await readEditor(firstDirectory, firstManifest)).timeline.clips[0].content.text, "Alpha content");
    assert.deepEqual((await readEditor(secondDirectory, secondManifest)).timeline, secondBefore.timeline);
    assert.equal((await discover(projects)).length, 3);
  } finally {
    await rm(projects, { recursive: true, force: true });
  }
});
