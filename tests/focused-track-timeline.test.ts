import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineClip } from "@motion/sdk/timeline";
import {
  clipsForTrack,
  FocusedTrackTimeline,
} from "../apps/desktop/src/FocusedTrackTimeline";

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

test("focused Timeline contains only the selected object's track and exposes transport and zoom", () => {
  const selected = clip("caption-2", "captions", 180);
  const trackClips = clipsForTrack(
    [
      clip("caption-1", "captions", 60),
      selected,
      clip("caption-3", "captions", 300),
      clip("music", "audio", 0),
    ],
    selected.trackId,
  );

  assert.deepEqual(
    trackClips.map((item) => item.id),
    ["caption-1", "caption-2", "caption-3"],
  );
  const markup = renderToStaticMarkup(
    createElement(FocusedTrackTimeline, {
      clips: trackClips,
      selectedClipId: selected.id,
      trackName: "Captions",
      frame: selected.from,
      fps: 30,
      durationInFrames: 600,
      playing: false,
      onSelectClip: () => {},
      onSeek: () => {},
      onTogglePlayback: () => {},
    }),
  );

  assert.match(markup, /caption-1/);
  assert.match(markup, /caption-3/);
  assert.doesNotMatch(markup, /music/);
  assert.match(markup, /Previous clip in this track/);
  assert.match(markup, /Play playback/);
  assert.match(markup, /Next clip in this track/);
  assert.match(markup, /Zoom in focused timeline/);
  assert.match(markup, /Seek focused timeline/);
});
