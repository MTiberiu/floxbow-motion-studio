/** Mirror media pixels around the center of their existing composition bounds. */
export function mediaOrientationStyle(flipHorizontal: boolean) {
  return {
    transform: flipHorizontal ? "scaleX(-1)" : undefined,
    transformOrigin: "center",
  } as const;
}
