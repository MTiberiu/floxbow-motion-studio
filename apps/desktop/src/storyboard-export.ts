import {
  directorBrief,
  storyboardSchema,
  type Storyboard,
  type StoryFormat,
  type StorySet,
  type Representation,
} from "@motion/project-loader/storyboard";
import type { SubtitleCue } from "@motion/lyrics-sync/subtitles";
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
export function paintRepresentation(
  ctx: CanvasRenderingContext2D,
  representation: Representation,
  images: Record<string, HTMLImageElement> = {},
) {
  const r = {
    ...representation,
    x: (representation.x * ctx.canvas.width) / 100,
    y: (representation.y * ctx.canvas.height) / 100,
    width: (representation.width * ctx.canvas.width) / 100,
    height: (representation.height * ctx.canvas.height) / 100,
  };
  if (!r.visible) return;
  ctx.save();
  ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
  ctx.rotate((r.rotation * Math.PI) / 180);
  ctx.translate(-r.width / 2, -r.height / 2);
  ctx.globalAlpha = r.opacity;
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
    if (image) ctx.drawImage(image, 0, 0, r.width, r.height);
    else {
      ctx.strokeRect(0, 0, r.width, r.height);
      ctx.font = "24px sans-serif";
      ctx.fillText("Missing reference", 0, 26, r.width);
    }
  }
  ctx.restore();
}
export async function loadReferenceImages(doc: Storyboard) {
  const images: Record<string, HTMLImageElement> = {};
  await Promise.all(
    doc.references.map(async (ref) => {
      const image = new Image();
      image.src = `/api/storyboard/${doc.projectId}/media/${ref.assetId}`;
      try {
        await image.decode();
        images[ref.id] = image;
      } catch {
        /* Missing references stay explicit in sketch and package manifest. */
      }
    }),
  );
  return images;
}
export async function sketchPng(
  set: StorySet,
  format: StoryFormat,
  images: Record<string, HTMLImageElement> = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  set.representations.forEach((r) => paintRepresentation(ctx, r, images));
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
      files.push({ name: file, data: await sketchPng(set, format, images) });
      mapping.push({ id: set.id, file, status: "ready" });
    }
  const assets = new Map<string, string | null>();
  for (const ref of doc.references) {
    if (!assets.has(ref.assetId)) {
      const response = await fetch(
        `/api/storyboard/${doc.projectId}/media/${ref.assetId}`,
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
