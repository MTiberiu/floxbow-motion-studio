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
    [
      "text",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "anchor",
      "fontSize",
      "fontFamily",
      "fontWeight",
      "italic",
      "color",
      "alignment",
      "opacity",
      "lineSpacing",
      "fadeInFrames",
      "fadeOutFrames",
      "slideInFrames",
      "slideOutFrames",
      "scaleInFrames",
      "scaleOutFrames",
      "slideDirection",
    ],
  );
  const parsedExistingClip = standaloneTextClipSchema.parse(clip);
  assert.equal(parsedExistingClip.content.text, clip.content.text);
  assert.equal(parsedExistingClip.props.x, 68);
  assert.equal(parsedExistingClip.props.fontFamily, "Arial");
  assert.equal(parsedExistingClip.props.fontWeight, "400");
  assert.equal(parsedExistingClip.props.width, 80);
  assert.equal(parsedExistingClip.props.rotation, 0);
  assert.deepEqual(
    standaloneTextClipSchema.parse({
      ...clip,
      props: {},
    }).props,
    {
      x: 50,
      y: 50,
      width: 80,
      height: 20,
      rotation: 0,
      anchor: "center",
      fontSize: 72,
      fontFamily: "Arial",
      fontWeight: "400",
      italic: false,
      color: "#ffffff",
      alignment: "center",
      opacity: 1,
      lineSpacing: 1.15,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      slideInFrames: 0,
      slideOutFrames: 0,
      scaleInFrames: 0,
      scaleOutFrames: 0,
      slideDirection: "up",
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
  assert.throws(() =>
    standaloneTextClipSchema.parse({
      ...clip,
      props: { ...clip.props, fontFamily: "url(javascript:alert(1))" },
    }),
  );
  assert.throws(() =>
    standaloneTextClipSchema.parse({
      ...clip,
      props: { ...clip.props, opacity: 1.1 },
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
  assert.match(markup, /font-family:Arial/);
  assert.match(markup, /color:#00ff00/);
  assert.match(markup, /text-align:right/);
  assert.match(markup, /width:80%/);
  assert.match(markup, /height:20%/);
  assert.match(markup, /transform:translate\(-50%, -50%\) rotate\(0deg\)/);
});

test("standalone Text animations render deterministically from clip-local frames", () => {
  const animated = standaloneTextClipSchema.parse({
    ...clip,
    props: {
      ...clip.props,
      fadeInFrames: 10,
      slideInFrames: 10,
      scaleInFrames: 10,
    },
  });
  const animatedTimeline = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 90,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [animated],
  });
  const markup = renderToStaticMarkup(
    React.createElement(standaloneTextModule.component, {
      clip: animatedTimeline.clips[0],
      frame: 2,
    }),
  );
  assert.match(markup, /opacity:0\.2/);
  assert.match(markup, /scale\(0\.6\)/);
  assert.match(markup, /translate\(0px, 38\.4px\)/);
});
