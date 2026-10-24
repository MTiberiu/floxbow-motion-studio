export const MEDIA_ASSET_DRAG_TYPE = "application/x-floxbow-media-asset+json";

export type MediaAssetDragData = Readonly<{
  projectId: string;
  assetId: string;
  type: "audio" | "image" | "video";
  displayName: string;
  aspectRatio?: number;
}>;

export function parseMediaAssetDragData(
  value: string,
): MediaAssetDragData | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return undefined;
    const candidate = parsed as Record<string, unknown>;
    if (
      Object.keys(candidate).some(
        (key) =>
          key !== "projectId" &&
          key !== "assetId" &&
          key !== "type" &&
          key !== "displayName" &&
          key !== "aspectRatio",
      ) ||
      typeof candidate.projectId !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.projectId) ||
      typeof candidate.assetId !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.assetId) ||
      (candidate.type !== "audio" &&
        candidate.type !== "image" &&
        candidate.type !== "video") ||
      typeof candidate.displayName !== "string" ||
      candidate.displayName.length > 200 ||
      (candidate.aspectRatio !== undefined &&
        (typeof candidate.aspectRatio !== "number" ||
          !Number.isFinite(candidate.aspectRatio) ||
          candidate.aspectRatio < 0.01 ||
          candidate.aspectRatio > 100))
    )
      return undefined;
    return {
      projectId: candidate.projectId,
      assetId: candidate.assetId,
      type: candidate.type,
      displayName: candidate.displayName,
      ...(typeof candidate.aspectRatio === "number"
        ? { aspectRatio: candidate.aspectRatio }
        : {}),
    };
  } catch {
    return undefined;
  }
}
