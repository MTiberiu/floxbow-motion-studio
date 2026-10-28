import type { Storyboard } from "@motion/project-loader/storyboard";

export function resolveStoryboardRecovery(
  savedDocument: Storyboard,
  savedRevision: string,
  localDocument: Storyboard | undefined,
  localRevision: string | undefined,
  recoveryBlocked = false,
): { document: Storyboard; discardLocalDraft: boolean } {
  if (!localDocument) return { document: savedDocument, discardLocalDraft: false };
  if (localRevision !== savedRevision || recoveryBlocked) return { document: savedDocument, discardLocalDraft: true };
  return { document: localDocument, discardLocalDraft: false };
}

const windows1252Bytes = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const encodingMarkers = /(?:Ã.|Ä.|Å.|È.|Â.|â€)/g;

/** Repairs UTF-8 text that an older local draft was incorrectly decoded as Windows-1252. */
export function repairRecoveredStoryboardText<T>(value: T): { value: T; repaired: boolean } {
  let repaired = false;
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      const before = item.match(encodingMarkers)?.length ?? 0;
      if (!before) return item;
      const bytes: number[] = [];
      for (const character of item) {
        const codePoint = character.codePointAt(0)!;
        const byte = windows1252Bytes.get(codePoint) ?? (codePoint <= 0xff ? codePoint : undefined);
        if (byte === undefined) return item;
        bytes.push(byte);
      }
      try {
        const candidate = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
        if ((candidate.match(encodingMarkers)?.length ?? 0) < before) {
          repaired = true;
          return candidate;
        }
      } catch {
        // Keep text unchanged unless the byte sequence is valid UTF-8.
      }
      return item;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
    }
    return item;
  };
  return { value: visit(value) as T, repaired };
}

/** Merge only locally recovered annotation additions onto the current saved document. */
export function mergeRecoveredAnnotations(
  latest: Storyboard,
  draft: Storyboard,
  makeId: () => string,
  composition: Storyboard["composition"] = latest.composition,
): { document: Storyboard; added: number } {
  const document = structuredClone(latest);
  document.composition = composition;
  let added = 0;
  for (const annotation of draft.annotations) {
    const existing = document.annotations.find(item => item.id === annotation.id);
    if (!existing) {
      document.annotations.push(structuredClone(annotation));
      added++;
    } else if (JSON.stringify(existing) !== JSON.stringify(annotation)) {
      document.annotations.push({ ...structuredClone(annotation), id: makeId() });
      added++;
    }
  }
  return { document, added };
}
