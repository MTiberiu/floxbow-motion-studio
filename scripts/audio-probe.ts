import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Probe duration with Remotion's managed ffprobe binary; paths stay in the host. */
export async function probeAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { windowsHide: true, timeout: 60_000, maxBuffer: 16_384 },
    );
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("The audio file has no decodable duration.");
    return duration;
  } catch (error) {
    if (error instanceof Error && error.message.includes("decodable duration"))
      throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        "FFmpeg tools are unavailable. Install FFmpeg with ffprobe on PATH, then retry.",
      );
    throw new Error(
      "The selected audio cannot be decoded. Choose a valid MP3 or WAV file.",
    );
  }
}
