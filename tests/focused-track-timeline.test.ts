import assert from "node:assert/strict";
import test from "node:test";
import type { TimelineClip } from "@motion/sdk/timeline";
import {
  clipsForTrack,
  tracksForFocusedTimeline,
} from "../apps/desktop/src/timeline-focus";

function clip(id: string, trackId: string, from: number): TimelineClip {
  return {
    id,
    trackId,
    componentId: "text",
    label: id,
    from,
    durationInFrames: 30,
    content: { text: id },
    props: {},
  } as unknown as TimelineClip;
}

test("focused Timeline filters clips and rows to the selected object's track", () => {
  const selected = clip("caption-2", "captions", 180);
  const clips = [
    clip("caption-1", "captions", 60),
    selected,
    clip("caption-3", "captions", 300),
    clip("music", "audio", 0),
  ];
  const tracks = [
    { id: "captions", name: "Captions" },
    { id: "audio", name: "Audio" },
  ];

  assert.deepEqual(
    clipsForTrack(clips, selected.trackId).map((item) => item.id),
    ["caption-1", "caption-2", "caption-3"],
  );
  assert.deepEqual(tracksForFocusedTimeline(tracks, selected.trackId), [
    tracks[0],
  ]);
  assert.deepEqual(tracksForFocusedTimeline(tracks), tracks);
});
