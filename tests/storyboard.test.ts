import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  attachShotReferenceImage,
  emptyStoryboard,
  newScene,
  newSet,
  storyboardSchema,
  directorBrief,
  directorPlanFingerprint,
  filmApprovalStatus,
  sceneApprovalStatus,
  sceneFingerprint,
  timingWarnings,
  type Storyboard,
} from "@motion/project-loader/storyboard";
import {
  readStoryboard,
  saveStoryboard,
  resolveStoryboardContext,
  storyboardTiming,
} from "../scripts/storyboard-store";
import { createProject } from "../scripts/project-scaffold";
import { manifestSchema } from "@motion/project-loader";
import { containImageRect, zipFiles } from "../apps/desktop/src/storyboard-export";
import { resolveStoryboardRecovery } from "../apps/desktop/src/storyboard-recovery";
import { renderStoryboardSvg } from "@motion/project-loader/storyboard-svg";
import { starterMotionLibrary, motionLibrarySchema } from "../apps/desktop/src/motion-library";
import { compositionPointToImage, imageBoundsInComposition, imagePathData, imagePointToComposition, smoothImagePath } from "../apps/desktop/src/storyboard-annotation-geometry";
import { mergeRecoveredAnnotations, repairRecoveredStoryboardText } from "../apps/desktop/src/storyboard-recovery";

test("image feedback geometry stabilizes freehand and closes smooth areas", () => {
  const handDrawn: [number, number][] = [[10, 10], [10.05, 10.02], [30, 12], [52, 35], [80, 10]];
  const smoothed = smoothImagePath(handDrawn, 1, false);
  assert.ok(smoothed.length > 4);
  assert.deepEqual(smoothed[0], handDrawn[0]);
  assert.deepEqual(smoothed.at(-1), handDrawn.at(-1));
  assert.match(imagePathData(smoothed), /Q/);
  assert.match(imagePathData([[10, 10], [80, 10], [50, 80]], true), /Z$/);
});

test("image feedback follows fit, fill and stretch placement across composition ratios", () => {
  const target = { x: 0, y: 0, width: 100, height: 100 };
  const landscape = imageBoundsInComposition(target, 1080, 1920, 1920, 1080, "contain");
  assert.ok(Math.abs(landscape.x - 34.1796875) < 0.0001);
  assert.equal(landscape.y, 0);
  assert.ok(Math.abs(landscape.width - 31.640625) < 0.0001);
  assert.equal(landscape.height, 100);
  const fill = imageBoundsInComposition(target, 1080, 1920, 1920, 1080, "cover");
  assert.equal(fill.x, 0);
  assert.ok(fill.y < 0);
  assert.equal(fill.width, 100);
  assert.ok(fill.height > 100);
  const stretch = imageBoundsInComposition(target, 1080, 1920, 1920, 1080, "stretch");
  assert.deepEqual(stretch, target);
  const portrait = imageBoundsInComposition(target, 1080, 1920, 1080, 1920, "contain");
  assert.deepEqual(portrait, target);
});

test("image feedback uses the same fitted image rectangle for input and rendering", () => {
  const target = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
  const sourcePoint = [23, 71] as const;
  const compositionPoint = imagePointToComposition(target, sourcePoint, 1080, 1920, 1920, 1080, "contain");
  const restoredPoint = compositionPointToImage(target, compositionPoint, 1080, 1920, 1920, 1080, "contain");
  assert.ok(restoredPoint);
  assert.ok(Math.abs(restoredPoint[0] - sourcePoint[0]) < 0.000001);
  assert.ok(Math.abs(restoredPoint[1] - sourcePoint[1]) < 0.000001);
  assert.equal(compositionPointToImage(target, [10, 50], 1080, 1920, 1920, 1080, "contain"), null, "letterbox space must not accept image marks");
  const portraitTarget = { x: 8, y: 10, width: 42, height: 78, rotation: 0 };
  const portraitPoint = imagePointToComposition(portraitTarget, sourcePoint, 1080, 1920, 1920, 1080, "contain");
  const restoredPortraitPoint = compositionPointToImage(portraitTarget, portraitPoint, 1080, 1920, 1920, 1080, "contain");
  assert.ok(restoredPortraitPoint);
  assert.ok(Math.abs(restoredPortraitPoint[0] - sourcePoint[0]) < 0.000001);
  assert.ok(Math.abs(restoredPortraitPoint[1] - sourcePoint[1]) < 0.000001);
});

