import { discover } from "@motion/project-loader";
import path from "node:path";
import { projectsDir } from "./server";
import {readEditor} from './editor-store';
import { createProject } from "./project-scaffold";
const [command, id] = process.argv.slice(2);
if (command === "validate") {
  const projects = await discover(projectsDir);
  if (projects.length === 0) console.log("No user projects found. The workspace is clean.");
  for(const p of projects)if(p.manifest?.editTimeline){try{await readEditor(path.join(projectsDir,p.id),p.manifest);}catch(e){p.error=String(e);}}
  for (const p of projects)
    console.log(
      `${p.error ? "FAIL" : "OK"} ${p.id}${p.error ? `: ${p.error}` : ""}`,
    );
  if (projects.some((p) => p.error)) process.exitCode = 1;
} else if (command === "create") {
  const project = await createProject(projectsDir, id);
  console.log(`Created projects/${project.id}. Select it in the studio.`);
} else throw new Error("Use validate or create <project-id>");
