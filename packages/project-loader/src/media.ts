import { open, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const absolutePath = z
  .string()
  .min(1)
  .max(32_768)
  .refine(
    (value) =>
      !value.includes("\0") &&
      (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) &&
      !value.startsWith("\\\\.\\") &&
      !value.startsWith("\\\\?\\GLOBALROOT"),
    "External media path must be an absolute filesystem path",
  );

export const mediaAssetSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    type: z.enum(["audio", "image", "video"]),
    displayName: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => value.trim().length > 0, "Display name is required"),
    source: z
      .object({ kind: z.literal("external-file"), path: absolutePath })
      .strict(),
  })
  .strict();

export const mediaRegistrySchema = z
  .object({
    version: z.literal(1),
    assets: z.array(mediaAssetSchema).max(2_000),
  })
  .strict()
  .superRefine((registry, context) => {
    const ids = new Set<string>();
    registry.assets.forEach((asset, index) => {
      if (ids.has(asset.id)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "id"],
          message: `Duplicate media asset ID: ${asset.id}`,
        });
      }
      ids.add(asset.id);
    });
  });

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type MediaRegistry = z.infer<typeof mediaRegistrySchema>;
export const emptyMediaRegistry: MediaRegistry = { version: 1, assets: [] };

export type MediaResolution =
  | {
      status: "ready";
      assetId: string;
      type: "audio" | "image" | "video";
      path: string;
    }
  | { status: "missing"; assetId: string; displayName: string }
  | { status: "invalid"; assetId: string; message: string };

function isHostAbsolutePath(value: string) {
  return process.platform === "win32"
    ? path.win32.isAbsolute(value)
    : path.posix.isAbsolute(value);
}

function hasMp3FrameHeader(buffer: Buffer) {
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    const header = buffer.readUInt32BE(index);
    const sync = header >>> 21 === 0x7ff;
    const version = (header >>> 19) & 0b11;
    const layer = (header >>> 17) & 0b11;
    const bitrate = (header >>> 12) & 0b1111;
    const sampleRate = (header >>> 10) & 0b11;
    if (
      sync &&
      version !== 0b01 &&
      layer !== 0 &&
      bitrate !== 0 &&
      bitrate !== 0b1111 &&
      sampleRate !== 0b11
    )
      return true;
  }
  return false;
}

async function hasSupportedAudioHeader(filePath: string, extension: string) {
  const handle = await open(filePath, "r");
  try {
    if (extension === ".wav") {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return (
        bytesRead === header.length &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "WAVE"
      );
    }

    const start = Buffer.alloc(10);
    const { bytesRead: startBytes } = await handle.read(
      start,
      0,
      start.length,
      0,
    );
    let frameOffset = 0;
    if (
      startBytes === start.length &&
      start.toString("ascii", 0, 3) === "ID3"
    ) {
      const validTagSize = [6, 7, 8, 9].every(
        (index) => (start[index] & 0x80) === 0,
      );
      if (!validTagSize) return false;
      const tagSize =
        (start[6] << 21) | (start[7] << 14) | (start[8] << 7) | start[9];
      frameOffset =
        10 + tagSize + (start[3] === 4 && (start[5] & 0x10) !== 0 ? 10 : 0);
    }
    const sample = Buffer.alloc(4_096);
    const { bytesRead } = await handle.read(
      sample,
      0,
      sample.length,
      frameOffset,
    );
    return hasMp3FrameHeader(sample.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

async function hasPngHeader(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(8);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    return (
      bytesRead === 8 &&
      signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  } finally {
    await handle.close();
  }
}

async function hasMp4Header(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return (
      bytesRead === header.length && header.toString("ascii", 4, 8) === "ftyp"
    );
  } finally {
    await handle.close();
  }
}

/** Resolve a registered audio, image, or video asset in a Node host process. Never send `path` to a browser preview. */
export async function resolveMedia(
  projectRoot: string,
  registryInput: unknown,
  assetId: string,
): Promise<MediaResolution> {
  let registry: MediaRegistry;
  try {
    registry = mediaRegistrySchema.parse(registryInput);
  } catch {
    return {
      status: "invalid",
      assetId,
      message: "The media registry is invalid.",
    };
  }

  const asset = registry.assets.find((entry) => entry.id === assetId);
  if (!asset)
    return {
      status: "invalid",
      assetId,
      message: "The media asset is not registered.",
    };

  const filePath = asset.source.path;
  if (!isHostAbsolutePath(filePath))
    return {
      status: "invalid",
      assetId,
      message: "The source path is not absolute on this host.",
    };

  const extension = path.extname(filePath).toLowerCase();
  if (
    (asset.type === "audio" && extension !== ".mp3" && extension !== ".wav") ||
    (asset.type === "image" && extension !== ".png") ||
    (asset.type === "video" && extension !== ".mp4")
  )
    return {
      status: "invalid",
      assetId,
      message:
        asset.type === "audio"
          ? "Only MP3 and WAV audio files are supported."
          : asset.type === "image"
            ? "Only PNG images are supported."
            : "Only MP4 videos are supported.",
    };

  let info;
  try {
    info = await stat(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR")
      return { status: "missing", assetId, displayName: asset.displayName };
    return {
      status: "invalid",
      assetId,
      message: "The source file cannot be accessed.",
    };
  }

  if (!info.isFile())
    return {
      status: "invalid",
      assetId,
      message: "The source is not a regular file.",
    };
  if (info.size === 0)
    return {
      status: "invalid",
      assetId,
      message: "The source media file is empty.",
    };

  try {
    const valid =
      asset.type === "audio"
        ? await hasSupportedAudioHeader(filePath, extension)
        : asset.type === "image"
          ? await hasPngHeader(filePath)
          : await hasMp4Header(filePath);
    if (!valid)
      return {
        status: "invalid",
        assetId,
        message:
          asset.type === "audio"
            ? "The file does not contain a valid MP3 or WAV header."
            : asset.type === "image"
              ? "The file does not contain a valid PNG header."
              : "The file does not contain an MP4 video header.",
      };
  } catch {
    return {
      status: "invalid",
      assetId,
      message: "The source media file cannot be read.",
    };
  }

  return { status: "ready", assetId, type: asset.type, path: filePath };
}
