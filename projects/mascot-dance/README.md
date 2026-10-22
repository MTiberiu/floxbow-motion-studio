# Mascot Dance Playground

A 12-second editable, SVG-only 2.5D character demonstration. Open **Mascot Dance Playground** in the desktop editor. Select **Bloop dances** on the Characters track; set Movement to idle, walk, jump or dance, change color, X/Y, size and speed. Drag or trim the character clip with the existing timeline UI. The linked subtitle demo is deliberately synthetic, NOT synchronized to a recording.

The mascot's `speechClipId: "hello"` refers to the real subtitle clip. Moving or trimming the subtitle changes the bubble and speaking window on the very next preview frame. Remove or change that ID to disable speech. Speech is approximate comic mouth motion, not phoneme lip sync; no audio connection is claimed.

No 3D assets, external fonts, WebGL, downloads or runtime network requests.

## AI choreography experiment
The saved baseline is deliberately **one dancing mascot clip** plus the synthetic subtitle clip. No prebuilt walk/jump/spin/wave sequence is stored in the project. An external coding agent should create or replace clips in this project's edit-timeline.json, using the documented @motion/characters API and without changing shared module code. To test the AI, instruct it to replace the baseline dance with a choreography; the resulting clips should appear on the existing timeline after reload.

## Routed subtitle API test (after syncing dev)
The mascot baseline is still one dance clip. Its instance consumer ID is `bloop`; the `hello` subtitle is `presentation: both` and `consumerIds: ["bloop"]`, so it should render both the ordinary bottom caption and Bloop's bubble/mouth. A separate `video-intro` subtitle at frames 190–259 has `presentation: caption` and `consumerIds: []`: it should render at the bottom but **not** be spoken by Bloop. Both are editorial demo timings, not speech-to-audio alignment. Character integration uses the public `getSubtitleCues`/`selectSubtitleCues` API. This is data routing, not a context-menu UI: manual consumer assignment in the editor is not implemented yet. Legacy `speechClipId` is still supported when `consumerId` is empty.