test("recovered annotations merge onto the current storyboard without replacing saved content", () => {
  const latest = fixture();
  latest.annotations.push({ id: "annotation-saved", sceneId: "scene-office", setId: "set-1", objectId: null, targetReferenceId: "ref-chair", targetRepresentationId: "rep-1", coordinateSpace: "image-percent", kind: "point", points: [[10, 20]], label: "Saved", instruction: "Keep", color: "#ff0000" });
  const draft = structuredClone(latest);
  draft.annotations.push({ id: "annotation-local", sceneId: "scene-office", setId: "set-1", objectId: null, targetReferenceId: "ref-chair", targetRepresentationId: "rep-1", coordinateSpace: "image-percent", kind: "rectangle", points: [[10, 20], [30, 40]], label: "Recovered", instruction: "Adjust", color: "#00ff00", strokeWidth: 6 });
  const merged = mergeRecoveredAnnotations(latest, draft, () => "annotation-recovered", { width: 1920, height: 1080, fps: 30 });
  assert.equal(merged.added, 1);
  assert.deepEqual(merged.document.composition, { width: 1920, height: 1080, fps: 30 });
  assert.deepEqual(merged.document.annotations.map(item => item.id), ["annotation-saved", "annotation-local"]);
  assert.equal(merged.document.scenes[0].sets[0].representations[0].x, latest.scenes[0].sets[0].representations[0].x);
  const changedDraft = structuredClone(draft);
  changedDraft.scenes[0].name = "Unmerged scene edit";
  const annotationOnly = mergeRecoveredAnnotations(latest, changedDraft, () => "unused");
  assert.equal(annotationOnly.document.scenes[0].name, latest.scenes[0].name, "recovery must not replace newer saved scene data");
  assert.equal(annotationOnly.document.annotations.find(item => item.id === "annotation-local")?.instruction, "Adjust");
});

test("stale browser storyboard drafts yield to the latest saved project document", () => {
  const saved = fixture();
  saved.scenes[0].sets.push(newSet("set-split-layers", "Split layers"));
  const stale = fixture();
  stale.scenes[0].sets[0].name = "Old combined image";
  const result = resolveStoryboardRecovery(saved, "revision-new", stale, "revision-old");
  assert.equal(result.document.scenes[0].sets[0].name, saved.scenes[0].sets[0].name);
  assert.equal(result.discardLocalDraft, true);
  const currentDraft = resolveStoryboardRecovery(saved, "same-revision", stale, "same-revision");
  assert.equal(currentDraft.document.scenes[0].sets[0].name, "Old combined image");
  assert.equal(currentDraft.discardLocalDraft, false);
});

test("recovered storyboard drafts repair mojibake without changing correct UTF-8 text", () => {
  const damaged = "ÃŽntr-o noapte ploioasÄƒ, Mara aÈ™teaptÄƒ ultimul tramvai.";
  const correct = "Într-o noapte ploioasă, Mara așteaptă ultimul tramvai.";
  const repaired = repairRecoveredStoryboardText({ description: damaged, clean: correct });
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.value.description, correct);
  assert.equal(repaired.value.clean, correct);
  assert.equal(repairRecoveredStoryboardText(correct).value, correct);
});

