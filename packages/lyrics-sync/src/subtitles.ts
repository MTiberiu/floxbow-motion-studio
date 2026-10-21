import { z } from "zod";
import {
  clipSchema,
  type TimelineClip,
  type EditTimeline,
} from "@motion/sdk/timeline";
import { parseTimeline } from "./index";
const word = z
  .object({
    id: z.string(),
    text: z.string(),
    start: z.number().finite(),
    end: z.number().finite(),
  })
  .refine((w) => w.end > w.start, "Word end must follow start");
export const subtitleContentSchema = z.object({
  text: z.string().max(20000),
  section: z.string().optional(),
  repeatOf: z.string().optional(),
  status: z.enum(["demo", "unverified", "reviewed"]).default("unverified"),
  words: z.array(word).optional(),
});
export type SubtitleContent = z.infer<typeof subtitleContentSchema>;
/** Correct visible words without shifting, recreating, or discarding existing word intervals. */
export function correctSubtitleText(
  content: SubtitleContent,
  text: string,
): SubtitleContent {
  const current = subtitleContentSchema.parse(content);
  const next = { ...current, text };
  if (current.status !== "demo") next.status = "unverified";
  if (current.words) {
    const tokens = text.trim().match(/\S+/g) ?? [];
    // When the word count is unchanged, keep stable word IDs and timing while
    // updating the displayed token text. Otherwise retain timing as evidence;
    // the renderer will avoid applying stale karaoke highlighting.
    if (
      subtitleWordTimingMatchesText(current) &&
      tokens.length === current.words.length
    )
      next.words = current.words.map((word, index) => ({
        ...word,
        text: tokens[index],
      }));
  }
  return subtitleContentSchema.parse(next);
}
export function subtitleWordTimingMatchesText(
  content: SubtitleContent,
): boolean {
  if (!content.words?.length) return false;
  const tokens = content.text.trim().match(/\S+/g) ?? [];
  return (
    tokens.length === content.words.length &&
    tokens.every((token, index) => token === content.words![index].text)
  );
}
const segment = z
  .object({
    id: z.string().min(1),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
    content: subtitleContentSchema,
  })
  .refine((s) => s.end > s.start, "Segment end must follow start");
export const subtitleTimingSchema = z
  .object({
    version: z.literal(1),
    units: z.literal("seconds"),
    segments: z.array(segment).max(3000),
  })
  .superRefine((t, ctx) => {
    if (new Set(t.segments.map((s) => s.id)).size !== t.segments.length)
      ctx.addIssue({ code: "custom", message: "Duplicate segment IDs" });
  });
