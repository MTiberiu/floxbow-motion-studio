import assert from "node:assert/strict";
import test from "node:test";
import { createTimelineRulerMarks } from "../apps/desktop/src/timeline-ruler";

test("Timeline ruler labels every 10 seconds and adds subtle 5-second marks", () => {
  const marks = createTimelineRulerMarks(20 * 30, 30, 1000);
  assert.deepEqual(
    marks.map((mark) => ({
      frame: mark.frame,
      major: mark.major,
      label: mark.label,
    })),
    [
      { frame: 0, major: true, label: "0:00" },
      { frame: 150, major: false, label: undefined },
      { frame: 300, major: true, label: "0:10" },
      { frame: 450, major: false, label: undefined },
      { frame: 600, major: true, label: "0:20" },
    ],
  );
});

test("Timeline ruler widens labels to readable intervals for long projects", () => {
  const marks = createTimelineRulerMarks(10 * 60 * 30, 30, 1200);
  assert.deepEqual(
    marks.filter((mark) => mark.major).map((mark) => mark.label),
    [
      "0:00",
      "1:00",
      "2:00",
      "3:00",
      "4:00",
      "5:00",
      "6:00",
      "7:00",
      "8:00",
      "9:00",
      "10:00",
    ],
  );
  assert.equal(marks.filter((mark) => !mark.major).length, 10);
});

test("Timeline ruler returns no marks for invalid dimensions", () => {
  assert.deepEqual(createTimelineRulerMarks(0, 30, 1000), []);
  assert.deepEqual(createTimelineRulerMarks(300, 30, 0), []);
});
