import {z} from 'zod';
import {clipSchema,type TimelineClip,type EditTimeline,type TimelineBehavior} from '@motion/sdk/timeline';
import {parseTimeline} from './index';
const word=z.object({id:z.string(),text:z.string(),start:z.number().finite(),end:z.number().finite()}).refine(w=>w.end>w.start,'Word end must follow start');
const consumerIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).max(100);
const subtitlePresentationSchema = z.enum([
  "caption",
  "bubble",
  "both",
  "hidden",
]);
const subtitleConsumerIdsSchema = z
  .array(consumerIdSchema)
  .max(32)
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate subtitle consumer IDs" });
  });
export const subtitleContentSchema = z.object({
  text: z.string().max(20000),
  section: z.string().optional(),
  repeatOf: z.string().optional(),
  status: z.enum(["demo", "unverified", "reviewed"]).default("unverified"),
  words: z.array(word).optional(),
  wordTimingSource: z.enum(["whisper", "estimated"]).optional(),
  speakerId: consumerIdSchema.optional(),
  presentation: subtitlePresentationSchema.optional(),
  consumerIds: subtitleConsumerIdsSchema.optional(),
});
export type SubtitleContent = z.infer<typeof subtitleContentSchema>;
export type SubtitlePresentation = z.infer<typeof subtitlePresentationSchema>;
export type SubtitleConsumerId = z.infer<typeof consumerIdSchema>;
export type SubtitleCueWord = Readonly<{
  id: string;
  text: string;
  start: number;
  end: number;
}>;
export type SubtitleCue = Readonly<{
  id: string;
  text: string;
  start: number;
  end: number;
  status: SubtitleContent["status"];
  speakerId?: SubtitleConsumerId;
  presentation: SubtitlePresentation;
  wordTimingSource?: SubtitleContent["wordTimingSource"];
  repeatOf?: string;
  consumerIds?: readonly SubtitleConsumerId[];
  words?: readonly SubtitleCueWord[];
  wordTimingStatus: "absent" | "matches-text" | "text-mismatch";
}>;
export type SubtitleCueSelection =
  | { kind: "caption" }
  | { kind: "consumer"; consumerId: SubtitleConsumerId };