export type SubtitleTiming = z.infer<typeof subtitleTimingSchema>;
/** Construct a validated frame-based subtitle clip for the project's edit timeline. */
export function createSubtitleClip(input: {
  id: string;
  trackId: string;
  from: number;
  durationInFrames: number;
  content: SubtitleContent;
  props?: TimelineClip["props"];
}): TimelineClip {
  return clipSchema.parse({
    label: input.content.section ?? "Subtitle",
    componentId: "subtitles",
    props: {},
    ...input,
    content: subtitleContentSchema.parse(input.content),
  });
}
/** Export only semantic content and timing, never appearance or component controls. Words are segment-relative seconds. */
export function exportSubtitles(t: EditTimeline): SubtitleTiming {
  return subtitleTimingSchema.parse({
    version: 1,
    units: "seconds",
    segments: t.clips
      .filter((c) => c.componentId === "subtitles")
      .map((c) => ({
        id: c.id,
        start: c.from / t.fps,
        end: (c.from + c.durationInFrames) / t.fps,
        content: subtitleContentSchema.parse(c.content),
      }))
      .sort((a, b) => a.start - b.start),
  });
}
export function subtitleClips(
  data: unknown,
  t: EditTimeline,
  trackId: string,
  props: TimelineClip["props"] = {},
): TimelineClip[] {
  const parsed = subtitleTimingSchema.parse(data);
  return parsed.segments.map((s, i) => {
    const from = Math.round(s.start * t.fps),
      end = Math.round(s.end * t.fps);
    if (from < 0 || end > t.durationInFrames || end <= from)
      throw new Error(
        `Segment ${i + 1} is outside the project or shorter than one frame`,
      );
    return {
      id: s.id,
      trackId,
      componentId: "subtitles",
      label: s.content.section ?? "Subtitle",
      from,
      durationInFrames: end - from,
      content: s.content,
      props: { ...props },
    };
  });
}
const parseStamp = (s: string) => {
  const m = s.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m || +m[2] > 59 || +m[3] > 59)
    throw new Error(`Invalid subtitle timestamp: ${s}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
};
export function importSubtitles(
  text: string,
  format: "json" | "srt" | "lrc",
  durationSeconds: number,
): SubtitleTiming {
  if (format === "json") {
    const raw = JSON.parse(text);
    if (raw.segments) return subtitleTimingSchema.parse(raw);
    const legacy = parseTimeline(raw);
    return subtitleTimingSchema.parse({
      version: 1,
      units: "seconds",
      segments: legacy.lines.map((l) => {
        if (l.words.some((w) => w.start === null || w.end === null))
          throw new Error(
            `Line ${l.id} is untimed. Supply real boundaries before importing it as a clip.`,
          );
        const start = l.words[0].start!;
        return {
          id: l.id,
          start,
          end: l.words.at(-1)!.end!,
          content: {
            text: l.words.map((w) => w.text).join(" "),
            section: l.section,
            repeatOf: l.repeatOf,
            status: legacy.status,
            words: l.words.map((w) => ({
              id: w.id,
              text: w.text,
              start: w.start! - start,
              end: w.end! - start,
            })),
          },
        };
      }),
    });
  }
  if (format === "srt")
    return subtitleTimingSchema.parse({
      version: 1,
      units: "seconds",
      segments: text
        .trim()
        .split(/\r?\n\s*\r?\n/)
        .filter(Boolean)
        .map((block, i) => {
          const lines = block.split(/\r?\n/);
          if (/^\d+$/.test(lines[0])) lines.shift();
          const times = lines.shift()?.split(/\s+-->\s+/);
          if (times?.length !== 2) throw new Error(`Invalid SRT cue ${i + 1}`);
          return {
            id: `subtitle-${i + 1}`,
            start: parseStamp(times[0]),
            end: parseStamp(times[1]),
            content: { text: lines.join("\n"), status: "unverified" },
          };
        }),
    });
  const entries: Array<{ start: number; text: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d{2}(?:\.\d+)?)\]/g)];
    if (!stamps.length) {
      if (line.trim() && !/^\[[a-z]+:/i.test(line))
        throw new Error("Invalid LRC line");
      continue;
    }
    const lyric = line.replace(/\[[^\]]+\]/g, "").trim();
    for (const m of stamps) {
      if (+m[2] >= 60) throw new Error("Invalid LRC seconds");
      entries.push({ start: +m[1] * 60 + +m[2], text: lyric });
    }
  }
  entries.sort((a, b) => a.start - b.start);
  return subtitleTimingSchema.parse({
    version: 1,
    units: "seconds",
    segments: entries.map((e, i) => ({
      id: `subtitle-${i + 1}`,
      start: e.start,
      end: entries[i + 1]?.start ?? durationSeconds,
      content: { text: e.text, status: "unverified" },
    })),
  });
}
function stamp(seconds: number) {
  const n = Math.round(seconds * 1000);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
}
export function subtitlesToSRT(data: SubtitleTiming) {
  return data.segments
    .map(
      (s, i) =>
        `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.content.text}\n`,
    )
    .join("\n");
}
export function subtitlesToLRC(data: SubtitleTiming) {
  return data.segments
    .map((s) => {
      const n = Math.round(s.start * 100);
      return `[${String(Math.floor(n / 6000)).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}]${s.content.text.replaceAll("\n", " ")}`;
    })
    .join("\n");
}