test("storyboard reference images preserve their aspect ratio inside the selected project frame", () => {
  assert.deepEqual(containImageRect(1080, 1920, 1920, 1080), {
    x: 656.25, y: 0, width: 607.5, height: 1080,
  });
  assert.deepEqual(containImageRect(1920, 1080, 1920, 1080), {
    x: 0, y: 0, width: 1920, height: 1080,
  });
});

test("reusable motion library has stable built-in identities and supports variations", () => {
  const parsed = motionLibrarySchema.parse(structuredClone(starterMotionLibrary));
  assert.deepEqual(parsed.map((motion) => motion.name), ["Walk", "Run", "Jump", "Dance", "Idle"]);
  assert.equal(new Set(parsed.map((motion) => motion.id)).size, parsed.length);
  assert.equal(parsed.find((motion) => motion.type === "jump")?.poses.length, 3);
  assert.deepEqual(parsed.map((motion) => motion.poses.map((pose) => pose.id)), structuredClone(starterMotionLibrary).map((motion) => motion.poses.map((pose) => pose.id)));
});

function fixture() {
  const doc = emptyStoryboard("story-test"),
    scene = newScene("scene-office", "Andrei and Oana");
  doc.scenes.push(scene);
  scene.duration = 20;
  scene.objects.push({
    id: "obj-chair",
    name: "Chair",
    category: "prop",
    description: "The same chair throughout",
    instructions: "Do not move it",
    referenceIds: ["ref-chair"],
  });
  doc.references.push({
    id: "ref-chair",
    assetId: "chair",
    name: "Chair appearance",
    category: "prop",
    description: "Original appearance",
  });
  [
    "Empty office",
    "Andrei enters",
    "Andrei trips",
    "Oana enters",
    "Andrei sits",
  ].forEach((name, i) => {
    const set = newSet(`set-${i + 1}`, name);
    set.start = [0, 3, 6, 10, 14][i];
    set.duration = [3, 3, 4, 4, 6][i];
    set.representations.push({
      id: `rep-${i + 1}`,
      setId: set.id,
      coordinateSpace: "composition-percent",
      anchor: "top-left",
      rotation: 0,
      zOrder: 0,
      spatialNote: "",
      referenceId: null,
      objectId: "obj-chair",
      kind: "rectangle",
      x: 10,
      y: 20,
      width: 30,
      height: 50,
      points: [],
      color: "#123456",
      thickness: 3,
      text: "",
      visible: true,
      opacity: 1,
      locked: false,
      pose: "",
      instructions: "",
      motion: "",
    });
    scene.sets.push(set);
  });
  return doc;
}
test("storyboard validates continuity, identities, timing and reference relations", () => {
  const doc = fixture();
  assert.deepEqual(storyboardSchema.parse(doc), doc);
  assert.deepEqual(timingWarnings(doc.scenes[0]), []);
  const copy = structuredClone(doc);
  copy.scenes[0].sets[1].representations[0].x = 80;
  assert.equal(copy.scenes[0].sets[0].representations[0].x, 10);
  assert.equal(copy.scenes[0].sets[1].representations[0].objectId, "obj-chair");
  copy.scenes[0].sets[1].start = 2;
  assert.match(timingWarnings(copy.scenes[0]).join(), /overlaps/);
  copy.scenes[0].sets[0].duration = -1;
  assert.throws(() => storyboardSchema.parse(copy));
  copy.scenes[0].sets[0].duration = 3;
  copy.scenes[0].sets[0].representations[0].objectId = "unknown";
  assert.throws(() => storyboardSchema.parse(copy));
  assert.throws(() =>
    storyboardSchema.parse({ ...doc, projectId: "../escape" }),
  );
  doc.scenes[0].sets[1].id = doc.scenes[0].sets[0].id;
  assert.throws(() => storyboardSchema.parse(doc));
});
test("a shot keeps its approved key image separate from its editable layers", () => {
  const doc = fixture();
  doc.references.push({ id: "ref-chair-blue", assetId: "chair-blue", name: "Blue chair", category: "prop", description: "Revision" });
  const shot = doc.scenes[0].sets[0];
  shot.representations = [];
  attachShotReferenceImage(shot, "ref-chair", "rep-approved-key-image");
  assert.equal(storyboardSchema.parse(doc).scenes[0].sets[0].referenceImageId, "ref-chair");
  assert.equal(shot.representations.length, 1);
  assert.equal(shot.representations[0].referenceId, "ref-chair");
  assert.deepEqual([shot.representations[0].x, shot.representations[0].y, shot.representations[0].width, shot.representations[0].height], [0, 0, 100, 100]);
  shot.representations[0].x = 12;
  attachShotReferenceImage(shot, "ref-chair-blue", "unused-representation-id");
  assert.equal(shot.representations[0].id, "rep-approved-key-image");
  assert.equal(shot.representations[0].referenceId, "ref-chair-blue");
  assert.equal(shot.representations[0].x, 12, "replacing a key image keeps its saved composition placement");
  shot.referenceImageId = "ref-chair";
  attachShotReferenceImage(shot, "ref-chair", "unused-representation-id");
  assert.equal(shot.representations.length, 1, "attaching a key image must not duplicate an existing layer");
  const invalid = structuredClone(doc);
  invalid.scenes[0].sets[0].referenceImageId = "missing-reference";
  assert.throws(() => storyboardSchema.parse(invalid), /Unknown reference/);
  const legacy = structuredClone(doc) as Record<string, unknown>;
  const legacyScene = (legacy.scenes as Array<{ sets: Array<Record<string, unknown>> }>)[0];
  delete legacyScene.sets[0].referenceImageId;
  assert.doesNotThrow(() => storyboardSchema.parse(legacy));
});
test("brief preserves instructions, separates suggestions, marks stale source and uncertainty", () => {
  const doc = fixture(),
    scene = doc.scenes[0];
  scene.sets[2].description = "Raised arm means recovery, not waving.";
  const fp = sceneFingerprint(doc, scene);
  doc.briefs.push({
    id: "brief-one",
    sceneId: scene.id,
    text: "Hold the reaction.",
    sourceFingerprint: fp,
    approved: true,
  });
  assert.equal(sceneFingerprint(doc, scene), fp);
  scene.sets[2].description += " Pause briefly.";
  scene.sets[3].start = null;
  const brief = directorBrief(doc, {
    name: "Synthetic comedy",
    width: 1920,
    height: 1080,
    fps: 30,
  });
  for (const expected of [
    "Raised arm",
    "Hold the reaction",
    "STALE",
    "timing is unspecified",
    "Chair (obj-chair)",
    "Original appearance",
    "sketches/set-3.png",
    "ordered `sets` array is the sequence of Shots",
    "### Shot: Andrei trips (set-3; legacy data field: scene.sets, setId)",
  ])
    assert.ok(brief.includes(expected), expected);
});

