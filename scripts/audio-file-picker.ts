import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const timeout = 120_000;

async function run(command: string, args: string[]) {
  try {
    const result = await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 16_384,
    });
    return result.stdout.trim();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 1 || code === 5) return "";
    if (code === "ENOENT")
      throw new Error(
        `The native audio file picker (${command}) is unavailable.`,
      );
    throw error;
  }
}

/** Show a host-native picker. The browser cannot provide or choose the stored path. */
export async function pickMediaFile(
  type: "audio" | "image",
): Promise<string | undefined> {
  const title =
    type === "audio"
      ? "Select audio for FloxBow Motion Studio"
      : "Select PNG image for FloxBow Motion Studio";
  const filter =
    type === "audio"
      ? "Audio files (*.mp3;*.wav)|*.mp3;*.wav"
      : "PNG images (*.png)|*.png";
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      `$dialog.Title = '${title}'`,
      `$dialog.Filter = '${filter}'`,
      "$dialog.Multiselect = $false",
      "$dialog.CheckFileExists = $true",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($dialog.FileName) }",
    ].join("; ");
    const selected = await run("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-STA",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    return selected || undefined;
  }

  if (process.platform === "darwin") {
    const fileTypes = type === "audio" ? '{"mp3", "wav"}' : '{"png"}';
    const script = `POSIX path of (choose file with prompt "${title}" of type ${fileTypes})`;
    const selected = await run("osascript", ["-e", script]);
    return selected || undefined;
  }

  if (process.platform === "linux") {
    const selected = await run("zenity", [
      "--file-selection",
      `--title=${title}`,
      type === "audio"
        ? "--file-filter=Audio files | *.mp3 *.wav"
        : "--file-filter=PNG images | *.png",
    ]);
    return selected || undefined;
  }

  throw new Error(
    `Native media selection is not supported on ${process.platform}.`,
  );
}

export async function pickAudioFile(): Promise<string | undefined> {
  return pickMediaFile("audio");
}
