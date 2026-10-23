import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  standaloneTextClipSchema,
  standaloneTextFields,
  standaloneTextModule,
} from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";

const clip = {
  id: "text-title",
  trackId: "visuals",
  componentId: "text",
  label: "Title",
  from: 0,
  durationInFrames: 90,
  content: { text: "AI and human use one document" },
  props: { x: 68, y: 24, fontSize: 84, color: "#00ff00", alignment: "right" },
};

test("standalone Text exposes the supported editable contract", () => {
  assert.deepEqual(
    standaloneTextFields.map((field) => field.key),
    ["text", "x", "y", "fontSize", "color", "alignment"],
  );
  assert.deepEqual(standaloneTextClipSchema.parse(clip), clip);
  assert.deepEqual(
    standaloneTextClipSchema.parse({
      ...clip,
      props: {},
    }).props,
    {
      x: 50,
      y: 50,
      fontSize: 72,
      color: "#ffffff",
      alignment: "center",
    },
  );
});

test("standalone Text rejects invalid externally authored project properties", () => {
  assert.throws(() =>
    standaloneTextClipSchema.parse({
      ...clip,
      props: { ...clip.props, x: 101 },
    }),
  );
  assert.throws(() =>
    standaloneTextClipSchema.parse({
      ...clip,
      props: { ...clip.props, color: "red" },
    }),
  );
  assert.throws(() =>
    standaloneTextClipSchema.parse({
      ...clip,
      content: { text: 3 },
    }),
  );
});

test("legacy Timeline v1 remains valid and standalone text renders its saved props", () => {
  const timeline = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 90,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [clip],
  });
  assert.equal(timeline.version, 1);
  const markup = renderToStaticMarkup(
    React.createElement(standaloneTextModule.component, {
      clip: timeline.clips[0],
    }),
  );
  assert.match(markup, /AI and human use one document/);
  assert.match(markup, /left:68%/);
  assert.match(markup, /top:24%/);
  assert.match(markup, /font-size:84px/);
  assert.match(markup, /color:#00ff00/);
  assert.match(markup, /text-align:right/);
});
