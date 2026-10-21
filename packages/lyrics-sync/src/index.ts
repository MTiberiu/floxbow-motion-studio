import { z } from "zod";
const time = z.number().finite().nonnegative().nullable();
const wordSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    start: time,
    end: time,
    confidence: z.number().min(0).max(1),
    source: z.enum(["unmatched", "imported", "manual", "demo"]),
  })
  .refine(
    (w) =>
      (w.start === null && w.end === null) ||
      (w.start !== null && w.end !== null && w.end > w.start),
    "Timing must be absent or have end > start",
  );
const lineSchema = z.object({
  id: z.string().min(1),
  section: z.string(),
  repeatOf: z.string().optional(),
  words: z.array(wordSchema).min(1),
});
export const timelineSchema = z
  .object({
    version: z.literal(1),
    units: z.literal("seconds"),
    status: z.enum(["unverified", "reviewed", "demo"]),
    audio: z.string().optional(),
    lines: z.array(lineSchema),
  })
  .superRefine((t, ctx) => {
    const ids = new Set<string>();
    let last = -1;
    for (const line of t.lines) {
      if (ids.has(line.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate ID",
          path: ["lines"],
        });
      ids.add(line.id);
      for (const w of line.words) {
        if (ids.has(w.id))
          ctx.addIssue({
            code: "custom",
            message: "Duplicate ID",
            path: ["lines"],
          });
        ids.add(w.id);
        if (w.start !== null) {
          if (w.start < last)
            ctx.addIssue({
              code: "custom",
              message: "Words must be chronological",
              path: ["lines"],
            });
          last = w.end!;
        }
      }
    }
    for (const line of t.lines)
      if (
        line.repeatOf &&
        !t.lines.some((l) => l.id === line.repeatOf && l.id !== line.id)
      )
        ctx.addIssue({
          code: "custom",
          message: "Unknown repeatOf line",
          path: ["lines"],
        });
  });
export type LyricTimeline = z.infer<typeof timelineSchema>;
export type TimedWord = z.infer<typeof wordSchema>;
export type TimedLine = z.infer<typeof lineSchema>;
export const parseTimeline = (input: unknown): LyricTimeline =>
  timelineSchema.parse(input);
export const toJSON = (t: LyricTimeline) =>
  JSON.stringify(parseTimeline(t), null, 2);
const stamp = (s: number) => {
  const ms = Math.round(s * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
function timedLines(t: LyricTimeline) {
  return parseTimeline(t).lines.filter((l) =>
    l.words.every((w) => w.start !== null && w.end !== null),
  );
}
export function toSRT(t: LyricTimeline) {
  return timedLines(t)
    .map(
      (l, i) =>
        `${i + 1}\n${stamp(l.words[0].start!)} --> ${stamp(l.words.at(-1)!.end!)}\n${l.words.map((w) => w.text).join(" ")}\n`,
    )
    .join("\n");
}
export function toLRC(t: LyricTimeline) {
  return timedLines(t)
    .map((l) => {
      const cs = Math.round(l.words[0].start! * 100);
      return `[${String(Math.floor(cs / 6000)).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}]${l.words.map((w) => w.text).join(" ")}`;
    })
    .join("\n");
}
export const toWords = (t: LyricTimeline) =>
  JSON.stringify(
    parseTimeline(t).lines.flatMap((l) =>
      l.words.map((w) => ({ ...w, lineId: l.id, section: l.section })),
    ),
    null,
    2,
  );
export function fromLyrics(text: string): LyricTimeline {
  return {
    version: 1,
    units: "seconds",
    status: "unverified",
    lines: text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l, i) => ({
        id: `line-${i}`,
        section: "verse",
        words: l
          .trim()
          .split(/\s+/)
          .map((text, j) => ({
            id: `word-${i}-${j}`,
            text,
            start: null,
            end: null,
            confidence: 0,
            source: "unmatched",
          })),
      })),
  };
}
const transcriptSchema = z.object({
  segments: z.array(
    z.object({
      words: z
        .array(
          z.object({
            word: z.string(),
            start: z.number().nonnegative().optional(),
            end: z.number().nonnegative().optional(),
            score: z.number().min(0).max(1).optional(),
            probability: z.number().min(0).max(1).optional(),
          }),
        )
        .optional(),
    }),
  ),
});
const normalize = (s: string) =>
  s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Order-preserving LCS matches transcript words to correct lyrics; unmatched words stay untimed. */
export function reconcile(
  original: string,
  transcript: unknown,
): LyricTimeline {
  const t = fromLyrics(original);
  const a = t.lines.flatMap((l) => l.words);
  const b = transcriptSchema
    .parse(transcript)
    .segments.flatMap((s) => s.words ?? []);
  if (a.length > 3000 || b.length > 3000)
    throw new Error(
      "Split transcripts longer than 3000 words before reconciliation",
    );
  const dp = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        normalize(a[i].text) === normalize(b[j].word)
          ? 1 + dp[i + 1][j + 1]
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (normalize(a[i].text) === normalize(b[j].word)) {
      const w = b[j];
      if (w.start !== undefined && w.end !== undefined && w.end > w.start)
        Object.assign(a[i], {
          start: w.start,
          end: w.end,
          confidence: w.score ?? w.probability ?? 0,
          source: "imported",
        });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return parseTimeline(t);
}
export interface AlignmentAdapter {
  id: string;
  available(): Promise<boolean>;
  align(audioPath: string, lyrics: string): Promise<LyricTimeline>;
}
export const alignmentStatus = {
  available: false,
  message:
    "Import word timestamps, adjust manually, or run the optional local Whisper worker with npm run sync:lyrics. Processing runs outside this window; automatic alignment is not launched from this panel.",
} as const;
