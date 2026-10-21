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
      throw new Error(`The native audio file picker (${command}) is unavailable.`);
    throw error;
  }
}

/** Show a host-native picker. The browser cannot provide or choose the stored path. */
export async function pickAudioFile(): Promise<string | undefined> {
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = 'Select audio for FloxBow Motion Studio'",
      "$dialog.Filter = 'Audio files (*.mp3;*.wav)|*.mp3;*.wav'",
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
    const script =
      'POSIX path of (choose file with prompt "Select audio for FloxBow Motion Studio" of type {"mp3", "wav"})';
    const selected = await run("osascript", ["-e", script]);
    return selected || undefined;
  }

  if (process.platform === "linux") {
    const selected = await run("zenity", [
      "--file-selection",
      "--title=Select audio for FloxBow Motion Studio",
      "--file-filter=Audio files | *.mp3 *.wav",
    ]);
    return selected || undefined;
  }

  throw new Error(`Native audio selection is not supported on ${process.platform}.`);
}
