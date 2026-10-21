import path from "node:path";
import { renderProject } from "./render";
const id = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!id) throw new Error("Usage: npm run render -- <project-id> [--still]");
console.log(
  await renderProject(
    path.resolve(import.meta.dirname, "../../.."),
    id,
    process.argv.includes("--still"),
  ),
);
