import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  mediaAssetSchema,
  mediaRegistrySchema,
  resolveMedia,
} from "@motion/project-loader/media";
import {
  publicMediaAvailability,
  readMediaRegistry,
  readMediaWithAvailability,
  registerAudioAsset,
  registerMediaAsset,
  registerPoseStudioPngs,
  registerStoryboardPngs,
  removeMediaAsset,
} from "../scripts/media-store";

function wavFixture() {
  const bytes = Buffer.alloc(46);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(38, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(16_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(2, 40);
  bytes.writeInt16LE(0, 44);
  return bytes;
}

function pngFixture() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJMAAAAAASUVORK5CYII=",
    "base64",
  );
}

async function tempDirectory(prefix: string) {
  const testRoot = path.resolve(".test-tmp");
  await mkdir(testRoot, { recursive: true });
  return mkdtemp(path.join(testRoot, prefix));
}

test("media registry validates versioned audio entries, absolute platform paths, and unique IDs", () => {
  const windows = mediaAssetSchema.parse({
    id: "song-main",
    type: "audio",
    displayName: "Main song",
    source: { kind: "external-file", path: "C:\\Music\\song.wav" },
  });
  const unc = mediaAssetSchema.parse({
    ...windows,
    id: "unc-song",
    source: {
      kind: "external-file",
      path: "\\\\media-server\\share\\song.mp3",
    },
  });
  const registry = mediaRegistrySchema.parse({
    version: 1,
    assets: [windows, unc],
  });
  assert.equal(registry.assets.length, 2);
  assert.throws(() =>
    mediaRegistrySchema.parse({ version: 1, assets: [windows, windows] }),
  );
  assert.throws(() =>
    mediaAssetSchema.parse({
      ...windows,
      source: { kind: "external-file", path: "..\\private\\song.wav" },
    }),
  );
  assert.throws(() => mediaRegistrySchema.parse({ version: 2, assets: [] }));
  assert.throws(() => mediaAssetSchema.parse({ ...windows, extra: true }));
  const video = mediaAssetSchema.parse({
    id: "video-intro",
    type: "video",
    displayName: "Intro",
    source: { kind: "external-file", path: "C:\\Video\\intro.mp4" },
  });
  assert.equal(video.type, "video");
});

