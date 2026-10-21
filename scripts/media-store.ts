import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
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
const missingRevision = createHash("sha256").update("media-registry:missing").digest("hex");
const locks = new Map<string, Promise<unknown>>();

export type MediaSnapshot = { registry: MediaRegistry; revision: string };

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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { root, file };
    throw error;
  }
}

export async function readMediaRegistry(projectRoot: string): Promise<MediaSnapshot> {
  const { file } = await getRegistryFile(projectRoot);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { registry: structuredClone(emptyMediaRegistry), revision: missingRevision };
    throw error;
  }
  return { registry: mediaRegistrySchema.parse(JSON.parse(text)), revision: hash(text) };
}

async function persistMediaRegistry(
  projectRoot: string,
  registryInput: unknown,
  expectedRevision: string,
): Promise<MediaSnapshot> {
  const registry = mediaRegistrySchema.parse(registryInput);
  const root = await realpath(projectRoot);
  const previous = locks.get(root) ?? Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const current = await readMediaRegistry(root);
    if (current.revision !== expectedRevision)
      throw new Error("CONFLICT: The media registry changed on disk. Reload it before saving.");

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

function audioAssetFromPath(sourcePath: string): MediaAsset {
  const pathApi = path.win32.isAbsolute(sourcePath) ? path.win32 : path;
  const extension = pathApi.extname(sourcePath);
  return mediaAssetSchema.parse({
    id: `audio-${randomUUID()}`,
    type: "audio",
    displayName: pathApi.basename(sourcePath, extension),
    source: { kind: "external-file", path: sourcePath },
  });
}

export async function registerAudioAsset(
  projectRoot: string,
  sourcePath: string,
  expectedRevision: string,
): Promise<MediaSnapshot> {
  const current = await readMediaRegistry(projectRoot);
  if (current.revision !== expectedRevision)
    throw new Error("CONFLICT: The media registry changed on disk. Reload it before adding audio.");

  const asset = audioAssetFromPath(sourcePath);
  const registry = mediaRegistrySchema.parse({
    ...current.registry,
    assets: [...current.registry.assets, asset],
  });
  const resolution = await resolveMedia(projectRoot, registry, asset.id);
  if (resolution.status !== "ready")
    throw new Error(resolution.status === "invalid" ? resolution.message : "The selected audio file is missing.");

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