test("scene and whole-film approvals are scoped to the approved content revision", () => {
  const doc = fixture();
  const first = doc.scenes[0];
  const other = newScene("scene-garden", "Garden reveal");
  other.sets.push(newSet("set-garden", "Quiet reveal"));
  doc.scenes.push(other);
  const approvedAt = "2026-10-27T10:00:00.000Z";
  doc.review.scenes.push({
    sceneId: first.id,
    fingerprint: sceneFingerprint(doc, first),
    approvedAt,
  });
  doc.review.scenes.push({
    sceneId: other.id,
    fingerprint: sceneFingerprint(doc, other),
    approvedAt,
  });
  doc.review.film = {
    fingerprint: directorPlanFingerprint(doc),
    approvedAt,
  };
  assert.equal(sceneApprovalStatus(doc, first), "approved");
  assert.equal(filmApprovalStatus(doc), "approved");

  first.description = "Rewrite only this scene from the beginning.";
  assert.equal(sceneApprovalStatus(doc, first), "needs-review");
  assert.equal(sceneApprovalStatus(doc, other), "approved");
  assert.equal(filmApprovalStatus(doc), "needs-review");

  const legacy = structuredClone(doc) as Partial<Storyboard>;
  delete legacy.review;
  assert.deepEqual(storyboardSchema.parse(legacy).review, {
    scenes: [],
    film: null,
  });
});

