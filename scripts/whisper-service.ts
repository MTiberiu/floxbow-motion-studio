import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const worker = path.resolve(
  import.meta.dirname,
  "../packages/lyrics-sync/whisper_adapter.py",
);
const maxTranscriptBytes = 8_000_000;
const timeoutMs = 20 * 60 * 1000;

function workerError(stderr: string) {
  if (/Cached model missing/i.test(stderr))
    return new Error(
      "The local Whisper model is unavailable. Install the configured cached model, then try again.",
    );
  if (/No module named ['"]?whisper|ModuleNotFoundError/i.test(stderr))
    return new Error(
      "Local Whisper is unavailable in the selected Python environment. Install the existing Whisper dependencies, then try again.",
    );
  if (/ffmpeg.*not found|failed to load audio|ffmpeg error/i.test(stderr))
    return new Error(
      "Whisper could not decode this audio. Check that FFmpeg is installed and the MP3/WAV file is valid.",
    );
  return new Error(
    "Local Whisper transcription failed. Check the Python/Whisper installation and selected audio, then try again.",
  );
}

/** Run the existing local worker against a host-resolved audio path and return bounded raw Whisper JSON. */
export async function transcribeAudioWithWhisper(audioPath: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "flox-whisper-"));
  const outputPath = path.join(directory, "transcript.json");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.env.STUDIO_PYTHON ?? "python",
        [worker, audioPath, outputPath],
        { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
      );
      let stderr = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(
          new Error(
            "Local Whisper took too long and was stopped. Try a shorter audio file.",
          ),
        );
      }, timeoutMs);
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr = (stderr + chunk.toString()).slice(-12_000);
      });
      child.once("error", () =>
        finish(
          new Error(
            "Python could not start. Configure STUDIO_PYTHON with the local Whisper environment.",
          ),
        ),
      );
      child.once("exit", (code) =>
        code === 0 ? finish() : finish(workerError(stderr)),
      );
    });
    let info;
    try {
      info = await stat(outputPath);
    } catch {
      throw new Error("Whisper completed without returning a transcript.");
    }
    if (!info.isFile() || info.size === 0)
      throw new Error("Whisper completed without returning a transcript.");
    if (info.size > maxTranscriptBytes)
      throw new Error(
        "The Whisper result is too large to transfer safely. Try a shorter audio file.",
      );
    try {
      return JSON.parse(await readFile(outputPath, "utf8")) as unknown;
    } catch {
      throw new Error("Whisper returned an unreadable transcription result.");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
