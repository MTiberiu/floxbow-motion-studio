# Timeline multi-monitor acceptance checklist

Automated tests cover window registration, lifecycle recovery, IPC ordering and
the editor's single-session behavior. Run this checklist on a machine with two
connected displays before claiming physical multi-monitor support is verified.

- Open an editable project, detach Timeline, move it to the secondary display,
  and resize it. Confirm Canvas/Preview and Inspector remain usable in the
  primary window and only one interactive Timeline is visible.
- Maximize and restore the detached window. Enter and exit native fullscreen,
  then confirm Attach and Timeline editing still work.
- While detached, play for at least 30 seconds and seek repeatedly from both
  windows. Confirm the playhead follows playback, Canvas reflects seeks, and
  edits, selection, Undo and Redo remain synchronized.
- Close the detached window and confirm Timeline returns to the main editor
  with its selection, playhead and unsaved edits intact. Repeat detach/attach
  several times.
- Move Timeline to the secondary display, unplug that display, and confirm the
  main editor's Attach action can recover the Timeline. Reconnect the display
  and verify a new detached window can be opened and moved there.
- With Timeline detached, switch projects and confirm the old window closes;
  shut down the app and confirm no child window is left behind.

Physical two-monitor behavior remains unverified until a person completes and
records this checklist on the target hardware. Window placement after display
removal may depend on operating-system display recovery behavior.