/** Derive chronological cue data from the authoritative frame timeline. */
export function getSubtitleCues(timeline: EditTimeline): SubtitleCue[] {
  return timeline.clips
    .filter((clip) => clip.componentId === "subtitles")
    .map((clip) => {
      const content = subtitleContentSchema.parse(clip.content);
      const start = clip.from / timeline.fps;
      const words = content.words?.map((w) => ({
        ...w,
        start: start + w.start,
        end: start + w.end,
      }));
      const wordTimingStatus: SubtitleCue["wordTimingStatus"] =
        !content.words?.length
          ? "absent"
          : subtitleWordTimingMatchesText(content)
            ? "matches-text"
            : "text-mismatch";
      return {
        id: clip.id,
        text: content.text,
        start,
        end: (clip.from + clip.durationInFrames) / timeline.fps,
        status: content.status,
        ...(content.speakerId === undefined
          ? {}
          : { speakerId: content.speakerId }),
        presentation: content.presentation ?? "caption",
        ...(content.wordTimingSource === undefined
          ? {}
          : { wordTimingSource: content.wordTimingSource }),
        ...(content.repeatOf === undefined ? {} : { repeatOf: content.repeatOf }),
        ...(content.consumerIds === undefined
          ? {}
          : { consumerIds: [...content.consumerIds] }),
        ...(words === undefined ? {} : { words }),
        wordTimingStatus,
      };
    })
    .sort((a, b) => a.start - b.start);
}
/** Keep the rendered caption clip at least as long as its last saved karaoke word. */
export function extendSubtitleClipToTimedWords(clip: TimelineClip, fps: number): TimelineClip {
  if (clip.componentId !== "subtitles") return clip;
  const content = subtitleContentSchema.parse(clip.content);
  if (!content.words?.length) return clip;
  const lastWordEnd = Math.max(...content.words.map(word => word.end));
  const requiredFrames = Math.ceil(lastWordEnd * fps - 1e-8);
  return requiredFrames > clip.durationInFrames
    ? { ...clip, durationInFrames: requiredFrames }
    : clip;
}
/** Select captions by visual permission or supplemental cues by stable instance ID. */
export function selectSubtitleCues(
  cues: readonly SubtitleCue[],
  selection: SubtitleCueSelection,
): SubtitleCue[] {
  if (selection.kind === "caption")
    return cues.filter(
      (cue) => cue.presentation === "caption" || cue.presentation === "both",
    );
  if (selection.kind !== "consumer")
    throw new Error("Unknown subtitle cue selection");
  consumerIdSchema.parse(selection.consumerId);
  return cues.filter(
    (cue) =>
      cue.consumerIds === undefined ||
      cue.consumerIds.includes(selection.consumerId),
  );
}
/** Correct visible words without changing segment boundaries or word timing. */
export function correctSubtitleText(
  content: SubtitleContent,
  text: string,
): SubtitleContent {
  const current = subtitleContentSchema.parse(content);
  const next = { ...current, text };
  if (current.status !== "demo") next.status = "unverified";
  if (current.words) {
    const tokens = text.trim().match(/\S+/g) ?? [];
    if (tokens.length > 0 && tokens.length === current.words.length) {
      const timingStillMatches = subtitleWordTimingMatchesText(current);
      next.words = current.words.map((word, index) => ({
        ...word,
        text: tokens[index],
      }));
      next.wordTimingSource = timingStillMatches
        ? current.wordTimingSource
        : "estimated";
    } else if (tokens.length > 0 && current.words.length > 0) {
      const start = Math.min(...current.words.map((word) => word.start));
      const end = Math.max(...current.words.map((word) => word.end));
      next.words = estimateWordTimings(
        text,
        start,
        end,
        `estimated-${current.words[0].id}`,
      );
      next.wordTimingSource = "estimated";
    } else {
      delete next.words;
      delete next.wordTimingSource;
    }
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
    tokens.every(
      (token, index) => token === content.words![index].text.trim(),
    )
  );
}
export type KaraokeTextPart =
  | { kind: "word"; index: number; text: string }
  | { kind: "space"; index: number; text: string };
