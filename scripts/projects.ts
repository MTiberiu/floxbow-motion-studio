import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { discover, projectId } from "@motion/project-loader";
import { projectsDir } from "./server";
import {readEditor} from './editor-store';
const [command, id] = process.argv.slice(2);
if (command === "validate") {
  const projects = await discover(projectsDir);
  for(const p of projects)if(p.manifest?.editTimeline){try{await readEditor(path.join(projectsDir,p.id),p.manifest);}catch(e){p.error=String(e);}}
  for (const p of projects)
    console.log(
      `${p.error ? "FAIL" : "OK"} ${p.id}${p.error ? `: ${p.error}` : ""}`,
    );
  if (projects.some((p) => p.error)) process.exitCode = 1;
} else if (command === "create") {
  projectId.parse(id);
  const dir = path.join(projectsDir, id);
  await mkdir(dir);
  await mkdir(path.join(dir, "assets"));
  await mkdir(path.join(dir, "scenes"));
  await writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(
      {
        id,
        name: id
          .split("-")
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" "),
        type: "explainer",
        width: 1920,
        height: 1080,
        fps: 30,
        durationInFrames: 180,
        entry: "Composition.tsx",
        sdkVersion: "0.1.0",
        editTimeline: "edit-timeline.json",
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(dir, "Composition.tsx"),
    `import {TimelineComposition,type EditableVideoProps} from '@motion/sdk/editor';\nimport {parseEditTimeline} from '@motion/sdk/timeline';\nimport {subtitleModule} from '@motion/lyrics-sync/component';\nimport data from './edit-timeline.json';\nexport const editorComponents=[subtitleModule];\nexport default function Video({timeline}:EditableVideoProps){return <TimelineComposition timeline={timeline??parseEditTimeline(data)} components={editorComponents}/>;}\n`,
  );
  await writeFile(path.join(dir,'edit-timeline.json'),JSON.stringify({version:1,fps:30,durationInFrames:180,tracks:[{id:'visuals',name:'Visuals'},{id:'subtitles',name:'Subtitles'}],clips:[{id:'subtitle-1',trackId:'subtitles',componentId:'subtitles',label:'Opening subtitle',from:0,durationInFrames:180,content:{text:'Your next story starts here.',status:'unverified'},props:{y:50}}]},null,2));
  await writeFile(
    path.join(dir, "README.md"),
    `# ${id}\n\nSix-second editable subtitle project. No external assets. Uses @motion/sdk/editor and @motion/lyrics-sync/component. Edit edit-timeline.json for content/timing; Composition.tsx declares the components and their editable fields. The editor discovers this project automatically. Read docs/TIMELINE_EDITOR.md before adding scene components.\n`,
  );
  console.log(`Created projects/${id}. Select it in the studio.`);
} else throw new Error("Use validate or create <project-id>");