test("host resolver recognizes registered MP4 assets while rejecting invalid headers", async () => {
  const directory = await tempDirectory("floxbow-video-resolver-");
  try {
    const mp4 = path.join(directory, "sample.mp4");
    const corrupt = path.join(directory, "broken.mp4");
    const header = Buffer.alloc(16);
    header.writeUInt32BE(16, 0);
    header.write("ftyp", 4, "ascii");
    header.write("isom", 8, "ascii");
    await writeFile(mp4, header);
    await writeFile(corrupt, Buffer.from("not a video"));
    const registry = mediaRegistrySchema.parse({
      version: 1,
      assets: [
        {
          id: "valid-video",
          type: "video",
          displayName: "Valid header",
          source: { kind: "external-file", path: mp4 },
        },
        {
          id: "invalid-video",
          type: "video",
          displayName: "Invalid header",
          source: { kind: "external-file", path: corrupt },
        },
      ],
    });
    const valid = await resolveMedia(directory, registry, "valid-video");
    assert.equal(valid.status, "ready");
    if (valid.status === "ready") assert.equal(valid.type, "video");
    const invalid = await resolveMedia(directory, registry, "invalid-video");
    assert.equal(invalid.status, "invalid");
    if (invalid.status === "invalid")
      assert.match(invalid.message, /MP4 video header/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("host resolver accepts valid MP3/WAV, reports missing and invalid sources, and never resolves an unregistered ID", async () => {
  const directory = await tempDirectory("floxbow-media-resolver-");
  try {
    const wav = path.join(directory, "sample.wav");
    const mp3 = path.join(directory, "sample.mp3");
    const corrupt = path.join(directory, "broken.wav");
    const directorySource = path.join(directory, "folder.wav");
    await writeFile(wav, wavFixture());
    await writeFile(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    await writeFile(corrupt, Buffer.from("not a wave file"));
    await mkdir(directorySource);

    const registry = mediaRegistrySchema.parse({
      version: 1,
      assets: [
        {
          id: "wav-audio",
          type: "audio",
          displayName: "WAV",
          source: { kind: "external-file", path: wav },
        },
        {
          id: "mp3-audio",
          type: "audio",
          displayName: "MP3",
          source: { kind: "external-file", path: mp3 },
        },
        {
          id: "missing-audio",
          type: "audio",
          displayName: "Missing",
          source: {
            kind: "external-file",
            path: path.join(directory, "gone.wav"),
          },
        },
        {
          id: "wrong-type",
          type: "audio",
          displayName: "Wrong type",
          source: { kind: "external-file", path: corrupt },
        },
        {
          id: "not-file",
          type: "audio",
          displayName: "Not a file",
          source: { kind: "external-file", path: directorySource },
        },
      ],
    });
    assert.equal(
      (await resolveMedia(directory, registry, "wav-audio")).status,
      "ready",
    );
    const mp3Result = await resolveMedia(directory, registry, "mp3-audio");
    assert.equal(mp3Result.status, "ready");
    if (mp3Result.status === "ready") {
      const publicView = publicMediaAvailability(mp3Result);
      assert.deepEqual(publicView, { assetId: "mp3-audio", status: "ready" });
      assert.equal("path" in publicView, false);
    }
    assert.equal(
      (await resolveMedia(directory, registry, "missing-audio")).status,
      "missing",
    );
    assert.equal(
      (await resolveMedia(directory, registry, "wrong-type")).status,
      "invalid",
    );
    assert.equal(
      (await resolveMedia(directory, registry, "not-file")).status,
      "invalid",
    );
    assert.equal(
      (await resolveMedia(directory, registry, "not-registered")).status,
      "invalid",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Windows absolute paths are portable in the schema and resolved only on a compatible host", async () => {
  const root = await tempDirectory("floxbow-media-windows-path-");
  try {
    const registry = {
      version: 1,
      assets: [
        {
          id: "windows-song",
          type: "audio",
          displayName: "Windows song",
          source: { kind: "external-file", path: "C:\\Music\\song.wav" },
        },
      ],
    };
    assert.equal(
      mediaRegistrySchema.parse(registry).assets[0].source.path,
      "C:\\Music\\song.wav",
    );
    if (process.platform !== "win32")
      assert.equal(
        (await resolveMedia(root, registry, "windows-song")).status,
        "invalid",
      );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("projects without media.json stay readable and registration persists a linked path without copying the source", async () => {
  const directory = await tempDirectory("floxbow-media-persist-");
  try {
    const projectRoot = path.join(directory, "project");
    const sourcePath = path.join(directory, "external.wav");
    await mkdir(projectRoot);
    await writeFile(sourcePath, wavFixture());

    const empty = await readMediaRegistry(projectRoot);
    assert.deepEqual(empty.registry, { version: 1, assets: [] });
    assert.equal(
      await readFile(path.join(projectRoot, "media.json")).catch(
        () => undefined,
      ),
      undefined,
    );

    const saved = await registerAudioAsset(
      projectRoot,
      sourcePath,
      empty.revision,
    );
    assert.equal(saved.registry.assets.length, 1);
    assert.match(saved.registry.assets[0].id, /^audio-/);
    assert.equal(saved.registry.assets[0].displayName, "external");
    assert.equal(saved.registry.assets[0].source.path, sourcePath);
    assert.equal((await readFile(sourcePath)).equals(wavFixture()), true);
    assert.equal(
      await readFile(path.join(projectRoot, "media.json"), "utf8").then(
        (text) => JSON.parse(text).version,
      ),
      1,
    );

    const reopened = await readMediaRegistry(projectRoot);
    assert.equal(reopened.revision, saved.revision);
    assert.deepEqual(reopened.registry, saved.registry);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PNG registration creates a stable image asset and never treats it as audio", async () => {
  const directory = await tempDirectory("floxbow-media-image-");
  try {
    const projectRoot = path.join(directory, "project");
    const sourcePath = path.join(directory, "forest.png");
    await mkdir(projectRoot);
    await writeFile(sourcePath, pngFixture());
    const initial = await readMediaRegistry(projectRoot);
    const saved = await registerMediaAsset(
      projectRoot,
      sourcePath,
      "image",
      initial.revision,
    );
    const asset = saved.registry.assets[0];
    assert.match(asset.id, /^image-/);
    assert.equal(asset.type, "image");
    assert.equal(asset.source.path, sourcePath);
    assert.deepEqual(await readFile(sourcePath), pngFixture());
    assert.deepEqual(
      await resolveMedia(projectRoot, saved.registry, asset.id),
      { status: "ready", assetId: asset.id, type: "image", path: sourcePath },
    );
    assert.equal(
      mediaRegistrySchema.parse(saved.registry).assets[0].type,
      "image",
    );
    await assert.rejects(
      registerMediaAsset(
        projectRoot,
        path.join(directory, "forest.wav"),
        "image",
        saved.revision,
      ),
      /Only PNG images/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removal deletes only the chosen registry entry and preserves other IDs and source files", async () => {
  const directory = await tempDirectory("floxbow-media-remove-");
  try {
    const projectRoot = path.join(directory, "project");
    const firstSource = path.join(directory, "first.wav");
    const secondSource = path.join(directory, "second.wav");
    await mkdir(projectRoot);
    await writeFile(firstSource, wavFixture());
    await writeFile(secondSource, wavFixture());

    const initial = await readMediaRegistry(projectRoot);
    const first = await registerAudioAsset(
      projectRoot,
      firstSource,
      initial.revision,
    );
    const two = await registerAudioAsset(
      projectRoot,
      secondSource,
      first.revision,
    );
    const removed = await removeMediaAsset(
      projectRoot,
      two.registry.assets[0].id,
      two.revision,
    );

    assert.deepEqual(
      removed.registry.assets.map((asset) => asset.id),
      [two.registry.assets[1].id],
    );
    assert.equal(removed.registry.assets[0].source.path, secondSource);
    assert.deepEqual(await readFile(firstSource), wavFixture());
    assert.deepEqual(await readFile(secondSource), wavFixture());
    assert.deepEqual(
      (await readMediaRegistry(projectRoot)).registry,
      removed.registry,
    );
    await assert.rejects(
      removeMediaAsset(projectRoot, two.registry.assets[0].id, two.revision),
      /CONFLICT: The media registry changed/,
    );
    await assert.rejects(
      removeMediaAsset(projectRoot, "not-registered", removed.revision),
      /The media asset is not registered/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removing a missing source is safe and concurrent add/remove reports a revision conflict", async () => {
  const directory = await tempDirectory("floxbow-media-remove-race-");
  try {
    const projectRoot = path.join(directory, "project");
    const existingSource = path.join(directory, "missing.wav");
    const concurrentSource = path.join(directory, "concurrent.wav");
    await mkdir(projectRoot);
    await writeFile(existingSource, wavFixture());
    await writeFile(concurrentSource, wavFixture());
    const initial = await readMediaRegistry(projectRoot);
    const saved = await registerAudioAsset(
      projectRoot,
      existingSource,
      initial.revision,
    );
    const id = saved.registry.assets[0].id;
    await unlink(existingSource);

    const removedMissing = await removeMediaAsset(
      projectRoot,
      id,
      saved.revision,
    );
    assert.equal(removedMissing.registry.assets.length, 0);
    assert.equal(
      (await readMediaRegistry(projectRoot)).revision,
      removedMissing.revision,
    );

    await writeFile(existingSource, wavFixture());
    const withAsset = await registerAudioAsset(
      projectRoot,
      concurrentSource,
      removedMissing.revision,
    );
    const concurrent = await Promise.allSettled([
      removeMediaAsset(
        projectRoot,
        withAsset.registry.assets[0].id,
        withAsset.revision,
      ),
      registerAudioAsset(projectRoot, existingSource, withAsset.revision),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejected = concurrent.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.match(
      String(rejected.reason),
      /CONFLICT: The media registry changed/,
    );

    const final = await readMediaRegistry(projectRoot);
    if (concurrent[0].status === "fulfilled") {
      assert.equal(final.registry.assets.length, 0);
    } else {
      assert.equal(final.registry.assets.length, 2);
      assert.equal(
        final.registry.assets[0].id,
        withAsset.registry.assets[0].id,
      );
      assert.deepEqual(await readFile(concurrentSource), wavFixture());
    }
    assert.deepEqual(await readFile(concurrentSource), wavFixture());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("external registry edits become visible and stale UI writes are rejected without losing the external edit", async () => {
  const directory = await tempDirectory("floxbow-media-conflict-");
  try {
    const projectRoot = path.join(directory, "project");
    const sourcePath = path.join(directory, "source.wav");
    await mkdir(projectRoot);
    await writeFile(sourcePath, wavFixture());
    const initial = await readMediaRegistry(projectRoot);
    const saved = await registerAudioAsset(
      projectRoot,
      sourcePath,
      initial.revision,
    );
    const externalRegistry = {
      ...saved.registry,
      assets: [
        ...saved.registry.assets,
        {
          id: "added-by-agent",
          type: "audio",
          displayName: "Added by agent",
          source: { kind: "external-file", path: sourcePath },
        },
      ],
    };
    await writeFile(
      path.join(projectRoot, "media.json"),
      `${JSON.stringify(externalRegistry, null, 2)}\n`,
    );

    const reloaded = await readMediaWithAvailability(projectRoot);
    assert.notEqual(reloaded.revision, saved.revision);
    assert.equal(reloaded.registry.assets.at(-1)?.id, "added-by-agent");
    assert.equal(reloaded.availability.at(-1)?.status, "ready");
    await assert.rejects(
      registerAudioAsset(projectRoot, sourcePath, saved.revision),
      /CONFLICT: The media registry changed/,
    );
    assert.equal(
      (await readMediaRegistry(projectRoot)).registry.assets.length,
      2,
    );

    const duplicateAsset = { ...externalRegistry.assets[0], id: "duplicate" };
    const invalidEdit = {
      version: 1,
      assets: [duplicateAsset, duplicateAsset],
    };
    await writeFile(
      path.join(projectRoot, "media.json"),
      JSON.stringify(invalidEdit),
    );
    await assert.rejects(readMediaRegistry(projectRoot));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Pose Studio imports transparent PNGs as project media and deduplicates identical images", async () => {
  const directory = await tempDirectory("floxbow-pose-import-");
  try {
    const projectRoot = path.join(directory, "project");
    await mkdir(path.join(projectRoot, "assets"), { recursive: true });
    const initial = await readMediaRegistry(projectRoot);
    const pngBase64 = pngFixture().toString("base64");
    const imported = await registerPoseStudioPngs(
      projectRoot,
      initial.revision,
      [
        { poseId: "pose-one", displayName: "Mina · Pose 1", pngBase64 },
        { poseId: "pose-two", displayName: "Mina · Pose 2", pngBase64 },
      ],
    );
    assert.equal(imported.assets.length, 2);
    assert.equal(imported.assets[0].assetId, imported.assets[1].assetId);
    const snapshot = await readMediaWithAvailability(projectRoot);
    assert.equal(snapshot.registry.assets.length, 1);
    assert.equal(snapshot.registry.assets[0].type, "image");
    assert.equal(snapshot.availability[0].status, "ready");
    assert.deepEqual(
      await readFile(
        snapshot.availability[0].status === "ready"
          ? snapshot.availability[0].path
          : "",
      ),
      pngFixture(),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("saved Storyboard reference PNGs become stable Timeline-ready project media", async () => {
  const directory = await tempDirectory("floxbow-storyboard-publish-");
  try {
    const projectRoot = path.join(directory, "project");
    const referenceDirectory = path.join(projectRoot, "assets", "storyboard", "references");
    await mkdir(referenceDirectory, { recursive: true });
    await writeFile(path.join(referenceDirectory, "ref-background.png"), pngFixture());
    await writeFile(path.join(referenceDirectory, "ref-character.png"), pngFixture());
    const initial = await readMediaRegistry(projectRoot);
    const published = await registerStoryboardPngs(projectRoot, initial.revision, [
      { id: "ref-background", name: "Clean background" },
      { id: "ref-character", name: "Character cutout" },
    ]);
    assert.equal(published.assets.length, 2);
    assert.notEqual(published.assets[0].assetId, published.assets[1].assetId);
    const snapshot = await readMediaWithAvailability(projectRoot);
    assert.equal(snapshot.registry.assets.length, 2);
    assert.ok(snapshot.registry.assets.every(asset => asset.source.kind === "external-file" && asset.source.path.includes(`${path.sep}assets${path.sep}storyboard${path.sep}references${path.sep}`)));
    assert.ok(snapshot.availability.every(asset => asset.status === "ready"));
    const repeat = await registerStoryboardPngs(projectRoot, published.revision, [
      { id: "ref-background", name: "Clean background" },
    ]);
    assert.equal(repeat.revision, published.revision);
    assert.equal(repeat.assets[0].assetId, published.assets[0].assetId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing linked audio remains registered and becomes a visible missing status", async () => {
  const directory = await tempDirectory("floxbow-media-missing-");
  try {
    const projectRoot = path.join(directory, "project");
    const sourcePath = path.join(directory, "will-move.wav");
    await mkdir(projectRoot);
    await writeFile(sourcePath, wavFixture());
    const initial = await readMediaRegistry(projectRoot);
    const saved = await registerAudioAsset(
      projectRoot,
      sourcePath,
      initial.revision,
    );
    await unlink(sourcePath);

    const current = await readMediaWithAvailability(projectRoot);
    assert.equal(current.registry.assets.length, 1);
    assert.equal(current.availability[0].status, "missing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
