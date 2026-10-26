import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const rect = z
  .object({
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    w: z.number().finite().positive(),
    h: z.number().finite().positive(),
  })
  .strict();
const poseSchema = z
  .object({
    id,
    label: z.string().min(1).max(80),
    rectPx: rect,
    sourceView: z
      .object({
        zoom: z.number().min(1).max(6),
        panX: z.number().min(-1).max(1),
        panY: z.number().min(-1).max(1),
      })
      .strict()
      .default({ zoom: 1, panX: 0, panY: 0 }),
    maskStrokes: z
      .array(
        z
          .object({
            points: z
              .array(
                z
                  .object({
                    x: z.number().min(0).max(1),
                    y: z.number().min(0).max(1),
                  })
                  .strict(),
              )
              .min(1)
              .max(4000),
            width: z.number().min(0.002).max(0.4),
          })
          .strict(),
      )
      .max(5000)
      .default([]),
    anchor: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict(),
    registration: z
      .object({
        rotationDeg: z.number().min(-360).max(360),
        scale: z.number().min(0.1).max(5),
        offsetX: z.number().min(-2).max(2),
        offsetY: z.number().min(-2).max(2),
      })
      .strict(),
    reviewStatus: z.enum(["unreviewed", "approved", "needs-fix"]),
    tags: z.array(z.string().min(1).max(60)).max(40),
    name: z.string().max(160),
    hidden: z.boolean(),
  })
  .strict();
export type PoseRegion = z.infer<typeof poseSchema>;

