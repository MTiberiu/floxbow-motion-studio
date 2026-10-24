/** A same-frame seek needs no frame-update acknowledgment. */
export function pendingSeekTarget(
  currentFrame: number,
  requestedFrame: number,
) {
  return currentFrame === requestedFrame ? null : requestedFrame;
}
