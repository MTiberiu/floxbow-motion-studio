import {
  imageBoundsInComposition as getImageBoundsInComposition,
  imagePointToComposition,
  directorBrief,
  storyboardSchema,
  type Storyboard,
  type StoryFormat,
  type StorySet,
  type Representation,
} from "@motion/project-loader/storyboard";
import type { SubtitleCue } from "@motion/lyrics-sync/subtitles";
import { apiRoutes } from "./api-routes";
export type StoryTimingContext = {
  revision: string;
  cues: SubtitleCue[];
  audio: {
    clipId: string;
    assetId: string;
    start: number;
    duration: number;
    sourceStart: number;
  }[];
};
export function timingContextText(timing: StoryTimingContext) {
  return [
    "## Saved audio and subtitle evidence",
    `Source Timeline revision: ${timing.revision}. These are source times, not automatically intended action times.`,
    ...timing.audio.map(
      (a) =>
        `Audio ${a.clipId}, media ${a.assetId}: project ${a.start}–${a.start + a.duration}s; source in-point ${a.sourceStart}s.`,
    ),
    ...timing.cues.map(
      (c) =>
        `${c.id}: ${c.start}–${c.end}s: ${c.text} (${c.status}; word timing ${c.wordTimingStatus}).\n${c.wordTimingStatus === "matches-text" ? (c.words?.map((w) => `${w.id}: ${w.text} ${w.start}–${w.end}s`).join("; ") ?? "No word timing") : "No trustworthy word-to-text mapping supplied."}`,
    ),
  ].join("\n\n");
}
export function containImageRect(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number) {
  if (![imageWidth, imageHeight, boxWidth, boxHeight].every(value => Number.isFinite(value) && value > 0))
    return { x: 0, y: 0, width: Math.max(0, boxWidth), height: Math.max(0, boxHeight) };
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale, height = imageHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}
export function paintRepresentation(
  ctx: CanvasRenderingContext2D,
  representation: Representation,
  images: Record<string, HTMLImageElement> = {},
  editorPreview = false,
) {
  const r = {
    ...representation,
    x: (representation.x * ctx.canvas.width) / 100,
    y: (representation.y * ctx.canvas.height) / 100,
    width: (representation.width * ctx.canvas.width) / 100,
    height: (representation.height * ctx.canvas.height) / 100,
  };
  if (!r.visible) return;
  if (representation.rasterDataUrl) {
    const raster = images[representation.id];
    if (raster) {
      const b = representation.rasterBounds ?? { x: 0, y: 0, width: 100, height: 100 };
      ctx.save();
      ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
      ctx.rotate((r.rotation * Math.PI) / 180);
      ctx.globalAlpha = r.opacity;
      ctx.drawImage(
        raster,
        b.x * ctx.canvas.width / 100,
        b.y * ctx.canvas.height / 100,
        b.width * ctx.canvas.width / 100,
        b.height * ctx.canvas.height / 100,
        -r.width / 2,
        -r.height / 2,
        r.width,
        r.height,
      );
      ctx.restore();
    }
    return;
  }
  if (representation.elements !== undefined) {
    ctx.save();
    ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
    ctx.rotate((r.rotation * Math.PI) / 180);
    ctx.translate(-r.x - r.width / 2, -r.y - r.height / 2);
    ctx.globalAlpha = representation.opacity;
    for (const element of representation.elements) {
      paintElement(ctx, element, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
  ctx.rotate((r.rotation * Math.PI) / 180);
  ctx.translate(-r.width / 2, -r.height / 2);
  ctx.globalAlpha = r.kind === "reference" && !editorPreview ? 1 : r.opacity;
  ctx.strokeStyle = r.color;
  ctx.fillStyle = r.color;
  ctx.lineWidth = r.thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (r.kind === "rectangle") ctx.strokeRect(0, 0, r.width, r.height);
  if (r.kind === "ellipse") {
    ctx.ellipse(
      r.width / 2,
      r.height / 2,
      r.width / 2,
      r.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  if (r.kind === "line") {
    ctx.moveTo(0, 0);
    ctx.lineTo(r.width, r.height);
    ctx.stroke();
  }
  if (r.kind === "pencil") {
    r.points.forEach(([x, y], i) =>
      i
        ? ctx.lineTo(x * r.width, y * r.height)
        : ctx.moveTo(x * r.width, y * r.height),
    );
    ctx.stroke();
  }
  if (r.kind === "text") {
    ctx.font = `${r.height}px sans-serif`;
    ctx.fillText(r.text, 0, r.height, r.width);
  }
  if (r.kind === "reference") {
    const image = images[r.referenceId ?? ""];
    if (image) {
      const fitMode = representation.imageFit ?? "contain";
      const fit = getImageBoundsInComposition(representation, image.naturalWidth, image.naturalHeight, ctx.canvas.width, ctx.canvas.height, fitMode);
      const imageX = (fit.x - representation.x) * ctx.canvas.width / 100;
      const imageY = (fit.y - representation.y) * ctx.canvas.height / 100;
      const imageWidth = fit.width * ctx.canvas.width / 100;
      const imageHeight = fit.height * ctx.canvas.height / 100;
      if (fitMode === "cover") {
        ctx.beginPath();
        ctx.rect(0, 0, r.width, r.height);
        ctx.clip();
      }
      ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);
    }
    else {
      ctx.strokeRect(0, 0, r.width, r.height);
      ctx.font = "24px sans-serif";
      ctx.fillText("Missing reference", 0, 26, r.width);
    }
  }
  ctx.restore();
}
function paintElement(
  ctx: CanvasRenderingContext2D,
  element: NonNullable<Representation["elements"]>[number],
  canvasWidth: number,
  canvasHeight: number,
) {
  const x = (element.x * canvasWidth) / 100;
  const y = (element.y * canvasHeight) / 100;
  const width = (element.width * canvasWidth) / 100;
  const height = (element.height * canvasHeight) / 100;
  ctx.save();
  ctx.strokeStyle = element.color;
  ctx.fillStyle = element.color;
  ctx.lineWidth = element.thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (element.kind === "rectangle") ctx.strokeRect(x, y, width, height);
  if (element.kind === "ellipse") {
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (element.kind === "line") {
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();
  }
  if (element.kind === "pencil") {
    const pts = element.points.map(([px, py]) => [x + px * width, y + py * height] as const);
    if (pts.length === 1) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[0][0] + .01, pts[0][1] + .01);
    } else if (pts.length > 1) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i][0] + pts[i + 1][0]) / 2;
        const midY = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
      }
      ctx.lineTo(pts.at(-1)![0], pts.at(-1)![1]);
    }
    ctx.stroke();
  }
  if (element.kind === "text") {
    ctx.font = `${Math.max(12, height)}px sans-serif`;
    ctx.fillText(element.text, x, y + height, width);
  }
  ctx.restore();
}
export async function loadReferenceImages(doc: Storyboard) {
  const images: Record<string, HTMLImageElement> = {};
  await Promise.all(
    doc.references.map(async (ref) => {
      const image = new Image();
      image.src = apiRoutes.storyboard.reference(doc.projectId, ref.id, ref.assetId);
      try {
        await image.decode();
        images[ref.id] = image;
      } catch {
        /* Missing references stay explicit in sketch and package manifest. */
      }
    }),
  );
  await Promise.all(
    doc.scenes.flatMap((scene) => scene.sets).flatMap((set) => set.representations)
      .filter((representation) => representation.rasterDataUrl)
      .map(async (representation) => {
        const image = new Image();
        image.src = representation.rasterDataUrl!;
        try {
          await image.decode();
          images[representation.id] = image;
        } catch {
          /* A damaged drawing remains visible as a missing layer in JSON. */
        }
      }),
  );
  return images;
}
async function rasterImages(representations: Representation[], images: Record<string, HTMLImageElement>) {
  const resolved = { ...images };
  await Promise.all(representations.filter(r => r.rasterDataUrl && !resolved[r.id]).map(async r => {
    const image = new Image(); image.src = r.rasterDataUrl!;
    try { await image.decode(); resolved[r.id] = image; } catch { /* Keep damaged raster data explicit without blocking other layers. */ }
  }));
  return resolved;
}
export async function sketchPng(
  set: StorySet,
  format: StoryFormat,
  images: Record<string, HTMLImageElement> = {},
  annotations: Storyboard["annotations"] = [],
) {
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d")!;
  images = await rasterImages(set.representations, images);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const visibleRepresentations = set.representations.filter(representation => representation.visible);
  if (visibleRepresentations.length === 0 && set.referenceImageId && images[set.referenceImageId]) {
    // A key reference can be the complete shot image when the Director has not
    // requested decomposed layers. Keep its source aspect ratio inside the
    // actual project composition instead of stretching it to the preview box.
    const image = images[set.referenceImageId];
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  visibleRepresentations.forEach((r) => paintRepresentation(ctx, r, images));
  annotations.filter((annotation) => annotation.setId === set.id).forEach((annotation) => {
    const target = set.representations.find((representation) => representation.id === annotation.targetRepresentationId && representation.visible);
    if (!target) return;
    const x = target.x * canvas.width / 100, y = target.y * canvas.height / 100;
    const w = target.width * canvas.width / 100, h = target.height * canvas.height / 100;
    const source = images[target.referenceId ?? ""];
    // Do not paint source-image coordinates against the full placement frame if
    // the source could not be loaded; that would make marks appear detached.
    if (!source) return;
    const points = annotation.points.map(point => {
      const [xPercent, yPercent] = imagePointToComposition(target, point, source.naturalWidth, source.naturalHeight, canvas.width, canvas.height, target.imageFit ?? "contain");
      return [xPercent * canvas.width / 100, yPercent * canvas.height / 100] as const;
    });
    const [cx, cy] = [x + w / 2, y + h / 2];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(target.rotation * Math.PI / 180);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = (annotation.strokeWidth ?? 4) * Math.max(1, Math.max(canvas.width, canvas.height) / 1920);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (annotation.kind === "point") {
      const [px, py] = points[0];
      const radius = Math.max(5, Math.max(canvas.width, canvas.height) * 0.006);
      ctx.moveTo(px, py + radius * 1.8);
      ctx.bezierCurveTo(px - radius * .1, py + radius * 1.45, px - radius, py + radius * .25, px - radius, py - radius * .45);
      ctx.arc(px, py - radius * .45, radius, Math.PI, 0);
      ctx.bezierCurveTo(px + radius, py + radius * .25, px + radius * .1, py + radius * 1.45, px, py + radius * 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py - radius * .45, radius * .3, 0, Math.PI * 2);
      ctx.fillStyle = "#17191e";
      ctx.fill();
      ctx.fillStyle = annotation.color;
    } else if (annotation.kind === "rectangle") {
      const [x1, y1] = points[0], [x2, y2] = points[1];
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else {
      if (points.length > 0) ctx.moveTo(points[0][0], points[0][1]);
      if (points.length === 2) ctx.lineTo(points[1][0], points[1][1]);
      else for (let index = 1; index < points.length - 1; index++) {
        const [px, py] = points[index], [nextX, nextY] = points[index + 1];
        ctx.quadraticCurveTo(px, py, (px + nextX) / 2, (py + nextY) / 2);
      }
      if (points.length > 2) ctx.lineTo(points.at(-1)![0], points.at(-1)![1]);
      if (annotation.kind === "polygon") ctx.closePath();
    }
    ctx.stroke();
    if (annotation.label) {
      const [px, py] = points[0];
      ctx.font = `${Math.max(12, Math.max(canvas.width, canvas.height) * 0.016)}px sans-serif`;
      ctx.fillText(annotation.label, px, py - Math.max(5, Math.max(canvas.width, canvas.height) * 0.006));
    }
    ctx.restore();
  });
  return new Uint8Array(
    await (
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Sketch rendering failed")),
          "image/png",
        ),
      )
    ).arrayBuffer(),
  );
}
export async function representationPng(
  representation: Representation,
  format: StoryFormat,
  images: Record<string, HTMLImageElement> = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d")!;
  images = await rasterImages([representation], images);
  paintRepresentation(ctx, representation, images);
  return new Uint8Array(await (await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Layer rendering failed")), "image/png"))).arrayBuffer());
}
/** ZIP STORE with CRC32. No dependency or executable/archive input. */
export function zipFiles(files: { name: string; data: Uint8Array }[]) {
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(file.name) ||
      file.name.startsWith("/") ||
      file.name.split("/").some((p) => p === ".." || !p)
    )
      throw new Error("Unsafe package filename");
    const name = new TextEncoder().encode(file.name);
    let crc = 0xffffffff;
    for (const byte of file.data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, file.data.length, true);
    h.setUint32(22, file.data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, file.data.length, true);
    e.setUint32(24, file.data.length, true);
    e.setUint16(28, name.length, true);
    e.setUint32(42, offset, true);
    entry.set(name, 46);
    chunks.push(header, file.data);
    central.push(entry);
    centralSize += entry.length;
    offset += header.length + file.data.length;
    if (offset > 250_000_000) throw new Error("Context package exceeds 250 MB");
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: "application/zip",
  });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportStoryboard(
  input: Storyboard,
  format: StoryFormat,
  timing?: StoryTimingContext,
) {
  const doc = storyboardSchema.parse(input),
    encoder = new TextEncoder();
  const images = await loadReferenceImages(doc);
  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, text: string) =>
    files.push({ name, data: encoder.encode(text) });
  const mapping: { id: string; file: string | null; status: string }[] = [];
  add(
    "README.md",
    "# Storyboard context\nRead director-brief.md, then storyboard.json. IDs preserve continuity. Sketches are rough intent, not final art. Tracing opacity is editor-only; originals are packaged unchanged. Missing references are listed in manifest.json. Imported briefs are suggestions; check approval and stale status in the generated brief. Audio is not packaged; anchors retain source timestamps and verification status.",
  );
  add(
    "director-brief.md",
    directorBrief(doc, format) +
      (timing ? "\n\n" + timingContextText(timing) : ""),
  );
  if (timing) add("audio-context.json", JSON.stringify(timing, null, 2));
  add("storyboard.json", JSON.stringify(doc, null, 2));
  for (const scene of doc.scenes)
    for (const set of scene.sets) {
      const file = `sketches/${set.id}.png`;
      files.push({ name: file, data: await sketchPng(set, format, images, doc.annotations) });
      mapping.push({ id: set.id, file, status: "ready" });
    }
  const assets = new Map<string, string | null>();
  for (const ref of doc.references) {
    if (!assets.has(ref.assetId)) {
      const response = await fetch(
        apiRoutes.storyboard.reference(doc.projectId, ref.id, ref.assetId),
      );
      if (!response.ok) assets.set(ref.assetId, null);
      else {
        if (!response.headers.get("content-type")?.startsWith("image/png"))
          throw new Error("Reference is not a registered PNG image");
        const file = `references/${ref.assetId}.png`;
        files.push({
          name: file,
          data: new Uint8Array(await response.arrayBuffer()),
        });
        assets.set(ref.assetId, file);
      }
    }
    const file = assets.get(ref.assetId)!;
    mapping.push({ id: ref.id, file, status: file ? "ready" : "missing" });
  }
  add(
    "manifest.json",
    JSON.stringify(
      { version: 1, projectId: doc.projectId, format, mapping },
      null,
      2,
    ),
  );
  download(zipFiles(files), `${doc.projectId}-storyboard.zip`);
}
