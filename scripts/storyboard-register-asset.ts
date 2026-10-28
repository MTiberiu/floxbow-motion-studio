import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { projectId, safeFile } from "@motion/project-loader";
import { registerStoryboardPngs, readMediaRegistry } from "./media-store";
import { readStoryboard, saveStoryboard } from "./storyboard-store";

const [projectIdInput, sourceInput, referenceIdInput, nameInput, categoryInput = "Animator asset"] = process.argv.slice(2);
if (!projectIdInput || !sourceInput || !referenceIdInput || !nameInput)
  throw new Error("Usage: npx tsx scripts/storyboard-register-asset.ts <projectId> <project-relative-png> <referenceId> <name> [category]");

const validatedProjectId = projectId.parse(projectIdInput);
const referenceId = projectId.parse(referenceIdInput);
const projectsRoot = path.resolve(import.meta.dirname, "../projects");
const projectRoot = path.dirname(await safeFile(projectsRoot, `${validatedProjectId}/project.json`));
const sourceFile = await safeFile(projectRoot, sourceInput);
if (path.extname(sourceFile).toLowerCase() !== ".png")
  throw new Error("Animator image assets must be PNG files.");
const sourceInfo = await stat(sourceFile);
if (sourceInfo.size > 25 * 1024 * 1024)
  throw new Error("Storyboard image assets must be 25 MB or smaller.");

const relativeDestination = `assets/storyboard/references/${referenceId}.png`;
const destination = path.join(projectRoot, relativeDestination);
await mkdir(path.dirname(destination), { recursive: true });
try {
  const previous = await readFile(destination);
  const source = await readFile(sourceFile);
  if (!previous.equals(source))
    throw new Error(`Storyboard reference ${referenceId} already exists with different pixels; use a new stable reference ID for a revision.`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  await copyFile(sourceFile, destination, 1);
}

const media = await readMediaRegistry(projectRoot);
const registered = await registerStoryboardPngs(projectRoot, media.revision, [{ id: referenceId, name: nameInput }]);
const assetId = registered.assets[0]?.assetId;
if (!assetId) throw new Error("Storyboard image registration did not return an asset ID.");

const saved = await readStoryboard(projectRoot, validatedProjectId);
const existing = saved.document.references.find(reference => reference.id === referenceId);
if (existing && existing.assetId !== assetId)
  throw new Error(`Storyboard reference ${referenceId} is already linked to another media asset.`);
const document = existing ? saved.document : {
  ...saved.document,
  references: [...saved.document.references, {
    id: referenceId,
    assetId,
    file: relativeDestination,
    name: nameInput,
    category: categoryInput,
    role: "element" as const,
    description: "Registered Animator image output.",
  }],
};
const result = await saveStoryboard(projectRoot, validatedProjectId, document, saved.revision);
console.log(JSON.stringify({ projectId: validatedProjectId, referenceId, assetId, file: relativeDestination, storyboardRevision: result.revision }));
