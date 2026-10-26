import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  lstat,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { probeVideo } from "./video-probe";
import {
  emptyMediaRegistry,
  mediaAssetSchema,
  mediaRegistrySchema,
  resolveMedia,
  type MediaAsset,
  type MediaRegistry,
  type MediaResolution,
} from "@motion/project-loader/media";

const registryName = "media.json";
const maxRegistryBytes = 1_000_000;
const missingRevision = createHash("sha256")
  .update("media-registry:missing")
  .digest("hex");
const locks = new Map<string, Promise<unknown>>();

export type MediaSnapshot = { registry: MediaRegistry; revision: string };

const maxPoseStudioPngBytes = 2_000_000;
const maxPoseStudioImportBytes = 16_000_000;

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

async function getRegistryFile(projectRoot: string) {
  const root = await realpath(projectRoot);
  const file = path.join(root, registryName);
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error("The project media registry must be a regular file.");
    if (info.size > maxRegistryBytes)
      throw new Error("The project media registry is too large.");
    const resolved = await realpath(file);
    if (path.dirname(resolved) !== root)
      throw new Error("The project media registry path is unsafe.");
    return { root, file: resolved };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { root, file };
    throw error;
  }
}

export async function readMediaRegistry(
  projectRoot: string,
): Promise<MediaSnapshot> {
  const { file } = await getRegistryFile(projectRoot);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        registry: structuredClone(emptyMediaRegistry),
        revision: missingRevision,
      };
    throw error;
  }
  return {
    registry: mediaRegistrySchema.parse(JSON.parse(text)),
    revision: hash(text),
  };
}

async function persistMediaRegistry(
  projectRoot: string,
  registryInput: unknown,
  expectedRevision: string,
): Promise<MediaSnapshot> {
  const registry = mediaRegistrySchema.parse(registryInput);
  const root = await realpath(projectRoot);
  const previous = locks.get(root) ?? Promise.resolve();
  const job = previous
    .catch(() => {})
    .then(async () => {
      const current = await readMediaRegistry(root);
      if (current.revision !== expectedRevision)
        throw new Error(
          "CONFLICT: The media registry changed on disk. Reload it before saving.",
        );

      const file = path.join(root, registryName);
      const temporary = path.join(root, `.media-${randomUUID()}.tmp`);
      const contents = `${JSON.stringify(registry, null, 2)}\n`;
      try {
        await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
        const latest = await readMediaRegistry(root);
        if (latest.revision !== expectedRevision)
          throw new Error("CONFLICT: The media registry changed while saving.");
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return readMediaRegistry(root);
    });
  locks.set(root, job);
  try {
    return await job;
  } finally {
    if (locks.get(root) === job) locks.delete(root);
  }
}

function mediaAssetFromPath(
  sourcePath: string,
  type: MediaAsset["type"],
): MediaAsset {
  const pathApi = path.win32.isAbsolute(sourcePath) ? path.win32 : path;
  const extension = pathApi.extname(sourcePath);
  return mediaAssetSchema.parse({
    id: `${type}-${randomUUID()}`,
    type,
    displayName: pathApi.basename(sourcePath, extension),
    source: { kind: "external-file", path: sourcePath },
  });
}

export async function registerMediaAsset(
  projectRoot: string,
  sourcePath: string,
  type: MediaAsset["type"],
  expectedRevision: string,
): Promise<MediaSnapshot> {
  const current = await readMediaRegistry(projectRoot);
  if (current.revision !== expectedRevision)
    throw new Error(
      "CONFLICT: The media registry changed on disk. Reload it before adding audio.",
    );

  const asset = mediaAssetFromPath(sourcePath, type);
  const registry = mediaRegistrySchema.parse({
    ...current.registry,
    assets: [...current.registry.assets, asset],
  });
  const resolution = await resolveMedia(projectRoot, registry, asset.id);
  if (resolution.status !== "ready")
    throw new Error(
      resolution.status === "invalid"
        ? resolution.message
        : `The selected ${type} file is missing.`,
    );
  if (type === "video") await probeVideo(resolution.path);

  return persistMediaRegistry(projectRoot, registry, expectedRevision);
}

/** Save generated pose crops inside a project and register them as ordinary PNG media. */
export async function registerPoseStudioPngs(
  projectRoot: string,
  expectedRevision: string,
  input: unknown,
): Promise<{
  revision: string;
  assets: Array<{ poseId: string; assetId: string }>;
}> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100)
    throw new Error("Import between 1 and 100 animation poses at a time.");
  const poses = input.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("An imported pose image is invalid.");
    const item = value as Record<string, unknown>;
    if (
      Object.keys(item).some(
        (key) => !["poseId", "displayName", "pngBase64"].includes(key),
      ) ||
      typeof item.poseId !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.poseId) ||
      item.poseId.length > 120 ||
      typeof item.displayName !== "string" ||
      !item.displayName.trim() ||
      item.displayName.length > 100 ||
      typeof item.pngBase64 !== "string" ||
      item.pngBase64.length > Math.ceil((maxPoseStudioPngBytes * 4) / 3) + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        item.pngBase64,
      )
    )
      throw new Error("An imported pose image has invalid fields.");
    const bytes = Buffer.from(item.pngBase64, "base64");
    if (
      bytes.length < 45 ||
      bytes.length > maxPoseStudioPngBytes ||
      bytes.toString("base64") !== item.pngBase64
    )
      throw new Error("An imported pose image is empty or too large.");
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND"
    )
      throw new Error("Pose images must be valid PNG files.");
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      !width ||
      !height ||
      width > 4096 ||
      height > 4096 ||
      width * height > 8_000_000
    )
      throw new Error("A pose image exceeds the allowed dimensions.");
    return { poseId: item.poseId, displayName: item.displayName.trim(), bytes };
  });
  if (new Set(poses.map((pose) => pose.poseId)).size !== poses.length)
    throw new Error("Animation pose IDs must be unique.");
  if (
    poses.reduce((total, pose) => total + pose.bytes.length, 0) >
    maxPoseStudioImportBytes
  )
    throw new Error("The selected animation is too large to import at once.");

  const current = await readMediaRegistry(projectRoot);
  if (current.revision !== expectedRevision)
    throw new Error(
      "CONFLICT: The project media registry changed. Reload it and try again.",
    );
  const root = await realpath(projectRoot);
  const assetsDirectory = path.join(root, "assets");
  await mkdir(assetsDirectory, { recursive: true });
  const assetsInfo = await lstat(assetsDirectory);
  if (
    assetsInfo.isSymbolicLink() ||
    !assetsInfo.isDirectory() ||
    (await realpath(assetsDirectory)) !== assetsDirectory
  )
    throw new Error("The project assets folder is not a safe directory.");
  const poseDirectory = path.join(assetsDirectory, "pose-studio");
  await mkdir(poseDirectory, { recursive: true });
  const poseInfo = await lstat(poseDirectory);
  if (
    poseInfo.isSymbolicLink() ||
    !poseInfo.isDirectory() ||
    (await realpath(poseDirectory)) !== poseDirectory
  )
    throw new Error("The project pose-assets folder is not a safe directory.");

  const addedAssets: MediaAsset[] = [];
  const result: Array<{ poseId: string; assetId: string }> = [];
  for (const pose of poses) {
    const digest = createHash("sha256").update(pose.bytes).digest("hex");
    const assetId = `pose-${digest.slice(0, 48)}`;
    const filePath = path.join(poseDirectory, `${assetId}.png`);
    const existing = current.registry.assets.find(
      (asset) => asset.id === assetId,
    );
    if (existing) {
      if (
        existing.type !== "image" ||
        existing.source.kind !== "external-file" ||
        existing.source.path !== filePath
      )
        throw new Error(
          "A generated pose asset ID conflicts with existing project media.",
        );
    } else {
      try {
        await writeFile(filePath, pose.bytes, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existingBytes = await readFile(filePath);
        if (!existingBytes.equals(pose.bytes))
          throw new Error(
            "A generated pose asset file already exists with different content.",
          );
      }
      addedAssets.push(
        mediaAssetSchema.parse({
          id: assetId,
          type: "image",
          displayName: pose.displayName.slice(0, 200),
          source: { kind: "external-file", path: filePath },
        }),
      );
    }
    result.push({ poseId: pose.poseId, assetId });
  }
  const uniqueAdded = addedAssets.filter(
    (asset, index, list) =>
      list.findIndex((candidate) => candidate.id === asset.id) === index,
  );
  const registry = mediaRegistrySchema.parse({
    ...current.registry,
    assets: [...current.registry.assets, ...uniqueAdded],
  });
  const saved = uniqueAdded.length
    ? await persistMediaRegistry(root, registry, expectedRevision)
    : current;
  return { revision: saved.revision, assets: result };
}

