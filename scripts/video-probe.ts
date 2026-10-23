import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VideoMetadata = {
  durationInSeconds: number;
  width: number;
  height: number;
};

/** Read safe playback metadata with ffprobe while keeping the source path host-side. */
export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        filePath,
      ],
      { windowsHide: true, timeout: 60_000, maxBuffer: 32_768 },
    );
    const result = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; width?: number; height?: number }[];
    };
    const durationInSeconds = Number(result.format?.duration);
    const stream = result.streams?.[0];
    if (
      !Number.isFinite(durationInSeconds) ||
      durationInSeconds <= 0 ||
      stream?.codec_type !== "video" ||
      !Number.isInteger(stream.width) ||
      !Number.isInteger(stream.height) ||
      stream.width! < 1 ||
      stream.height! < 1
    )
      throw new Error("The MP4 has no usable video stream or duration.");
    return {
      durationInSeconds,
      width: stream.width!,
      height: stream.height!,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("usable video stream"))
      throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        "FFmpeg tools are unavailable. Install FFmpeg with ffprobe on PATH, then retry.",
      );
    throw new Error("The selected MP4 video cannot be decoded.");
  }
}