const sheetSchema = z
  .object({
    id,
    characterId: id,
    name: z.string().min(1).max(180),
    sourceName: z.string().min(1).max(240),
    mimeType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/),
    widthPx: z.number().int().positive().max(32768),
    heightPx: z.number().int().positive().max(32768),
    regions: z.array(poseSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((sheet, ctx) => {
    const ids = new Set<string>();
    sheet.regions.forEach((pose, index) => {
      if (ids.has(pose.id))
        ctx.addIssue({
          code: "custom",
          path: ["regions", index, "id"],
          message: `Duplicate pose ID ${pose.id}`,
        });
      ids.add(pose.id);
      if (
        pose.rectPx.x + pose.rectPx.w > sheet.widthPx + 0.01 ||
        pose.rectPx.y + pose.rectPx.h > sheet.heightPx + 0.01
      )
        ctx.addIssue({
          code: "custom",
          path: ["regions", index, "rectPx"],
          message: `Pose ${pose.label} crop must stay inside the source image.`,
        });
    });
  });
const categorySchema = z
  .object({ id, name: z.string().min(1).max(120) })
  .strict();
const characterSchema = z
  .object({
    id,
    name: z.string().min(1).max(160),
    categoryId: id,
    description: z.string().max(2000),
    sheetIds: z.array(id).max(500),
  })
  .strict();
const stepSchema = z
  .object({
    id,
    poseId: id,
    durationMs: z.number().int().min(16).max(60_000),
    transition: z.enum(["cut"]).default("cut"),
  })
  .strict();
const comboSchema = z
  .object({
    id,
    characterId: id,
    sheetId: id,
    name: z.string().min(1).max(160),
    speed: z.number().min(0.25).max(3),
    loop: z.boolean(),
    steps: z.array(stepSchema).min(1).max(10_000),
  })
  .strict();
export const poseStudioLibrarySchema = z
  .object({
    version: z.literal(1),
    categories: z.array(categorySchema).max(500),
    characters: z.array(characterSchema).max(2000),
    sheets: z.array(sheetSchema).max(2000),
    combos: z.array(comboSchema).max(5000),
  })
  .strict()
  .superRefine((library, ctx) => {
    const categories = new Set(library.categories.map((item) => item.id));
    const characters = new Map(
      library.characters.map((item) => [item.id, item]),
    );
    const sheets = new Map(library.sheets.map((item) => [item.id, item]));
    const checkUnique = (values: string[], label: string) => {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${label} ID.` });
    };
    checkUnique(
      library.categories.map((item) => item.id),
      "category",
    );
    checkUnique(
      library.characters.map((item) => item.id),
      "character",
    );
    checkUnique(
      library.sheets.map((item) => item.id),
      "sheet",
    );
    checkUnique(
      library.combos.map((item) => item.id),
      "combo",
    );
    library.characters.forEach((character, index) => {
      if (!categories.has(character.categoryId))
        ctx.addIssue({
          code: "custom",
          path: ["characters", index, "categoryId"],
          message: "Character has an unknown category.",
        });
      character.sheetIds.forEach((sheetId) => {
        if (sheets.get(sheetId)?.characterId !== character.id)
          ctx.addIssue({
            code: "custom",
            path: ["characters", index, "sheetIds"],
            message: "Character sheet links must point to its own sheets.",
          });
      });
    });
    library.combos.forEach((combo, index) => {
      const sheet = sheets.get(combo.sheetId);
      if (!sheet || sheet.characterId !== combo.characterId)
        ctx.addIssue({
          code: "custom",
          path: ["combos", index, "sheetId"],
          message: "Combo must reference a sheet belonging to its character.",
        });
      const poseIds = new Set(sheet?.regions.map((pose) => pose.id) ?? []);
      combo.steps.forEach((step, stepIndex) => {
        if (!poseIds.has(step.poseId))
          ctx.addIssue({
            code: "custom",
            path: ["combos", index, "steps", stepIndex, "poseId"],
            message: `Combo references unknown pose ${step.poseId}.`,
          });
      });
    });
  });
export type PoseStudioLibrary = z.infer<typeof poseStudioLibrarySchema>;
export type PoseCombo = PoseStudioLibrary["combos"][number];
export type PoseComboStep = PoseCombo["steps"][number];

const databaseName = "floxbow-pose-studio";
const databaseVersion = 1;
const metadataStore = "library";
const sourceStore = "sources";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(metadataStore))
        database.createObjectStore(metadataStore);
      if (!database.objectStoreNames.contains(sourceStore))
        database.createObjectStore(sourceStore, { keyPath: "sheetId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open Pose Studio storage."));
  });
}

export const emptyPoseStudioLibrary = (): PoseStudioLibrary => ({
  version: 1,
  categories: [{ id: "category-general", name: "General" }],
  characters: [],
  sheets: [],
  combos: [],
});

export async function readPoseStudioLibrary(): Promise<PoseStudioLibrary> {
  const db = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction(metadataStore, "readonly")
        .objectStore(metadataStore)
        .get("library");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value === undefined
      ? emptyPoseStudioLibrary()
      : poseStudioLibrarySchema.parse(value);
  } finally {
    db.close();
  }
}

export async function writePoseStudioLibrary(
  input: unknown,
  addSource?: { sheetId: string; file: Blob },
): Promise<PoseStudioLibrary> {
  const library = poseStudioLibrarySchema.parse(input);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([metadataStore, sourceStore], "readwrite");
      tx.objectStore(metadataStore).put(library, "library");
      if (addSource)
        tx.objectStore(sourceStore).put({
          sheetId: addSource.sheetId,
          blob: addSource.file,
        });
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error("Could not save Pose Studio data."));
    });
    window.dispatchEvent(new Event("floxbow-pose-studio-change"));
    return library;
  } finally {
    db.close();
  }
}

export async function readPoseSheetSource(
  sheetId: string,
): Promise<Blob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db
        .transaction(sourceStore, "readonly")
        .objectStore(sourceStore)
        .get(sheetId);
      request.onsuccess = () =>
        resolve(request.result?.blob as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function removePoseSheetSource(sheetId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(sourceStore, "readwrite");
      tx.objectStore(sourceStore).delete(sheetId);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error("Could not remove Pose Studio source."));
    });
  } finally {
    db.close();
  }
}

const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function makePose(
  label: string,
  rectPx: PoseRegion["rectPx"],
): PoseRegion {
  return {
    id: makeId("pose"),
    label,
    rectPx,
    sourceView: { zoom: 1, panX: 0, panY: 0 },
    maskStrokes: [],
    anchor: { x: 0.5, y: 0.94 },
    registration: { rotationDeg: 0, scale: 1, offsetX: 0, offsetY: 0 },
    reviewStatus: "unreviewed",
    tags: [],
    name: "",
    hidden: false,
  };
}

export function gridRegions(
  width: number,
  height: number,
  columns: number,
  rows: number,
  marginX = 0,
  marginY = 0,
  gutterX = 0,
  gutterY = 0,
): PoseRegion[] {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 1 ||
    rows < 1 ||
    columns * rows > 1000
  )
    throw new Error("Grid must contain between 1 and 1,000 pose cells.");
  const cellW = (width - marginX * 2 - gutterX * (columns - 1)) / columns;
  const cellH = (height - marginY * 2 - gutterY * (rows - 1)) / rows;
  if (cellW <= 0 || cellH <= 0)
    throw new Error("Margins and spacing leave no room for the grid cells.");
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns,
      row = Math.floor(index / columns);
    return makePose(String(index + 1), {
      x: marginX + column * (cellW + gutterX),
      y: marginY + row * (cellH + gutterY),
      w: cellW,
      h: cellH,
    });
  });
}

export function comboDurationMs(
  combo: Pick<PoseCombo, "speed" | "steps">,
): number {
  return (
    combo.steps.reduce((total, step) => total + step.durationMs, 0) /
    combo.speed
  );
}

export function poseStepAtTime(
  combo: Pick<PoseCombo, "speed" | "loop" | "steps"> | undefined,
  elapsedMs: number,
): { stepIndex: number; poseId: string; elapsedInStepMs: number } | undefined {
  if (
    !combo ||
    combo.steps.length === 0 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  )
    return undefined;
  const duration = comboDurationMs(combo);
  if (duration <= 0) return undefined;
  const totalScaled = combo.steps.reduce(
    (total, step) => total + step.durationMs / combo.speed,
    0,
  );
  const position = combo.loop
    ? elapsedMs % totalScaled
    : Math.min(elapsedMs, Math.max(0, totalScaled - Number.EPSILON));
  let cursor = 0;
  for (let index = 0; index < combo.steps.length; index++) {
    const stepDuration = combo.steps[index].durationMs / combo.speed;
    if (position < cursor + stepDuration || index === combo.steps.length - 1)
      return {
        stepIndex: index,
        poseId: combo.steps[index].poseId,
        elapsedInStepMs: Math.max(0, position - cursor),
      };
    cursor += stepDuration;
  }
  return undefined;
}
