import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStoryboard, newScene, newSet, storyboardSchema } from "@motion/project-loader/storyboard";
import { getStoryboardDirectiveCoverage, listStoryboardDirectives } from "@motion/project-loader/storyboard-collaboration";
import { appendStoryboardCollaboration, readStoryboard, saveStoryboard } from "../scripts/storyboard-store";
import { createProject } from "../scripts/project-scaffold";

test("collaboration coverage follows existing stable shot IDs and reports unanswered direction", () => {
  const document = emptyStoryboard("collab-demo");
  const scene = newScene("scene-one", "Scene One");
  const shot = newSet("shot-one", "Shot One");
  shot.description = "The lantern flickers, then steadies.";
  shot.cameraNote = "Slow push-in.";
  scene.sets.push(shot);
  document.scenes.push(scene);

  const parsed = storyboardSchema.parse(document);
  const directives = listStoryboardDirectives(parsed);
  assert.deepEqual(directives.map(({ directiveId }) => directiveId), [
    "shot:shot-one:description",
    "shot:shot-one:cameraNote",
  ]);
  assert.deepEqual(
    getStoryboardDirectiveCoverage(parsed, { sceneId: scene.id, setId: shot.id }).map(({ status }) => status),
    ["awaiting-animator", "awaiting-animator"],
  );
});

test("animator questions, decisions, implementation and self-review stay linked to one directive", () => {
  const document = emptyStoryboard("collab-demo");
  const scene = newScene("scene-one", "Scene One");
  const shot = newSet("shot-one", "Shot One");
  shot.description = "The lantern flickers, then steadies.";
  scene.sets.push(shot);
  document.scenes.push(scene);
  document.collaboration = [
    { id: "msg-1", sceneId: scene.id, setId: shot.id, targetKind: "shot", targetId: shot.id, field: "description", author: "animator", kind: "question", outcome: "needs-clarification", replyToId: null, message: "Should the flicker affect the whole frame or only the lantern?", timelineClipIds: [], componentIds: [], sourceFiles: [], createdAt: "2026-10-28T10:00:00.000Z" },
    { id: "msg-2", sceneId: scene.id, setId: shot.id, targetKind: "shot", targetId: shot.id, field: "description", author: "director", kind: "decision", replyToId: "msg-1", message: "Only the lantern; keep the background steady.", timelineClipIds: [], componentIds: [], sourceFiles: [], createdAt: "2026-10-28T10:01:00.000Z" },
    { id: "msg-3", sceneId: scene.id, setId: shot.id, targetKind: "shot", targetId: shot.id, field: "description", author: "animator", kind: "implementation", outcome: "implemented", replyToId: null, message: "Added a deterministic lantern brightness pulse.", timelineClipIds: ["lantern-pulse"], componentIds: ["lantern-glow"], sourceFiles: ["src/scenes/scene-one.tsx"], createdAt: "2026-10-28T10:02:00.000Z" },
    { id: "msg-4", sceneId: scene.id, setId: shot.id, targetKind: "shot", targetId: shot.id, field: "description", author: "animator", kind: "self-review", outcome: "self-checked", replyToId: "msg-3", message: "Checked at the start, peak and end frames; background remains steady.", timelineClipIds: ["lantern-pulse"], componentIds: ["lantern-glow"], sourceFiles: ["src/scenes/scene-one.tsx"], createdAt: "2026-10-28T10:03:00.000Z" },
  ];

  const parsed = storyboardSchema.parse(document);
  const [coverage] = getStoryboardDirectiveCoverage(parsed, { setId: shot.id });
  assert.equal(coverage.status, "self-checked");
  assert.equal(coverage.messages.length, 4);
  assert.deepEqual(coverage.timelineClipIds, ["lantern-pulse"]);
  assert.deepEqual(coverage.componentIds, ["lantern-glow"]);
  assert.deepEqual(coverage.sourceFiles, ["src/scenes/scene-one.tsx"]);

  const oldDocument = structuredClone(document) as Record<string, unknown>;
  delete oldDocument.collaboration;
  assert.deepEqual(storyboardSchema.parse(oldDocument).collaboration, []);
});

test("collaboration rejects replies to unrelated targets and unsafe source paths", () => {
  const document = emptyStoryboard("collab-demo");
  const scene = newScene("scene-one", "Scene One");
  const shot = newSet("shot-one", "Shot One");
  shot.description = "Move the lantern.";
  scene.sets.push(shot);
  document.scenes.push(scene);
  document.collaboration = [{
    id: "msg-1", sceneId: scene.id, setId: shot.id, targetKind: "shot", targetId: shot.id,
    field: "description", author: "animator", kind: "implementation", replyToId: null,
    message: "Implemented.", timelineClipIds: [], componentIds: [], sourceFiles: ["../outside.tsx"],
    createdAt: "2026-10-28T10:00:00.000Z",
  }];
  assert.throws(() => storyboardSchema.parse(document), /project-relative paths/);
});

test("local animator handoff appends one validated response without replacing the plan", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "storyboard-collaboration-"));
  const projectsRoot = path.join(temporary, "projects");
  const projectId = "collaboration-project";
  try {
    await mkdir(projectsRoot, { recursive: true });
    await createProject(projectsRoot, projectId);
    const document = emptyStoryboard(projectId);
    const scene = newScene("scene-one", "Scene One");
    const shot = newSet("shot-one", "Shot One");
    shot.description = "The lantern flickers, then steadies.";
    scene.sets.push(shot);
    document.scenes.push(scene);
    const initial = await readStoryboard(path.join(projectsRoot, projectId), projectId);
    const savedPlan = await saveStoryboard(path.join(projectsRoot, projectId), projectId, document, initial.revision);
    const animatorEntry = {
      id: "animator-reply-1",
      sceneId: scene.id,
      setId: shot.id,
      targetKind: "shot",
      targetId: shot.id,
      field: "description",
      author: "animator",
      kind: "implementation",
      outcome: "implemented",
      replyToId: null,
      message: "Implemented and linked the lantern pulse.",
      timelineClipIds: ["lantern-pulse"],
      componentIds: ["lantern-glow"],
      sourceFiles: ["src/scenes/scene-one.tsx"],
      outputs: [{ id: "lantern-pulse-output", kind: "motion", name: "Lantern pulse", description: "A brightness pulse on the lantern.", assetReferenceId: null, targetElementId: null, startFrame: 0, durationInFrames: 45 }],
      createdAt: "2026-10-28T10:00:00.000Z",
    };
    await assert.rejects(
      appendStoryboardCollaboration(projectsRoot, projectId, { ...animatorEntry, outputs: [] }),
      /must declare at least one output/,
    );
    const result = await appendStoryboardCollaboration(projectsRoot, projectId, animatorEntry);
    assert.notEqual(result.revision, savedPlan.revision);
    assert.equal(result.document.scenes[0].sets[0].description, "The lantern flickers, then steadies.");
    assert.equal(result.document.collaboration[0].id, "animator-reply-1");
    assert.equal((await readStoryboard(path.join(projectsRoot, projectId), projectId)).document.collaboration.length, 1);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
