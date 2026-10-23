import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { readMediaRegistry } from "./media-store";
import { resolveMedia } from "@motion/project-loader/media";

export async function streamRegisteredMedia(
  projectRoot: string,
  assetId: string,
  rangeHeader: string | undefined,
  response: ServerResponse,
) {
  const registry = await readMediaRegistry(projectRoot);
  const resolved = await resolveMedia(projectRoot, registry.registry, assetId);
  if (resolved.status !== "ready") {
    response.writeHead(resolved.status === "missing" ? 404 : 422, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(
      resolved.status === "missing"
        ? "The selected media file is missing."
        : resolved.message,
    );
    return;
  }
  const info = await stat(resolved.path);
  const mime =
    resolved.type === "image"
      ? "image/png"
      : resolved.type === "video"
        ? "video/mp4"
        : path.extname(resolved.path).toLowerCase() === ".mp3"
          ? "audio/mpeg"
          : "audio/wav";
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Type", mime);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  let start = 0;
  let end = info.size - 1;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match || (!match[1] && !match[2])) {
      response
        .writeHead(416, { "Content-Range": `bytes */${info.size}` })
        .end();
      return;
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) {
        response
          .writeHead(416, { "Content-Range": `bytes */${info.size}` })
          .end();
        return;
      }
      start = Math.max(0, info.size - suffix);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= info.size
    ) {
      response
        .writeHead(416, { "Content-Range": `bytes */${info.size}` })
        .end();
      return;
    }
    end = Math.min(end, info.size - 1);
    response.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${info.size}`,
      "Content-Length": end - start + 1,
    });
  } else {
    response.writeHead(200, { "Content-Length": info.size });
  }
  createReadStream(resolved.path, { start, end }).pipe(response);
}

export const streamRegisteredAudio = streamRegisteredMedia;

/** Stream only a validated registered PNG for the trusted shell's media thumbnail. */
export async function streamRegisteredImage(
  projectRoot: string,
  assetId: string,
  response: ServerResponse,
) {
  const registry = await readMediaRegistry(projectRoot);
  const resolved = await resolveMedia(projectRoot, registry.registry, assetId);
  if (resolved.status !== "ready" || resolved.type !== "image") {
    response.writeHead(resolved.status === "missing" ? 404 : 422, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(
      resolved.status === "missing"
        ? "The registered image file is missing."
        : resolved.status === "invalid"
          ? resolved.message
          : "The requested media asset is not an image.",
    );
    return;
  }
  const info = await stat(resolved.path);
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": info.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(resolved.path).pipe(response);
}
