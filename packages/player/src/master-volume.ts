/** Validate the local editor-to-preview master-volume message. */
export function isValidMasterVolume(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
