import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditTimeline } from "@motion/sdk/timeline";
import {
  addVisualAssetGroup,
  removeVisualAssetGroup,
  updateVisualAssetGroup,
} from "../apps/desktop/src/asset-groups";

const base = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 180,
  tracks: [{ id: "visuals", name: "Visuals" }],
  clips: [],
});

test("asset groups persist stable media references without creating Timeline clips", () => {
  const group = {
    id: "character-y",
    name: "Character Y",
    category: "characters" as const,
    members: [
      {
        id: "pose-neutral",
        assetId: "character-y-neutral",
        label: "Neutral",
        role: "pose" as const,
        offsetX: 0,
        offsetY: 0,
      },
      {
        id: "pose-talk",
        assetId: "character-y-talk",
        label: "Talking",
        role: "pose" as const,
        offsetX: -1.5,
        offsetY: 2,
      },
    ],
  };
  const edited = addVisualAssetGroup(base, group);
  const reloaded = parseEditTimeline(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(reloaded.assetGroups, [group]);
  assert.deepEqual(reloaded.clips, []);
  assert.deepEqual(reloaded.tracks, base.tracks);
});

test("asset group edits reorder and rename canonical members; removing a group keeps clips", () => {
  const group = {
    id: "character-y",
    name: "Character Y",
    category: "characters" as const,
    members: [
      {
        id: "y1",
        assetId: "y-one",
        label: "Y1",
        role: "pose" as const,
        offsetX: 0,
        offsetY: 0,
      },
      {
        id: "y2",
        assetId: "y-two",
        label: "Y2",
        role: "pose" as const,
        offsetX: 0,
        offsetY: 0,
      },
    ],
  };
  const created = addVisualAssetGroup(base, group);
  const edited = updateVisualAssetGroup(created, group.id, (current) => {
    current.name = "Character Y revised";
    current.members.reverse();
    return current;
  });
  assert.equal(edited.assetGroups?.[0].name, "Character Y revised");
  assert.equal(edited.assetGroups?.[0].members[0].id, "y2");
  assert.deepEqual(removeVisualAssetGroup(edited, group.id).assetGroups, []);
});

test("project data rejects duplicate member identities and malformed media references", () => {
  assert.throws(
    () =>
      parseEditTimeline({
        ...base,
        assetGroups: [
          {
            id: "group-a",
            name: "A",
            category: "characters",
            members: [
              { id: "same", assetId: "image-a", label: "A" },
              { id: "same", assetId: "image-b", label: "B" },
            ],
          },
        ],
      }),
    /Duplicate member IDs/,
  );
  assert.throws(() =>
    parseEditTimeline({
      ...base,
      assetGroups: [
        {
          id: "group-a",
          name: "A",
          category: "characters",
          members: [{ id: "member-a", assetId: "../image", label: "A" }],
        },
      ],
    }),
  );
});
