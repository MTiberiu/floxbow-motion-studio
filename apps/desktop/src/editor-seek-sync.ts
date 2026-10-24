/** Ignore stale paused preview frames until the latest requested seek is acknowledged. */
export function shouldIgnoreEditorPreviewFrame(
  reportedFrame: number,
  pendingSeekFrame: number | null,
  playing: boolean,
) {
  return (
    pendingSeekFrame !== null &&
    reportedFrame !== pendingSeekFrame &&
    !playing
  );
}
