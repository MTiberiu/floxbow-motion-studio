import path from "node:path";
import { resolveStoryboardContext } from "./storyboard-store";
const [projectId, operation, identity, setId] = process.argv.slice(2);
if (!projectId || !operation)
  throw new Error(
    "Usage: npx tsx scripts/storyboard-context.ts <projectId> <operation> [identity] [setId]",
  );
console.log(
  JSON.stringify(
    await resolveStoryboardContext(
      path.resolve(import.meta.dirname, "../projects"),
      projectId,
      operation,
      identity,
      setId,
    ),
    null,
    2,
  ),
);
