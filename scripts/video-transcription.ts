import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { transcribeAudioWithWhisper } from "./whisper-service";

const execFileAsync = promisify(execFile);
const maxClipSeconds = 60 * 60 * 24;

export type RunAudioExtraction = (
  videoPath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
) => Promise<void>;

export async function extractVideoClipAudio(
  videoPath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
) {
  if (
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > maxClipSeconds
  )
    throw new Error("The selected video clip has invalid audio timing.");
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-ss",
        startSeconds.toFixed(6),
        "-i",
        videoPath,
        "-t",
        durationSeconds.toFixed(6),
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        outputPath,
      ],
      { windowsHide: true, timeout: 120_000, maxBuffer: 64_000 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error("FFmpeg is required to read audio embedded in video.");
    throw new Error(
      "The selected video clip has no decodable audio track, or FFmpeg could not extract it.",
    );
  }
  const info = await stat(outputPath).catch(() => undefined);
  if (!info?.isFile() || info.size <= 44)
    throw new Error("The selected video clip contains no usable audio.");
}

export async function transcribeVideoClipAudio(
  videoPath: string,
  sourceStartSeconds: number,
  durationSeconds: number,
  extract: RunAudioExtraction = extractVideoClipAudio,
  transcribe: (
    audioPath: string,
  ) => Promise<unknown> = transcribeAudioWithWhisper,
) {
  if (
    !Number.isFinite(sourceStartSeconds) ||
    sourceStartSeconds < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > maxClipSeconds
  )
    throw new Error("The selected video clip has invalid audio timing.");
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "flox-video-whisper-"),
  );
  const audioPath = path.join(directory, "clip-audio.wav");
  try {
    await extract(videoPath, sourceStartSeconds, durationSeconds, audioPath);
    return await transcribe(audioPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
