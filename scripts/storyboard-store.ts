import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
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
  directorPlanFingerprint,
  filmApprovalStatus,
  sceneApprovalStatus,
  sceneFingerprint,
  type Storyboard,
} from "@motion/project-loader/storyboard";
import { resolveMedia } from "@motion/project-loader/media";
import { getSubtitleCues } from "@motion/lyrics-sync/subtitles";
import { renderStoryboardSvg } from "@motion/project-loader/storyboard-svg";
import { withProjectWriteLock } from "./project-write-lock";
import { readEditor, renameWithTransientWindowsRetry } from "./editor-store";
import { readMediaRegistry } from "./media-store";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxReferenceBytes = 25 * 1024 * 1024;

async function ensureProjectDirectory(root: string, relative: string) {
  const base = await realpath(root);
  let current = base;
  for (const segment of relative.split(/[\\/]/)) {
    current = path.join(current, segment);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new Error("Storyboard asset folders must be real project folders.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
    }
    const resolved = await realpath(current);
    const relativePath = path.relative(base, resolved);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath))
      throw new Error("Storyboard asset folder escapes the project.");
    current = resolved;
  }
  return current;
}

async function verifyPng(file: string) {
  const info = await stat(file);
  if (!info.isFile() || info.size < 33 || info.size > maxReferenceBytes)
    throw new Error("Storyboard reference must be a PNG under 25 MB.");
  const bytes = await readFile(file);
  if (
    !bytes.subarray(0, pngSignature.length).equals(pngSignature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    ![0, 2, 3, 4, 6].includes(bytes[25])
  )
    throw new Error("Storyboard reference is not a valid PNG image.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 32768 || height > 32768)
    throw new Error("Storyboard PNG dimensions are invalid or too large.");
  let hasAlpha = bytes[25] === 4 || bytes[25] === 6;
  let endSeen = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const chunkLength = bytes.readUInt32BE(offset);
    if (chunkLength > bytes.length - offset - 12)
      throw new Error("Storyboard PNG has an incomplete chunk.");
    if (bytes.toString("ascii", offset + 4, offset + 8) === "tRNS") hasAlpha = true;
    const chunkType = bytes.toString("ascii", offset + 4, offset + 8);
    offset += chunkLength + 12;
    if (chunkType === "IEND") {
      endSeen = true;
      break;
    }
  }
  if (!endSeen) throw new Error("Storyboard PNG is missing its end marker.");
  return { width, height, hasAlpha };
}

async function persistReferenceFiles(root: string, input: Storyboard) {
  if (!input.references.length) return input;
  const registry = await readMediaRegistry(root);
  const references = [];
  for (const reference of input.references) {
    const relative = `assets/storyboard/references/${reference.id}.png`;
    const destination = path.join(root, relative);
    let exists = false;
    try {
      const info = await lstat(destination);
      if (info.isSymbolicLink() || !info.isFile())
        throw new Error("Storyboard reference file must be a regular file.");
      await safeFile(root, relative);
      await verifyPng(destination);
      exists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!exists && reference.origin === "ai")
      throw new Error(`Generated storyboard image is missing: ${relative}`);
    if (!exists) {
      const resolved = await resolveMedia(root, registry.registry, reference.assetId);
      if (resolved.status !== "ready" || resolved.type !== "image")
        throw new Error(
          resolved.status === "invalid"
            ? resolved.message
            : `Reference image is unavailable: ${reference.name}`,
        );
      await verifyPng(resolved.path);
      await ensureProjectDirectory(root, "assets/storyboard/references");
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await copyFile(resolved.path, temporary);
        await verifyPng(temporary);
        // The reference destination is newly created in a private project folder;
        // copy it into place to avoid transient Windows rename locks from AV scanners.
        await copyFile(temporary, destination);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    }
    const imageInfo = await verifyPng(destination);
    const sha256 = createHash("sha256").update(await readFile(destination)).digest("hex");
    if (reference.sha256 && reference.sha256 !== sha256)
      throw new Error(
        `Storyboard image ${reference.id} changed in place. Add a new reference ID for each visual revision.`,
      );
    if (
      (reference.width !== undefined && reference.width !== imageInfo.width) ||
      (reference.height !== undefined && reference.height !== imageInfo.height) ||
      (reference.hasAlpha !== undefined && reference.hasAlpha !== imageInfo.hasAlpha)
    )
      throw new Error(`Storyboard image ${reference.id} metadata does not match its file.`);
    references.push({ ...reference, file: relative, sha256, ...imageInfo });
  }
  return { ...input, references };
}

async function hydrateReferenceHashes(root: string, input: Storyboard) {
  const assetDrift: string[] = [];
  const references = await Promise.all(
    input.references.map(async (reference) => {
      if (!reference.file) return reference;
      let file: string;
      try {
        file = await safeFile(root, reference.file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          if (reference.sha256) assetDrift.push(reference.id);
          return reference;
        }
        throw error;
      }
      const info = await lstat(file);
      if (info.isSymbolicLink() || !info.isFile())
        throw new Error(`Storyboard reference ${reference.id} is not a regular file.`);
      const imageInfo = await verifyPng(file);
      const sha256 = createHash("sha256").update(await readFile(file)).digest("hex");
      if (reference.sha256 && reference.sha256 !== sha256)
        assetDrift.push(reference.id);
      const metadataChanged =
        (reference.width !== undefined && reference.width !== imageInfo.width) ||
        (reference.height !== undefined && reference.height !== imageInfo.height) ||
        (reference.hasAlpha !== undefined && reference.hasAlpha !== imageInfo.hasAlpha);
      if (metadataChanged) assetDrift.push(reference.id);
      return reference.sha256
        ? reference
        : { ...reference, sha256, ...imageInfo };
    }),
  );
  return { document: { ...input, references }, assetDrift };
}

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
        assetDrift: [],
      };
    }
    throw e;
  }
  if (Buffer.byteLength(text) > 8_000_000)
    throw new Error("Storyboard exceeds 8 MB");
  const { document, assetDrift } = await hydrateReferenceHashes(
    root,
    storyboardSchema.parse(JSON.parse(text)),
  );
  if (document.projectId !== projectId)
    throw new Error("Storyboard project identity mismatch");
  return { document, revision: digest(text), assetDrift };
}
export async function saveStoryboard(
  root: string,
  projectId: string,
  input: unknown,
  revision: string,
) {
  return withProjectWriteLock(root, async () => {
    const parsedDocument = storyboardSchema.parse(input);
    const document = await persistReferenceFiles(root, parsedDocument);
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
    return { document, revision: digest(text), assetDrift: [] as string[] };
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
    case "getStoryboardReference": {
      const reference = doc.references.find((r) => r.id === identity);
      result = reference && { ...reference, projectRelativeFile: reference.file ?? null };
      break;
    }
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
        aiImageRequests: doc.aiRequests.filter(
          (request) => request.sceneId === scene.id && request.setId === set.id,
        ),
        motionPlans: doc.actionPlans.filter(
          (plan) => plan.sceneId === scene.id && (plan.fromSetId === set.id || plan.toSetId === set.id),
        ),
        annotations: doc.annotations.filter(
          (annotation) => annotation.sceneId === scene.id && annotation.setId === set.id,
        ),
        projectAssetRoot: ".",
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
    directorPlan: {
      fingerprint: directorPlanFingerprint(doc),
      filmApproval: filmApprovalStatus(doc, snapshot.assetDrift),
      changedAssetReferenceIds: snapshot.assetDrift,
      sceneApprovals: doc.scenes.map((item) => ({
        sceneId: item.id,
        status: sceneApprovalStatus(doc, item, snapshot.assetDrift),
      })),
    },
    changedAssetReferenceIds: snapshot.assetDrift,
    result,
  };
}
