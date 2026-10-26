import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyPoseStudioLibrary,
  gridRegions,
  poseStepAtTime,
  comboDurationMs,
  poseStudioLibrarySchema,
} from "../apps/desktop/src/pose-studio-data";

test("pose grid creates up to 1,000 independent crop regions without copying image data", () => {
  const regions = gridRegions(3840, 2160, 20, 10);
  assert.equal(regions.length, 200);
  assert.equal(regions[36].label, "37");
  assert.equal(regions[36].rectPx.x, 3072);
  assert.equal(regions[36].rectPx.y, 216);
  assert.equal(regions[36].rectPx.w, 192);
  assert.equal(regions[36].rectPx.h, 216);
  assert.equal(new Set(regions.map((region) => region.id)).size, 200);
  assert.equal(gridRegions(100, 50, 40, 25).length, 1000);
  assert.throws(() => gridRegions(100, 50, 41, 25), /1,000/);
  assert.throws(() => gridRegions(100, 50, 10, 10, 50, 0), /no room/);
});

test("pose library validates character, single-pose, repeated combo and stable crop references", () => {
  const library = emptyPoseStudioLibrary();
  const first = gridRegions(640, 480, 2, 2);
  const character = {
    id: "character-cat",
    name: "Cat",
    categoryId: "category-general",
    description: "Red dancer",
    sheetIds: ["sheet-cat"],
  };
  const sheet = {
    id: "sheet-cat",
    characterId: character.id,
    name: "Cat poses",
    sourceName: "cat.png",
    mimeType: "image/png",
    widthPx: 640,
    heightPx: 480,
    regions: first,
  };
  library.characters.push(character);
  library.sheets.push(sheet);
  library.combos.push({
    id: "combo-dance",
    characterId: character.id,
    sheetId: sheet.id,
    name: "Dance",
    speed: 1,
    loop: true,
    steps: [
      { id: "step-a", poseId: first[0].id, durationMs: 120, transition: "cut" },
      { id: "step-b", poseId: first[2].id, durationMs: 240, transition: "cut" },
      { id: "step-c", poseId: first[0].id, durationMs: 80, transition: "cut" },
    ],
  });
  assert.equal(
    poseStudioLibrarySchema.parse(library).combos[0].steps.length,
    3,
  );
  const onePoseLibrary = structuredClone(library);
  onePoseLibrary.combos[0].steps = [
    {
      id: "step-single",
      poseId: first[1].id,
      durationMs: 120,
      transition: "cut",
    },
  ];
  assert.equal(
    poseStudioLibrarySchema.parse(onePoseLibrary).combos[0].steps.length,
    1,
  );
  const invalid = structuredClone(library);
  invalid.sheets[0].regions = invalid.sheets[0].regions.filter(
    (region) => region.id !== first[2].id,
  );
  assert.throws(() => poseStudioLibrarySchema.parse(invalid), /unknown pose/);
});

test("existing pose libraries gain default crop transforms and masks; edited masks round-trip", () => {
  const library = emptyPoseStudioLibrary();
  const regions = gridRegions(100, 100, 1, 1);
  const pose = structuredClone(regions[0]) as Record<string, unknown>;
  delete pose.sourceView;
  delete pose.maskStrokes;
  const normalized = poseStudioLibrarySchema.parse({
    ...library,
    characters: [
      {
        id: "character-mask",
        name: "Mask test",
        categoryId: "category-general",
        description: "",
        sheetIds: ["sheet-mask"],
      },
    ],
    sheets: [
      {
        id: "sheet-mask",
        characterId: "character-mask",
        name: "Sheet",
        sourceName: "sheet.png",
        mimeType: "image/png",
        widthPx: 100,
        heightPx: 100,
        regions: [pose],
      },
    ],
  });
  assert.deepEqual(normalized.sheets[0].regions[0].sourceView, {
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  assert.deepEqual(normalized.sheets[0].regions[0].maskStrokes, []);
  const editable = normalized as unknown as {
    sheets: Array<{
      regions: Array<{
        sourceView: { zoom: number; panX: number; panY: number };
        maskStrokes: Array<{
          points: Array<{ x: number; y: number }>;
          width: number;
        }>;
      }>;
    }>;
  };
  editable.sheets[0].regions[0].sourceView = {
    zoom: 2.5,
    panX: 0.2,
    panY: -0.3,
  };
  editable.sheets[0].regions[0].maskStrokes.push({
    points: [
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.7 },
    ],
    width: 0.06,
  });
  const saved = poseStudioLibrarySchema.parse(normalized).sheets[0].regions[0];
  assert.equal(saved.sourceView.zoom, 2.5);
  assert.deepEqual(saved.maskStrokes[0].points[1], { x: 0.8, y: 0.7 });
});

test("pose preview evaluation applies speed and loops without accumulated frame timers", () => {
  const combo = {
    speed: 2,
    loop: true,
    steps: [
      {
        id: "one",
        poseId: "pose-one",
        durationMs: 100,
        transition: "cut" as const,
      },
      {
        id: "two",
        poseId: "pose-two",
        durationMs: 200,
        transition: "cut" as const,
      },
    ],
  };
  assert.equal(comboDurationMs(combo), 150);
  assert.deepEqual(poseStepAtTime(combo, 0), {
    stepIndex: 0,
    poseId: "pose-one",
    elapsedInStepMs: 0,
  });
  assert.equal(poseStepAtTime(combo, 49)?.poseId, "pose-one");
  assert.equal(poseStepAtTime(combo, 50)?.poseId, "pose-two");
  assert.equal(poseStepAtTime(combo, 150)?.poseId, "pose-one");
  assert.equal(
    poseStepAtTime({ ...combo, loop: false }, 500)?.poseId,
    "pose-two",
  );
  assert.equal(poseStepAtTime(combo, -1), undefined);
});
