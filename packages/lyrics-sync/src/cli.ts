import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { safeFile, projectId } from "@motion/project-loader";
import { reconcile, toJSON, toSRT, toLRC, toWords } from "./index";
const [id, audio, lyrics] = process.argv.slice(2);
if (!id || !audio || !lyrics)
  throw new Error(
    "Usage: npm run sync:lyrics -- <project-id> <relative-audio> <relative-lyrics.txt>",
  );
projectId.parse(id);
const root = path.resolve(import.meta.dirname, "../../..");
const project = path.join(root, "projects", id);
const audioPath = await safeFile(project, audio);
const lyricsPath = await safeFile(project, lyrics);
const out = path.join(root, "out", id);
await mkdir(out, { recursive: true });
const transcript = path.join(out, "transcript.json");
await new Promise<void>((resolve, reject) => {
  const child = spawn(
    process.env.STUDIO_PYTHON ?? "python",
    [
      path.join(root, "packages/lyrics-sync/whisper_adapter.py"),
      audioPath,
      transcript,
    ],
    { stdio: "inherit", windowsHide: true },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`Whisper exited with code ${code}`)),
  );
});
const timeline = reconcile(
  await readFile(lyricsPath, "utf8"),
  JSON.parse(await readFile(transcript, "utf8")),
);
timeline.audio = audio;
await Promise.all([
  writeFile(path.join(out, "timeline.json"), toJSON(timeline)),
  writeFile(path.join(out, "timeline.srt"), toSRT(timeline)),
  writeFile(path.join(out, "timeline.lrc"), toLRC(timeline)),
  writeFile(path.join(out, "words.json"), toWords(timeline)),
]);
const words = timeline.lines.flatMap((l) => l.words);
console.log(
  `Matched ${words.filter((w) => w.start !== null).length}/${words.length} words. Review all timings. Output: ${out}`,
);