test("Director assets support direct agent revisions and precise image-space annotations", () => {
  const doc = fixture();
  doc.references.push({
    id: "ref-chair-blue",
    assetId: "ref-chair-blue",
    visualAssetId: "ref-chair",
    version: 2,
    role: "shot-image",
    width: 1536,
    height: 1024,
    hasAlpha: true,
    sha256: "a".repeat(64),
    file: "assets/storyboard/references/ref-chair-blue.png",
    name: "Blue chair shot image",
    category: "prop",
    description: "Revised chair appearance for this shot.",
    origin: "ai",
    prompt: "Keep the chair identity and make it blue.",
    basedOnReferenceIds: ["ref-chair"],
  });
  doc.scenes[0].sets[2].representations[0].referenceId = "ref-chair-blue";
  doc.scenes[0].sets[2].representations[0].kind = "reference";
  doc.scenes[0].objects[0].referenceIds.push("ref-chair-blue");
  doc.scenes[0].sets[2].referenceIds.push("ref-chair-blue");
  doc.annotations.push({
    id: "annotation-chair-seat",
    sceneId: "scene-office",
    setId: "set-3",
    objectId: "obj-chair",
    targetReferenceId: "ref-chair-blue",
    targetRepresentationId: "rep-3",
    coordinateSpace: "image-percent",
    kind: "polyline",
    points: [[22, 41], [50, 38], [79, 42]],
    label: "Seat edge",
    instruction: "Keep this edge level when the chair rocks.",
    color: "#ff3344",
    strokeWidth: 7,
  });
  doc.scenes[0].objects.push({ id: "obj-cup", name: "Cup", category: "prop", description: "", instructions: "", referenceIds: [] });
  doc.annotations[0].objectId = "obj-cup";
  assert.deepEqual(storyboardSchema.parse(doc).annotations, doc.annotations);
  const annotatedSvg = renderStoryboardSvg(doc, doc.scenes[0].sets[2]);
  assert.match(annotatedSvg, /id="annotation-chair-seat"/);
  assert.match(annotatedSvg, /Keep this edge level when the chair rocks/);
  assert.match(
    directorBrief(doc, { name: "Review", width: 1920, height: 1080, fps: 30 }),
    /image-percent coordinates \[\[22,41\],\[50,38\],\[79,42\]\]/,
  );
  const invalid = structuredClone(doc);
  invalid.annotations[0].targetReferenceId = "missing-reference";
  assert.throws(() => storyboardSchema.parse(invalid), /Annotation target image is missing/);
});
test("storyboard atomic save/reload, conflict rejection, agent resolver and real subtitle adapter", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "storyboard-test-"));
  try {
    const manifest = manifestSchema.parse(
        await createProject(root, "story-test"),
      ),
      project = path.join(root, "story-test"),
      doc = fixture();
    doc.scenes[0].sets[2].representations[0].kind = "reference";
    doc.scenes[0].sets[2].representations[0].referenceId = "ref-chair";
    doc.annotations.push({
      id: "annotation-chair-hinge",
      sceneId: "scene-office",
      setId: "set-3",
      objectId: "obj-chair",
      targetReferenceId: "ref-chair",
      targetRepresentationId: "rep-3",
      coordinateSpace: "image-percent",
      kind: "point",
      points: [[61, 48]],
      label: "Hinge",
      instruction: "Animate the chair pivot around this point.",
      color: "#ff3344",
    });
    doc.aiRequests.push({
      id: "request-mug-revision",
      kind: "revise",
      sceneId: "scene-office",
      setId: "set-3",
      objectId: "obj-chair",
      representationId: "rep-3",
      sourceReferenceId: "ref-chair",
      outputReferenceId: "generated-chair-v2",
      outputFile: "assets/storyboard/references/generated-chair-v2.png",
      instruction: "Keep the same chair identity; make it blue.",
      status: "pending",
    });
    doc.actionPlans.push({
      id: "motion-plan-walk",
      libraryActionId: "library-walk",
      libraryActionName: "Walk",
      type: "walk",
      sceneId: "scene-office",
      objectId: "obj-chair",
      fromSetId: "set-3",
      toSetId: "set-4",
      start: 6,
      duration: 2,
      loop: false,
      direction: "left to right",
      view: "side view",
      poseGuidance: "Keep feet aligned.",
      poses: [{ id: "walk-pose-one", name: "walk-1", note: "Lead foot forward", status: "needed", referenceId: null }],
      note: "Move toward the chair.",
      status: "planned",
    });
    const referenceFile = path.join(project, "chair.png");
    await writeFile(referenceFile, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=", "base64"));
    await writeFile(path.join(project, "media.json"), JSON.stringify({
      version: 1,
      assets: [{ id: "chair", type: "image", displayName: "Chair", source: { kind: "external-file", path: referenceFile } }],
    }));
    const initial = await readStoryboard(project, manifest.id);
    assert.equal(initial.revision, "missing");
    const prepared = await saveStoryboard(
      project,
      manifest.id,
      doc,
      initial.revision,
    );
    const approved = structuredClone(prepared.document);
    approved.review.scenes.push({
      sceneId: approved.scenes[0].id,
      fingerprint: sceneFingerprint(approved, approved.scenes[0]),
      approvedAt: "2026-10-27T10:00:00.000Z",
    });
    approved.review.film = {
      fingerprint: directorPlanFingerprint(approved),
      approvedAt: "2026-10-27T10:00:00.000Z",
    };
    const saved = await saveStoryboard(
      project,
      manifest.id,
      approved,
      prepared.revision,
    );
    const restored = (await readStoryboard(project, manifest.id)).document;
    assert.equal(filmApprovalStatus(restored), "approved", "Review state survives save and reload");
    assert.equal(restored.references[0].file, "assets/storyboard/references/ref-chair.png");
    assert.match(restored.references[0].sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.deepEqual(
      await readFile(path.join(project, "assets/storyboard/references/ref-chair.png")),
      await readFile(referenceFile),
    );
    await assert.rejects(
      saveStoryboard(project, manifest.id, doc, "missing"),
      /CONFLICT/,
    );
    const context = await resolveStoryboardContext(
      root,
      manifest.id,
      "getSetContext",
      "scene-office",
      "set-3",
    );
    assert.equal((context.directorPlan as { filmApproval: string }).filmApproval, "approved");
    assert.equal((context.directorPlan as { sceneApprovals: { sceneId: string; status: string }[] }).sceneApprovals[0].status, "approved");
    assert.equal(
      (context.result as { followingSet: { id: string } }).followingSet.id,
      "set-4",
    );
    assert.equal((context.result as { annotations: { targetReferenceId: string }[] }).annotations[0].targetReferenceId, "ref-chair");
    assert.equal((context.result as { references: { file: string }[] }).references[0].file, "assets/storyboard/references/ref-chair.png");
    assert.equal((context.result as { aiImageRequests: { id: string; outputFile: string }[] }).aiImageRequests[0].outputFile, "assets/storyboard/references/generated-chair-v2.png");
    assert.equal((context.result as { motionPlans: { libraryActionId: string; objectId: string }[] }).motionPlans[0].libraryActionId, "library-walk");
    const resolvedRepresentation = (context.result as { set: { representations: { objectId: string; x: number; y: number; width: number; height: number }[] } }).set.representations[0];
    assert.deepEqual(
      { objectId: resolvedRepresentation.objectId, x: resolvedRepresentation.x, y: resolvedRepresentation.y, width: resolvedRepresentation.width, height: resolvedRepresentation.height },
      { objectId: "obj-chair", x: 10, y: 20, width: 30, height: 50 },
    );
    assert.equal(context.revision, saved.revision);
    await assert.rejects(
      resolveStoryboardContext(root, "../escape", "listStoryboardScenes"),
    );
    await assert.rejects(
      resolveStoryboardContext(
        root,
        manifest.id,
        "getSetContext",
        "scene-office",
        "missing",
      ),
    );
    const generated = structuredClone(restored);
    const request = generated.aiRequests[0];
    await mkdir(path.join(project, "assets/storyboard/references"), { recursive: true });
    await writeFile(path.join(project, request.outputFile), await readFile(referenceFile));
    generated.references.push({
      id: request.outputReferenceId,
      assetId: request.outputReferenceId,
      file: request.outputFile,
      name: "Chair AI revision",
      category: "prop",
      description: "Blue chair variant",
      origin: "ai",
      prompt: request.instruction,
      basedOnReferenceIds: ["ref-chair"],
      requestId: request.id,
    });
    assert.equal(filmApprovalStatus(generated), "needs-review", "New visual assets require another film review");
    const sourceRep = generated.scenes[0].sets[2].representations[0];
    generated.scenes[0].sets[2].representations.push({
      ...structuredClone(sourceRep),
      id: "rep-chair-ai-v2",
      zOrder: 1,
      referenceId: request.outputReferenceId,
      x: 78,
    });
    request.status = "completed";
    const generatedSave = await saveStoryboard(project, manifest.id, generated, saved.revision);
    assert.equal(generatedSave.document.references[1].file, request.outputFile);
    assert.equal((await readStoryboard(project, manifest.id)).document.aiRequests[0].status, "completed");
    const immutableReferenceFile = path.join(project, "assets/storyboard/references/ref-chair.png");
    await writeFile(immutableReferenceFile, Buffer.concat([await readFile(immutableReferenceFile), Buffer.from([0])]));
    const changedAssetSnapshot = await readStoryboard(project, manifest.id);
    assert.deepEqual(changedAssetSnapshot.assetDrift, ["ref-chair"]);
    await assert.rejects(
      saveStoryboard(project, manifest.id, changedAssetSnapshot.document, changedAssetSnapshot.revision),
      /changed in place/,
      "An image revision must receive a new stable reference ID",
    );
    const file = path.join(project, "edit-timeline.json"),
      timeline = JSON.parse(await readFile(file, "utf8"));
    timeline.clips.push({
      id: "cue",
      label: "Synthetic timing evidence",
      trackId: "captions",
      componentId: "subtitles",
      from: 30,
      durationInFrames: 60,
      content: {
        text: "Andrei trips",
        status: "demo",
        words: [
          { id: "w1", text: "Andrei", start: 0, end: 0.5 },
          { id: "w2", text: "trips", start: 0.6, end: 1 },
        ],
      },
      props: {},
    });
    await writeFile(file, JSON.stringify(timeline));
    const timing = await storyboardTiming(project, manifest);
    assert.equal(timing.cues[0].words![1].start, 1.6);
    assert.equal(timing.cues[0].status, "demo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("portable ZIP directory points to exact bytes and rejects traversal", async () => {
  const data = new TextEncoder().encode("storyboard evidence");
  const zip = new Uint8Array(
    await zipFiles([{ name: "sketches/set-1.png", data }]).arrayBuffer(),
  );
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const length = view.getUint16(26, true);
  assert.deepEqual(zip.slice(30 + length, 30 + length + data.length), data);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.throws(() => zipFiles([{ name: "../private", data }]), /Unsafe/);
});

test("portrait spatial contract retains bounds, order, rotation and independent representations", () => {
  const doc = fixture();
  doc.composition = { width: 1080, height: 1920, fps: 30 };
  const r = doc.scenes[0].sets[2].representations[0];
  Object.assign(r, {
    kind: "reference",
    referenceId: "ref-chair",
    imageFit: "cover",
    x: 78,
    y: 82,
    width: 12,
    height: 15,
    rotation: 12,
    spatialNote: "Mug on lower-right desk",
  });
  const restored = storyboardSchema.parse(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(restored.scenes[0].sets[2].representations[0], r);
  assert.equal(restored.scenes[0].sets[2].representations[0].imageFit, "cover");
  assert.equal(restored.scenes[0].sets[0].representations[0].x, 10);
  const svg = renderStoryboardSvg(restored, restored.scenes[0].sets[2]);
  assert.match(svg, /viewBox="0 0 1080 1920"/);
  assert.match(svg, /rotate\(12\)/);
  assert.match(svg, /width="129.6" height="288"/);
  r.kind = "text";
  r.text = '<script>alert("bad")</script>';
  assert.ok(
    !renderStoryboardSvg(doc, doc.scenes[0].sets[2]).includes("<script>"),
  );
});

test("AI image results keep request provenance and add a new representation of the same object", () => {
  const doc = fixture();
  doc.actionPlans.push({
    id: "motion-plan-chair-walk",
    libraryActionId: "library-walk",
    libraryActionName: "Walk",
    type: "walk",
    sceneId: "scene-office",
    objectId: "obj-chair",
    fromSetId: "set-2",
    toSetId: "set-3",
    start: 3,
    duration: 3,
    loop: false,
    direction: "left to right",
    view: "side view",
    poseGuidance: "Keep the character design stable.",
    poses: [{ id: "walk-pose", name: "walk-1", note: "Lead foot forward", status: "needed", referenceId: null }],
    note: "Keep the same chair and character design.",
    status: "planned",
  });
  doc.aiRequests.push({
    id: "request-chair-v2",
    kind: "revise",
    sceneId: "scene-office",
    setId: "set-3",
    objectId: "obj-chair",
    representationId: "rep-3",
    sourceReferenceId: "ref-chair",
    outputReferenceId: "ai-chair-v2",
    outputFile: "assets/storyboard/references/ai-chair-v2.png",
    instruction: "Keep the object identity and make the chair blue.",
    status: "pending",
  });
  const result = structuredClone(doc);
  result.references.push({
    id: "ai-chair-v2",
    assetId: "ai-chair-v2",
    file: "assets/storyboard/references/ai-chair-v2.png",
    name: "Blue chair",
    category: "prop",
    description: "AI revision of the chair reference",
    origin: "ai",
    prompt: "Make the chair blue",
    basedOnReferenceIds: ["ref-chair"],
    requestId: "request-chair-v2",
  });
  const representation = structuredClone(result.scenes[0].sets[2].representations[0]);
  representation.id = "rep-chair-v2";
  representation.referenceId = "ai-chair-v2";
  representation.x = 78;
  representation.zOrder = 1;
  result.scenes[0].sets[2].representations.push(representation);
  result.aiRequests[0].status = "completed";
  const completed = storyboardSchema.parse(result);
  assert.equal(completed.scenes[0].sets[2].representations[1].objectId, "obj-chair");
  assert.equal(completed.scenes[0].sets[0].representations[0].x, 10);
  assert.match(directorBrief(completed, { name: "AI handoff", width: 1920, height: 1080, fps: 30 }), /ai-chair-v2\.png/);
  assert.match(directorBrief(completed, { name: "AI handoff", width: 1920, height: 1080, fps: 30 }), /Motion library set Walk/);
  const invalid = structuredClone(completed);
  invalid.references.find((reference) => reference.id === "ai-chair-v2")!.requestId = "wrong-request";
  assert.throws(() => storyboardSchema.parse(invalid), /Generated reference request is missing|AI request output provenance does not match/);
});
