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

/** Restart from zero when playback is requested at or beyond its active end. */
export function shouldRestartPlaybackAtBoundary(
  currentFrame: number,
  activeEndFrame: number,
  endedAtBoundary: boolean,
) {
  return endedAtBoundary || currentFrame + 1 >= activeEndFrame;
}
