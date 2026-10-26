import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeClipRange,
  parseEditTimeline,
  type VisualAssetGroup,
} from "@motion/sdk/timeline";
import { resolveCharacterPose } from "@motion/sdk/editor";
import { addPoseStudioActionToTimeline } from "../apps/desktop/src/pose-studio-import";
import { changeTimelineClipRangeWithRipple } from "../apps/desktop/src/timeline-ripple";

const timeline = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 180,
  tracks: [{ id: "visuals", name: "Visuals", kind: "visual" }],
  scenes: [
    { id: "scene-intro", name: "Intro", from: 0, durationInFrames: 180 },
  ],
  clips: [],
});

const group: VisualAssetGroup = {
  id: "pose-group-dance",
  name: "Mina · Dance",
  category: "characters",
  source: {
    kind: "pose-studio",
    characterId: "character-mina",
    sheetId: "sheet-mina",
    comboId: "combo-dance",
  },
  members: [
    {
      id: "pose-member-one",
      assetId: "pose-image-one",
      sourcePoseId: "pose-one",
      label: "Pose 1",
      role: "pose",
      offsetX: 0,
      offsetY: 0,
    },
    {
      id: "pose-member-two",
      assetId: "pose-image-two",
      sourcePoseId: "pose-two",
      label: "Pose 2",
      role: "pose",
      offsetX: 0,
      offsetY: 0,
    },
  ],
};

test("Pose Studio action import creates one scene Character clip with timed source pose events", () => {
  const result = addPoseStudioActionToTimeline(timeline, {
    group,
    steps: [
      { memberId: "pose-member-one", durationMs: 100 },
      { memberId: "pose-member-two", durationMs: 200 },
    ],
    speed: 1,
    sceneId: "scene-intro",
    startFrame: 12,
    label: "Mina · Dance",
  });
  const clip = result.timeline.clips[0];
  assert.equal(result.timeline.assetGroups?.[0].source?.comboId, "combo-dance");
  assert.equal(clip.componentId, "character");
  assert.equal(clip.sceneId, "scene-intro");
  assert.equal(clip.from, 12);
  assert.equal(clip.durationInFrames, 9);
  assert.deepEqual(clip.content.poseEvents, [
    {
      id: (clip.content.poseEvents as Array<{ id: string }>)[0].id,
      atFrame: 0,
      memberId: "pose-member-one",
    },
    {
      id: (clip.content.poseEvents as Array<{ id: string }>)[1].id,
      atFrame: 3,
      memberId: "pose-member-two",
    },
  ]);
});

test("Pose Studio imports always repeat one compact cycle for the clip duration", () => {
  const result = addPoseStudioActionToTimeline(timeline, {
    group,
    steps: [
      { memberId: "pose-member-one", durationMs: 100 },
      { memberId: "pose-member-two", durationMs: 200 },
    ],
    speed: 1,
    sceneId: "scene-intro",
    startFrame: 12,
    label: "Mina · Dance",
  });
  const clip = result.timeline.clips[0];
  const events = clip.content.poseEvents as Array<{
    atFrame: number;
    memberId: string;
  }>;
  assert.equal(clip.durationInFrames, 9);
  assert.equal(clip.content.loop, true);
  assert.equal(clip.content.cycleFrames, 9);
  assert.equal(clip.content.poseEventSpace, "clip");
  assert.equal(events[0].atFrame, 0);
  assert.equal(events[1].atFrame, 3);
  assert.equal(events.length, group.members.length);
  assert.equal(
    resolveCharacterPose(group, events, 0, 9, Number(clip.content.cycleFrames))?.id,
    "pose-member-one",
    "the next cycle starts at the first pose instead of freezing on the final pose",
  );
  const moved = changeClipRange(result.timeline, clip.id, 30, 39);
  assert.equal(moved.clips[0].from, 30);
  assert.equal(moved.clips[0].durationInFrames, 9);
  assert.deepEqual(moved.clips[0].content.poseEvents, clip.content.poseEvents);
});

test("extending a looping imported action grows its scene and shifts later scenes", () => {
  const result = addPoseStudioActionToTimeline(timeline, {
    group,
    steps: [
      { memberId: "pose-member-one", durationMs: 100 },
      { memberId: "pose-member-two", durationMs: 200 },
    ],
    speed: 1,
    sceneId: "scene-intro",
    startFrame: 12,
    label: "Mina · Dance",
  });
  const withFollowingScene = parseEditTimeline({
    ...result.timeline,
    durationInFrames: 240,
    scenes: [
      { id: "scene-intro", name: "Intro", from: 0, durationInFrames: 180 },
      { id: "scene-outro", name: "Outro", from: 180, durationInFrames: 60 },
    ],
  });
  const clip = withFollowingScene.clips[0];
  const extended = changeTimelineClipRangeWithRipple(
    withFollowingScene,
    clip.id,
    clip.from,
    210,
    true,
    false,
  );
  assert.equal(extended.clips[0].durationInFrames, 210);
  assert.equal(extended.scenes?.[0].durationInFrames, 222);
  assert.equal(extended.scenes?.[1].from, 222);
  assert.equal(extended.durationInFrames, 282);
});

test("scene import rejects an action that cannot fit one complete pass", () => {
  assert.throws(
    () =>
      addPoseStudioActionToTimeline(timeline, {
        group,
        steps: [{ memberId: "pose-member-one", durationMs: 60_000 }],
        speed: 0.25,
        sceneId: "scene-intro",
        startFrame: 179,
        label: "Mina · Dance",
      }),
    /does not fit inside the selected scene/,
  );
});
