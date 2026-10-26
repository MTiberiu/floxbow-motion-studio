import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCharacterPose } from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";

const group = {
  id: "character-group",
  name: "Character",
  category: "characters" as const,
  members: [
    {
      id: "neutral",
      assetId: "character-neutral",
      label: "Neutral",
      role: "pose" as const,
      offsetX: 0,
      offsetY: 0,
    },
    {
      id: "talking",
      assetId: "character-talking",
      label: "Talking",
      role: "pose" as const,
      offsetX: -1,
      offsetY: 2,
    },
  ],
};

const document = {
  version: 1 as const,
  fps: 30,
  durationInFrames: 300,
  tracks: [{ id: "visuals", name: "Visuals", kind: "visual" as const }],
  scenes: [{ id: "scene-a", name: "Scene A", from: 60, durationInFrames: 120 }],
  assetGroups: [group],
  clips: [
    {
      id: "character-clip",
      trackId: "visuals",
      sceneId: "scene-a",
      componentId: "character",
      label: "Character",
      from: 90,
      durationInFrames: 60,
      content: {
        groupId: group.id,
        poseEvents: [
          { id: "pose-1", atFrame: 30, memberId: "neutral" },
          { id: "pose-2", atFrame: 45, memberId: "talking" },
        ],
      },
      props: { x: 50, y: 50, width: 40, height: 70, anchor: "bottom-center" },
    },
  ],
};

test("character pose events resolve from scene-local time and retain stable asset identities", () => {
  const parsed = parseEditTimeline(document);
  const events = parsed.clips[0].content.poseEvents as Array<{
    atFrame: number;
    memberId: string;
  }>;
  assert.equal(resolveCharacterPose(group, events, 30, 14)?.id, "neutral");
  assert.equal(resolveCharacterPose(group, events, 30, 15)?.id, "talking");
  assert.deepEqual(
    parsed.assetGroups?.[0].members.map((member) => member.assetId),
    ["character-neutral", "character-talking"],
  );
  assert.equal(parsed.clips[0].id, "character-clip");
});

test("large imported character sequences resolve the active pose without scanning every event", () => {
  const events = Array.from({ length: 1_000 }, (_, atFrame) => ({
    atFrame,
    memberId: atFrame % 2 === 0 ? "neutral" : "talking",
  }));
  assert.equal(resolveCharacterPose(group, events, 0, 998)?.id, "neutral");
  assert.equal(resolveCharacterPose(group, events, 0, 999)?.id, "talking");
  assert.equal(resolveCharacterPose(group, events, 0, -1)?.id, "neutral");
});

test("looping Pose Studio clips resolve one clip-local pose cycle repeatedly", () => {
  const events = [
    { atFrame: 0, memberId: "neutral" },
    { atFrame: 3, memberId: "talking" },
  ];
  assert.equal(resolveCharacterPose(group, events, 0, 0, 9)?.id, "neutral");
  assert.equal(resolveCharacterPose(group, events, 0, 3, 9)?.id, "talking");
  assert.equal(resolveCharacterPose(group, events, 0, 9, 9)?.id, "neutral");
  assert.equal(resolveCharacterPose(group, events, 0, 12, 9)?.id, "talking");
});

test("character clips reject unknown groups, alternative-only states, and out-of-scene poses", () => {
  assert.throws(() =>
    parseEditTimeline({
      ...document,
      clips: [
        {
          ...document.clips[0],
          content: {
            ...document.clips[0].content,
            groupId: "missing-group",
          },
        },
      ],
    }),
  );

  assert.throws(() =>
    parseEditTimeline({
      ...document,
      clips: [
        {
          ...document.clips[0],
          content: {
            groupId: group.id,
            poseEvents: [{ id: "bad", atFrame: 30, memberId: "not-a-pose" }],
          },
        },
      ],
    }),
  );

  assert.throws(() =>
    parseEditTimeline({
      ...document,
      clips: [
        {
          ...document.clips[0],
          content: {
            ...document.clips[0].content,
            poseEvents: [{ id: "bad", atFrame: 120, memberId: "neutral" }],
          },
        },
      ],
    }),
  );
});