/** Split display text while retaining its original spaces and line breaks between timed words. */
export function splitSubtitleTextForKaraoke(text: string): KaraokeTextPart[] {
  const parts = text.trim().match(/\s+|\S+/g) ?? [];
  let wordIndex = 0;
  return parts.map((part, index) =>
    /^\s+$/.test(part)
      ? { kind: "space", index, text: part }
      : { kind: "word", index: wordIndex++, text: part },
  );
}
/** Serializable subtitle clips opt into these trusted editor-side semantics by metadata ID. */
export const subtitleTimelineBehavior:TimelineBehavior={
 id:'subtitle',
 resizeContent(content,oldRange,nextRange,fps){
  const next=structuredClone(content);
  if(Array.isArray(next.words)){
   const delta=(oldRange.from-nextRange.from)/fps;
   next.words=next.words.map(w=>w&&typeof w==='object'&&!Array.isArray(w)&&typeof w.start==='number'&&typeof w.end==='number'?{...w,start:w.start+delta,end:w.end+delta}:w);
  }
  if(next.status&&next.status!=='demo')next.status='unverified';
  return next;
 },
 duplicateContent(content,sourceId){return {...structuredClone(content),repeatOf:sourceId};},
 editContent(content,key,value){
  if(key!=='text'||typeof value!=='string')return undefined;
  const next=correctSubtitleText(content as unknown as SubtitleContent,value);
  return {content:next as unknown as TimelineClip['content'],notice:next.wordTimingSource==='estimated'
   ?'Text changed. Word highlighting uses estimated timing; review it against the audio.'
   :'Text changed. Existing Whisper word timing was preserved.'};
 },
};
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
const segment=z.object({id:z.string().min(1),start:z.number().finite().nonnegative(),end:z.number().finite().positive(),content:subtitleContentSchema}).refine(s=>s.end>s.start,'Segment end must follow start');
export const subtitleTimingSchema=z.object({version:z.literal(1),units:z.literal('seconds'),segments:z.array(segment).max(3000)}).superRefine((t,ctx)=>{if(new Set(t.segments.map(s=>s.id)).size!==t.segments.length)ctx.addIssue({code:'custom',message:'Duplicate segment IDs'});});
export type SubtitleTiming=z.infer<typeof subtitleTimingSchema>;
export type WhisperTranscriptionImport = Readonly<{
  timing: SubtitleTiming;
  skippedSegments: number;
  outOfRangeSegments: number;
  unusableWordTimings: number;
  estimatedWordTimings: number;
}>;
function estimateWordTimings(
  text: string,
  start: number,
  end: number,
  idPrefix: string,
): NonNullable<SubtitleContent["words"]> {
  const tokens = text.trim().match(/\S+/g) ?? [];
  if (!tokens.length) return [];
  const weights = tokens.map((token) => Math.max(1, token.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = end - start;
  let cursor = start;
  return tokens.map((token, index) => {
    const wordStart = cursor;
    cursor = index === tokens.length - 1
      ? end
      : cursor + duration * (weights[index] / totalWeight);
    return {
      id: `${idPrefix}-${index + 1}`,
      text: token,
      start: wordStart,
      end: cursor,
    };
  });
}
function normalizeWordLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, "");
}
/** Convert Whisper observations into unverified captions, estimating word timing when Whisper cannot supply a usable match. */
export function whisperResultToSubtitleTiming(
  input: unknown,
  durationSeconds: number,
): WhisperTranscriptionImport {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error(
      "The project has no usable duration for subtitle transcription.",
    );
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Whisper returned an invalid transcription result.");
  const rawSegments = (input as { segments?: unknown }).segments;
  if (!Array.isArray(rawSegments) || rawSegments.length === 0)
    throw new Error("Whisper returned no transcription segments.");
  if (rawSegments.length > 3000)
    throw new Error(
      "Whisper returned more than 3,000 segments; use a shorter audio file.",
    );

  let skippedSegments = 0;
  let outOfRangeSegments = 0;
  let unusableWordTimings = 0;
  let estimatedWordTimings = 0;
  const segments: SubtitleTiming["segments"] = [];
  rawSegments.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      skippedSegments++;
      return;
    }
    const value = raw as {
      start?: unknown;
      end?: unknown;
      text?: unknown;
      words?: unknown;
    };
    const start = value.start;
    const end = value.end;
    if (
      typeof start !== "number" ||
      !Number.isFinite(start) ||
      start < 0 ||
      typeof end !== "number" ||
      !Number.isFinite(end) ||
      end <= start ||
      typeof value.text !== "string" ||
      !value.text.trim()
    ) {
      skippedSegments++;
      return;
    }
    if (end > durationSeconds) {
      skippedSegments++;
      outOfRangeSegments++;
      return;
    }

    let words: SubtitleContent["words"];
    if (Array.isArray(value.words) && value.words.length > 0) {
      const parsedWords = value.words.map((rawWord, wordIndex) => {
        if (!rawWord || typeof rawWord !== "object" || Array.isArray(rawWord))
          return undefined;
        const word = rawWord as {
          start?: unknown;
          end?: unknown;
          word?: unknown;
          text?: unknown;
        };
        const wordStart = word.start;
        const wordEnd = word.end;
        const text = typeof word.word === "string" ? word.word : word.text;
        if (
          typeof wordStart !== "number" ||
          !Number.isFinite(wordStart) ||
          typeof wordEnd !== "number" ||
          !Number.isFinite(wordEnd) ||
          wordStart < start ||
          wordEnd <= wordStart ||
          wordEnd > end ||
          typeof text !== "string" ||
          !text.trim()
        )
          return undefined;
        return {
          id: `whisper-${index + 1}-word-${wordIndex + 1}`,
          text,
          start: wordStart - start,
          end: wordEnd - start,
        };
      });
      if (parsedWords.every((word) => word !== undefined))
        words = parsedWords as NonNullable<SubtitleContent["words"]>;
      else unusableWordTimings++;
    }
    const tokens = value.text.trim().match(/\S+/g) ?? [];
    const whisperWordsMatch =
      words?.length === tokens.length &&
      words.every(
        (word, wordIndex) =>
          normalizeWordLabel(word.text) === normalizeWordLabel(tokens[wordIndex]),
      );
    if (whisperWordsMatch) {
      words = words!.map((word, wordIndex) => ({
        ...word,
        text: tokens[wordIndex],
      }));
    } else {
      estimatedWordTimings++;
      words = estimateWordTimings(
        value.text,
        0,
        end - start,
        `whisper-${index + 1}-estimated-word`,
      );
    }
    segments.push({
      id: `whisper-segment-${index + 1}`,
      start,
      end,
      content: {
        text: value.text,
        status: "unverified",
        words,
        wordTimingSource: whisperWordsMatch ? "whisper" : "estimated",
      },
    });
  });
  return {
    timing: subtitleTimingSchema.parse({ version: 1, units: "seconds", segments }),
    skippedSegments,
    outOfRangeSegments,
    unusableWordTimings,
    estimatedWordTimings,
  };
}
/** Ensure legacy or current subtitle timing has displayable word intervals, marking proportional fallbacks. */
export function ensureKaraokeWordTimings(data: SubtitleTiming): Readonly<{
  timing: SubtitleTiming;
  estimatedWordTimings: number;
}> {
  let estimatedWordTimings = 0;
  const segments = data.segments.map((segment) => {
    const tokens = segment.content.text.trim().match(/\S+/g) ?? [];
    const words = segment.content.words;
    const matches =
      words?.length === tokens.length &&
      words.every(
        (word, index) =>
          normalizeWordLabel(word.text) === normalizeWordLabel(tokens[index]),
      );
    if (matches && segment.content.wordTimingSource === "whisper") {
      return {
        ...segment,
        content: {
          ...segment.content,
          words: words!.map((word, index) => ({ ...word, text: tokens[index] })),
        },
      };
    }
    if (matches && segment.content.wordTimingSource === "estimated") {
      estimatedWordTimings++;
      return {
        ...segment,
        content: {
          ...segment.content,
          words: words!.map((word, index) => ({ ...word, text: tokens[index] })),
        },
      };
    }
    if (matches && segment.content.wordTimingSource === undefined) {
      return {
        ...segment,
        content: {
          ...segment.content,
          words: words!.map((word, index) => ({ ...word, text: tokens[index] })),
          wordTimingSource: "whisper" as const,
        },
      };
    }
    estimatedWordTimings++;
    return {
      ...segment,
      content: {
        ...segment.content,
        words: estimateWordTimings(
          segment.content.text,
          0,
          segment.end - segment.start,
          `estimated-${segment.id}`,
        ),
        wordTimingSource: "estimated" as const,
      },
    };
  });
  return {
    timing: subtitleTimingSchema.parse({ ...data, segments }),
    estimatedWordTimings,
  };
}
/** Export only semantic content and timing, never appearance or component controls. Words are segment-relative seconds. */
export function exportSubtitles(t:EditTimeline):SubtitleTiming{return subtitleTimingSchema.parse({version:1,units:'seconds',segments:t.clips.filter(c=>c.componentId==='subtitles').map(c=>({id:c.id,start:c.from/t.fps,end:(c.from+c.durationInFrames)/t.fps,content:subtitleContentSchema.parse(c.content)})).sort((a,b)=>a.start-b.start)});}
export function subtitleClips(data:unknown,t:EditTimeline,trackId:string,props:TimelineClip['props']={}):TimelineClip[]{
 const parsed=subtitleTimingSchema.parse(data);
 return parsed.segments.map((s,i)=>{const from=Math.round(s.start*t.fps),end=Math.round(s.end*t.fps);if(from<0||end>t.durationInFrames||end<=from)throw new Error(`Segment ${i+1} is outside the project or shorter than one frame`);return {id:s.id,trackId,componentId:'subtitles',label:s.content.section??'Subtitle',from,durationInFrames:end-from,content:s.content,props:{...props}};});
}
const parseStamp=(s:string)=>{const m=s.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);if(!m||+m[2]>59||+m[3]>59)throw new Error(`Invalid subtitle timestamp: ${s}`);return +m[1]*3600+ +m[2]*60+ +m[3]+ +m[4]/1000;};
export function importSubtitles(text:string,format:'json'|'srt'|'lrc',durationSeconds:number):SubtitleTiming{
 if(format==='json'){
 const raw=JSON.parse(text);if(raw.segments)return subtitleTimingSchema.parse(raw);
 const legacy=parseTimeline(raw);return subtitleTimingSchema.parse({version:1,units:'seconds',segments:legacy.lines.map(l=>{if(l.words.some(w=>w.start===null||w.end===null))throw new Error(`Line ${l.id} is untimed. Supply real boundaries before importing it as a clip.`);const start=l.words[0].start!;return {id:l.id,start,end:l.words.at(-1)!.end!,content:{text:l.words.map(w=>w.text).join(' '),section:l.section,repeatOf:l.repeatOf,status:legacy.status,words:l.words.map(w=>({id:w.id,text:w.text,start:w.start!-start,end:w.end!-start}))}};})});
 }
 if(format==='srt')return subtitleTimingSchema.parse({version:1,units:'seconds',segments:text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map((block,i)=>{const lines=block.split(/\r?\n/);if(/^\d+$/.test(lines[0]))lines.shift();const times=lines.shift()?.split(/\s+-->\s+/);if(times?.length!==2)throw new Error(`Invalid SRT cue ${i+1}`);return {id:`subtitle-${i+1}`,start:parseStamp(times[0]),end:parseStamp(times[1]),content:{text:lines.join('\n'),status:'unverified'}};})});
 const entries:Array<{start:number;text:string}>=[];
 for(const line of text.split(/\r?\n/)){const stamps=[...line.matchAll(/\[(\d+):(\d{2}(?:\.\d+)?)\]/g)];if(!stamps.length){if(line.trim()&&!/^\[[a-z]+:/i.test(line))throw new Error('Invalid LRC line');continue;}const lyric=line.replace(/\[[^\]]+\]/g,'').trim();for(const m of stamps){if(+m[2]>=60)throw new Error('Invalid LRC seconds');entries.push({start:+m[1]*60+ +m[2],text:lyric});}}
 entries.sort((a,b)=>a.start-b.start);
 return subtitleTimingSchema.parse({version:1,units:'seconds',segments:entries.map((e,i)=>({id:`subtitle-${i+1}`,start:e.start,end:entries[i+1]?.start??durationSeconds,content:{text:e.text,status:'unverified'}}))});
}
function stamp(seconds:number){const n=Math.round(seconds*1000);return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;}
export function subtitlesToSRT(data:SubtitleTiming){return data.segments.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.content.text}\n`).join('\n');}
export function subtitlesToLRC(data:SubtitleTiming){return data.segments.map(s=>{const n=Math.round(s.start*100);return `[${String(Math.floor(n/6000)).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}]${s.content.text.replaceAll('\n',' ')}`;}).join('\n');}
