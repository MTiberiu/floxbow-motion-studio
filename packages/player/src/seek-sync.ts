/** A same-frame seek needs no frame-update acknowledgment. */
export function pendingSeekTarget(
  currentFrame: number,
  requestedFrame: number,
) {
  return currentFrame === requestedFrame ? null : requestedFrame;
}

/** Ignore preview reports until Remotion acknowledges the requested seek. */
export function shouldIgnorePendingSeekFrame(
  currentFrame: number,
  pendingFrame: number | null,
) {
  return pendingFrame !== null && currentFrame !== pendingFrame;
}
