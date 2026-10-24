import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEditTimeline } from "@motion/sdk/timeline";
import {
  createSceneMoment,
  removeSceneMoment,
  renameSceneMoment,
} from "../apps/desktop/src/scene-moments";

const base = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 300,
  tracks: [{ id: "visuals", name: "Visuals", kind: "visual" }],
  scenes: [{ id: "scene-a", name: "Scene A", from: 60, durationInFrames: 120 }],
  assetGroups: [
    {
      id: "actor",
      name: "Actor",
      category: "characters",
      members: [
        {
          id: "neutral",
          assetId: "actor-neutral",
          label: "Neutral",
          role: "pose",
        },
        {
          id: "speaking",
          assetId: "actor-speaking",
          label: "Speaking",
          role: "pose",
        },
      ],
    },
  ],
  clips: [
    {
      id: "actor-clip",
      trackId: "visuals",
      sceneId: "scene-a",
      componentId: "character",
      label: "Actor",
      from: 75,
      durationInFrames: 90,
      content: {
        groupId: "actor",
        poseEvents: [
          { id: "state-neutral", atFrame: 15, memberId: "neutral" },
          { id: "state-speaking", atFrame: 45, memberId: "speaking" },
        ],
      },
      props: {},
    },
  ],
});

test("Scene Moments save scene-local bookmarks linked to active character pose events", () => {
  const created = createSceneMoment(base, "scene-a", 120, "Line begins");
  const moment = created.sceneMoments?.[0];
  assert.ok(moment);
  assert.equal(moment.atFrame, 60);
  assert.deepEqual(moment.characterStates, [
    { clipId: "actor-clip", poseEventId: "state-speaking" },
  ]);
  const renamed = renameSceneMoment(created, moment.id, "Dialogue begins");
  assert.equal(renamed.sceneMoments?.[0].name, "Dialogue begins");
  assert.deepEqual(removeSceneMoment(renamed, moment.id).sceneMoments, []);
  assert.throws(() => createSceneMoment(base, "scene-a", 180, "Outside"));
});

test("Scene Moment data rejects stale scene and character pose references", () => {
  const moment = {
    id: "moment-a",
    sceneId: "scene-a",
    name: "Moment",
    atFrame: 60,
    characterStates: [{ clipId: "actor-clip", poseEventId: "state-speaking" }],
  };
  assert.equal(
    parseEditTimeline({ ...base, sceneMoments: [moment] }).sceneMoments?.length,
    1,
  );
  assert.throws(() =>
    parseEditTimeline({
      ...base,
      sceneMoments: [
        {
          ...moment,
          characterStates: [{ clipId: "actor-clip", poseEventId: "missing" }],
        },
      ],
    }),
  );
  assert.throws(() =>
    parseEditTimeline({
      ...base,
      scenes: [
        { id: "scene-a", name: "Scene A", from: 60, durationInFrames: 50 },
      ],
      sceneMoments: [moment],
    }),
  );
});
