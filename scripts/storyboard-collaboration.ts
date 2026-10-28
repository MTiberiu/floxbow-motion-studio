import path from "node:path";
import { appendStoryboardCollaboration } from "./storyboard-store";

const [projectId] = process.argv.slice(2);
if (!projectId)
  throw new Error(
    "Usage: npx tsx scripts/storyboard-collaboration.ts <projectId> < message.json",
  );

let body = "";
for await (const chunk of process.stdin) {
  body += chunk.toString();
  if (Buffer.byteLength(body) > 64_000)
    throw new Error("Collaboration entry exceeds 64 KB");
}
if (!body.trim()) throw new Error("Provide one collaboration entry as JSON on stdin");

const saved = await appendStoryboardCollaboration(
  path.resolve(import.meta.dirname, "../projects"),
  projectId,
  JSON.parse(body),
);
console.log(JSON.stringify({
  projectId,
  revision: saved.revision,
  appendedMessage: saved.document.collaboration.at(-1)?.id,
}));