/** Backward-compatible helper for existing soundtrack registration callers. */
export async function registerAudioAsset(
  projectRoot: string,
  sourcePath: string,
  expectedRevision: string,
): Promise<MediaSnapshot> {
  return registerMediaAsset(projectRoot, sourcePath, "audio", expectedRevision);
}

export async function removeMediaAsset(
  projectRoot: string,
  assetId: string,
  expectedRevision: string,
): Promise<MediaSnapshot> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assetId) || assetId.length > 120)
    throw new Error("The media asset ID is invalid.");

  const current = await readMediaRegistry(projectRoot);
  if (current.revision !== expectedRevision)
    throw new Error(
      "CONFLICT: The media registry changed on disk. Reload it before removing audio.",
    );
  if (!current.registry.assets.some((asset) => asset.id === assetId))
    throw new Error(`The media asset is not registered: ${assetId}`);

  const registry = mediaRegistrySchema.parse({
    ...current.registry,
    assets: current.registry.assets.filter((asset) => asset.id !== assetId),
  });
  return persistMediaRegistry(projectRoot, registry, expectedRevision);
}

export async function readMediaWithAvailability(projectRoot: string) {
  const snapshot = await readMediaRegistry(projectRoot);
  const availability = await Promise.all(
    snapshot.registry.assets.map(async (asset): Promise<MediaResolution> =>
      resolveMedia(projectRoot, snapshot.registry, asset.id),
    ),
  );
  return { ...snapshot, availability };
}

export function publicMediaAvailability(resolution: MediaResolution) {
  if (resolution.status === "ready")
    return { assetId: resolution.assetId, status: resolution.status } as const;
  if (resolution.status === "missing")
    return { assetId: resolution.assetId, status: resolution.status } as const;
  return {
    assetId: resolution.assetId,
    status: resolution.status,
    message: resolution.message,
  } as const;
}
