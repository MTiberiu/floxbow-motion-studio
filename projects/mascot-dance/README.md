# Mascot Dance Playground

A 12-second editable, SVG-only 2.5D character demonstration. Open **Mascot Dance Playground** in the desktop editor. Select **Bloop dances** on the Characters track; set Movement to idle, walk, jump or dance, change color, X/Y, size and speed. Drag or trim the character clip with the existing timeline UI. The linked subtitle demo is deliberately synthetic, NOT synchronized to a recording.

The mascot's `speechClipId: "hello"` refers to the real subtitle clip. Moving or trimming the subtitle changes the bubble and speaking window on the very next preview frame. Remove or change that ID to disable speech. Speech is approximate comic mouth motion, not phoneme lip sync; no audio connection is claimed.

No 3D assets, external fonts, WebGL, downloads or runtime network requests.

## Choreography v2
The timeline now includes six editable motion clips in order: Walk → Jump → Spin → Dance → Wave → Dance. Each clip has independently editable motion and speed; select any character clip in the editor Inspector. The linked `hello` subtitle triggers comic speech on whichever character motion is playing. No audio playback or prompt-to-chat UI is added.
