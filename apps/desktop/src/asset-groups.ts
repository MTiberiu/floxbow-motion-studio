import {
  parseEditTimeline,
  type EditTimeline,
  type VisualAssetGroup,
} from "@motion/sdk/timeline";

export function addVisualAssetGroup(
  document: EditTimeline,
  group: VisualAssetGroup,
): EditTimeline {
  if ((document.assetGroups?.length ?? 0) >= 200)
    throw new Error("A project can contain at most 200 visual asset groups.");
  if (document.assetGroups?.some((item) => item.id === group.id))
    throw new Error("Asset group ID already exists.");
  return parseEditTimeline({
    ...document,
    assetGroups: [...(document.assetGroups ?? []), group],
  });
}

export function updateVisualAssetGroup(
  document: EditTimeline,
  groupId: string,
  update: (group: VisualAssetGroup) => VisualAssetGroup,
): EditTimeline {
  if (!document.assetGroups?.some((group) => group.id === groupId))
    throw new Error("Asset group no longer exists.");
  return parseEditTimeline({
    ...document,
    assetGroups: document.assetGroups.map((group) =>
      group.id === groupId ? update(structuredClone(group)) : group,
    ),
  });
}

export function removeVisualAssetGroup(
  document: EditTimeline,
  groupId: string,
): EditTimeline {
  return parseEditTimeline({
    ...document,
    assetGroups: (document.assetGroups ?? []).filter(
      (group) => group.id !== groupId,
    ),
  });
}
