import { standaloneImageClipSchema } from "@motion/sdk/editor";
import { parseEditTimeline, type EditTimeline, type TimelineClip, type TimelineScene, type TimelineTrack } from "@motion/sdk/timeline";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { Representation, Storyboard, StoryScene, StorySet } from "@motion/project-loader/storyboard";

type ReferenceAsset = {
  assetId: string;
  name: string;
  width?: number;
  height?: number;
};

/**
 * Adapts one storyboard image layer to the Video Editor's existing Remotion
 * Image clip contract. Storyboard placement uses a top-left origin; the Image
 * clip uses a center anchor, so the adapter performs that conversion once.
 */
export function storyboardLayerToImageClip(input: {
  layer: Representation;
  set: StorySet;
  reference: ReferenceAsset;
  clipId: string;
  trackId: string;
  from: number;
  durationInFrames: number;
  sceneId?: string;
  timelineSceneId?: string;
}): TimelineClip {
  const { layer, set, reference } = input;
  const fit = layer.imageFit === "stretch" ? "fill" : layer.imageFit ?? "contain";
  return standaloneImageClipSchema.parse({
    id: input.clipId,
    trackId: input.trackId,
    ...(input.timelineSceneId ?? input.sceneId ? { sceneId: input.timelineSceneId ?? input.sceneId } : {}),
    componentId: "image",
    label: layer.layerName || reference.name || set.name,
    from: input.from,
    durationInFrames: input.durationInFrames,
    content: {
      assetId: reference.assetId,
      ...(reference.width && reference.height
        ? {
            aspectRatio: reference.width / reference.height,
            originalSize: { width: reference.width, height: reference.height },
          }
        : {}),
      storyboard: {
        owner: "director-plan",
        sceneId: input.sceneId ?? null,
        setId: set.id,
        representationId: layer.id,
        objectId: layer.objectId,
        zOrder: layer.zOrder,
      },
    },
    props: {
      x: layer.x + layer.width / 2,
      y: layer.y + layer.height / 2,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
      anchor: "center",
      opacity: layer.opacity,
      fit,
      flipHorizontal: false,
    },
  }) as unknown as TimelineClip;
}

export type StoryboardPublishScope =
  | { kind: "shot"; sceneId: string; setId: string }
  | { kind: "scene"; sceneId: string }
  | { kind: "film" };

export type StoryboardPublishResult = {
  timeline: EditTimeline;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  conflicts: string[];
  unsupported: string[];
};

export type SavedTimelineSnapshot = Pick<EditTimeline, "fps" | "scenes" | "clips">;

export type StoryboardSyncResult = {
  document: Storyboard;
  updatedShots: number;
  updatedLayers: number;
  issues: string[];
};

/**
 * Pulls saved Timeline timing and Image transforms back into their linked
 * Director layers. Director notes, references, annotations and Animator-owned
 * clips are intentionally left untouched.
 */
export function syncStoryboardFromTimeline(
  storyboard: Storyboard,
  timeline: SavedTimelineSnapshot,
): StoryboardSyncResult {
  const document = structuredClone(storyboard);
  const linked = timeline.clips.flatMap((clip) => {
    const metadata = (clip.content as Record<string, unknown>).storyboard as
      | Record<string, unknown>
      | undefined;
    if (metadata?.owner !== "director-plan") return [];
    return [{ clip, metadata }];
  });
  const issues: string[] = [];
  let updatedShots = 0;
  let updatedLayers = 0;

  for (const scene of document.scenes) {
    const timelineSceneId = scene.timelineSceneId ?? scene.id;
    const timelineScene = timeline.scenes?.find((item) => item.id === timelineSceneId);
    if (timelineScene) scene.duration = timelineScene.durationInFrames / timeline.fps;

    for (const shot of scene.sets) {
      const shotClips = linked.filter(({ metadata }) =>
        metadata.sceneId === scene.id && metadata.setId === shot.id,
      );
      if (!shotClips.length) continue;

      const frames = new Set(shotClips.map(({ clip }) => `${clip.from}:${clip.durationInFrames}`));
      if (frames.size === 1) {
        const first = shotClips[0].clip;
        const start = first.from / timeline.fps;
        const duration = first.durationInFrames / timeline.fps;
        if (shot.start !== start || shot.duration !== duration) updatedShots++;
        shot.start = start;
        shot.duration = duration;
      } else {
        issues.push(`${scene.name} · ${shot.name}: layer clips have different timing; shot timing was left unchanged.`);
      }

      for (const { clip, metadata } of shotClips) {
        const representation = shot.representations.find((item) => item.id === metadata.representationId);
        if (!representation || clip.componentId !== "image") continue;
        const props = clip.props as Record<string, unknown>;
        const width = typeof props.width === "number" ? props.width : representation.width;
        const height = typeof props.height === "number" ? props.height : representation.height;
        const centerX = typeof props.x === "number" ? props.x : representation.x + representation.width / 2;
        const centerY = typeof props.y === "number" ? props.y : representation.y + representation.height / 2;
        const next = {
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          rotation: typeof props.rotation === "number" ? props.rotation : representation.rotation,
          opacity: typeof props.opacity === "number" ? props.opacity : representation.opacity,
          imageFit: props.fit === "fill" ? "stretch" : props.fit === "contain" || props.fit === "cover" ? props.fit : representation.imageFit,
        };
        if (representation.x !== next.x || representation.y !== next.y ||
            representation.width !== next.width || representation.height !== next.height ||
            representation.rotation !== next.rotation || representation.opacity !== next.opacity ||
            representation.imageFit !== next.imageFit) updatedLayers++;
        Object.assign(representation, next);
      }
    }
  }

  return { document, updatedShots, updatedLayers, issues };
}

type StoryboardTimelineMedia = ReferenceAsset;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function storyboardClipId(sceneId: string, setId: string, representationId: string) {
  return `sb-${stableHash(`${sceneId}/${setId}/${representationId}`)}`;
}

function clipFingerprint(clip: TimelineClip) {
  const content = { ...clip.content } as Record<string, unknown>;
  delete content.storyboard;
  return JSON.stringify({
    trackId: clip.trackId,
    sceneId: clip.sceneId ?? null,
    componentId: clip.componentId,
    label: clip.label,
    from: clip.from,
    durationInFrames: clip.durationInFrames,
    content,
    props: clip.props,
  });
}

function layerForReference(set: StorySet, doc: Storyboard): Representation[] {
  const images = set.representations.filter(layer => layer.visible && layer.kind === "reference" && layer.referenceId);
  if (images.length) return images;
  const referenceId = set.referenceImageId
    ?? set.referenceIds.find(id => doc.references.some(reference => reference.id === id && reference.role === "shot-image"))
    ?? null;
  if (!referenceId) return [];
  const reference = doc.references.find(item => item.id === referenceId);
  if (!reference) return [];
  return [{
    id: `key-${set.id}`,
    layerName: reference.name || set.name,
    objectId: null,
    setId: set.id,
    coordinateSpace: "composition-percent",
    anchor: "top-left",
    rotation: 0,
    zOrder: 0,
    spatialNote: "",
    referenceId,
    imageFit: "contain",
    kind: "reference",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    points: [],
    elements: [],
    color: "#ffffff",
    thickness: 1,
    text: "",
    visible: true,
    opacity: 1,
    locked: true,
    pose: "",
    instructions: "",
    motion: "",
  } as Representation];
}

/** Return the saved PNG references that will become editable Timeline image clips. */
export function storyboardReferenceIdsForScope(storyboard: Storyboard, scope: StoryboardPublishScope): string[] {
  const scenes = storyboard.scenes.filter(scene => scope.kind === "film" || scene.id === scope.sceneId);
  if (scope.kind === "shot" && !scenes.some(scene => scene.sets.some(set => set.id === scope.setId)))
    throw new Error("The selected shot no longer exists in the saved Storyboard.");
  return [...new Set(scenes.flatMap(scene => scene.sets
    .filter(set => scope.kind !== "shot" || set.id === scope.setId)
    .flatMap(set => layerForReference(set, storyboard).flatMap(layer => layer.referenceId ? [layer.referenceId] : []))))];
}

function shotTiming(set: StorySet, cursor: number, fps: number) {
  const fromSeconds = set.start ?? cursor / fps;
  const durationSeconds = set.duration ?? 3;
  return {
    from: Math.max(0, Math.round(fromSeconds * fps)),
    durationInFrames: Math.max(1, Math.round(durationSeconds * fps)),
  };
}

function storyboardSceneProjection(doc: Storyboard, manifest: ProjectManifest) {
  const fps = manifest.fps;
  let filmCursor = 0;
  return doc.scenes.map(scene => {
    let cursor = filmCursor;
    const shots = scene.sets.map(set => {
      const timing = shotTiming(set, cursor, fps);
      cursor = Math.max(cursor, timing.from + timing.durationInFrames);
      return { set, ...timing };
    });
    const from = shots.length ? Math.min(...shots.map(shot => shot.from)) : filmCursor;
    const end = shots.length ? Math.max(...shots.map(shot => shot.from + shot.durationInFrames)) : from + Math.max(1, Math.round((scene.duration ?? 3) * fps));
    filmCursor = Math.max(filmCursor, end);
    return { scene, timelineSceneId: scene.timelineSceneId ?? scene.id, shots, from, durationInFrames: Math.max(1, end - from) };
  });
}

function isOwnedStoryboardClip(clip: TimelineClip) {
  return (clip.content as Record<string, unknown>).storyboard
    && typeof (clip.content as Record<string, unknown>).storyboard === "object"
    && ((clip.content as Record<string, unknown>).storyboard as Record<string, unknown>).owner === "director-plan";
}

/**
 * Build a staged Timeline update from approved Storyboard image layers. Only clips
 * previously generated by this adapter are reconciled. Animator-owned clips are
 * left intact, and edited generated clips are reported as conflicts for review.
 */
export function publishStoryboardToTimeline(input: {
  document: EditTimeline;
  storyboard: Storyboard;
  manifest: ProjectManifest;
  media: ReadonlyMap<string, StoryboardTimelineMedia>;
  scope: StoryboardPublishScope;
}): StoryboardPublishResult {
  const { storyboard, manifest, scope } = input;
  const plannedScenes = storyboardSceneProjection(storyboard, manifest);
  const selectedScenes = plannedScenes.filter(item => scope.kind === "film" || item.scene.id === scope.sceneId);
  if (scope.kind === "shot" && !selectedScenes.some(item => item.scene.sets.some(set => set.id === scope.setId)))
    throw new Error("The selected shot no longer exists in the saved Storyboard.");
  const targetSetIds = new Set(selectedScenes.flatMap(item => item.scene.sets.filter(set => scope.kind !== "shot" || set.id === scope.setId).map(set => set.id)));
  const targetSceneIds = new Set(selectedScenes.map(item => item.timelineSceneId));
  const neededZOrders = new Set(selectedScenes.flatMap(projected => projected.shots.filter(shot => targetSetIds.has(shot.set.id)).flatMap(shot => layerForReference(shot.set, storyboard).map(layer => layer.zOrder))));
  const newTrackCount = [...neededZOrders].filter(zOrder => !input.document.tracks.some(track => track.id === `sb-z-${zOrder}`)).length;
  if (input.document.tracks.length + newTrackCount > 32) throw new Error("Publishing these layers would exceed the Timeline's 32-track limit. Reduce the number of visual layers first.");
  const tracks: TimelineTrack[] = [...input.document.tracks];
  const backToFrontTrackIds = [...neededZOrders].sort((a, b) => a - b).map(zOrder => `sb-z-${zOrder}`);
  for (const [index, trackId] of backToFrontTrackIds.entries()) {
    if (!tracks.some(track => track.id === trackId)) tracks.unshift({ id: trackId, name: `Storyboard · Layer ${String(index + 1).padStart(2, "0")}`, kind: "visual" });
  }
  const trackIdFor = (zOrder: number) => `sb-z-${zOrder}`;
  const preparedScenes: TimelineScene[] = selectedScenes.filter(item => item.scene.sets.some(set => targetSetIds.has(set.id))).map(item => ({
    id: item.timelineSceneId,
    name: item.scene.name,
    from: item.from,
    durationInFrames: item.durationInFrames,
  }));
  const existingScenes = input.document.scenes ?? [];
  for (const prepared of preparedScenes) {
    const existing = existingScenes.find(item => item.id === prepared.id);
    const overlaps = existingScenes.find(item => item.id !== prepared.id && item.from < prepared.from + prepared.durationInFrames && prepared.from < item.from + item.durationInFrames);
    if (overlaps) throw new Error(`Storyboard scene "${prepared.name}" overlaps existing Timeline scene "${overlaps.name}". Resolve the scene timing in the Video Editor before publishing.`);
    if (existing) {
      const nonStoryboardClip = input.document.clips.find(clip => clip.sceneId === existing.id && !isOwnedStoryboardClip(clip) && (clip.from < prepared.from || clip.from + clip.durationInFrames > prepared.from + prepared.durationInFrames));
      if (nonStoryboardClip) throw new Error(`Animator clip ${nonStoryboardClip.id} would fall outside the updated scene range. Review that timing before publishing.`);
    }
  }
  const desired: TimelineClip[] = [];
  const unsupported: string[] = [];
  for (const projection of selectedScenes) {
    for (const { set, from, durationInFrames } of projection.shots) {
      if (!targetSetIds.has(set.id)) continue;
      const layers = layerForReference(set, storyboard);
      if (!layers.length) {
        unsupported.push(`${projection.scene.name} · ${set.name}: no separate image layer or approved reference is available.`);
        continue;
      }
      for (const layer of layers) {
        if (!layer.referenceId) continue;
        const reference = storyboard.references.find(item => item.id === layer.referenceId);
        const media = reference ? input.media.get(reference.id) ?? input.media.get(reference.assetId) : undefined;
        if (!reference || !media) {
          unsupported.push(`${projection.scene.name} · ${set.name} · ${layer.layerName || layer.id}: linked image asset is missing from the project media catalog.`);
          continue;
        }
        const clip = storyboardLayerToImageClip({
          layer,
          set,
          reference: media,
          clipId: storyboardClipId(projection.scene.id, set.id, layer.id),
          trackId: trackIdFor(layer.zOrder),
          from,
          durationInFrames,
          sceneId: projection.scene.id,
          timelineSceneId: projection.timelineSceneId,
        });
        desired.push(clip);
      }
    }
  }
  const existingOwned = input.document.clips.filter(clip => isOwnedStoryboardClip(clip) && targetSetIds.has(String(((clip.content as Record<string, unknown>).storyboard as Record<string, unknown>).setId)));
  const existingById = new Map(existingOwned.map(clip => [clip.id, clip]));
  const desiredIds = new Set(desired.map(clip => clip.id));
  const conflicts: string[] = [];
  let added = 0, updated = 0, removed = 0, skipped = 0;
  const nextOwned: TimelineClip[] = [];
  for (const nextClip of desired) {
    const existing = existingById.get(nextClip.id);
    if (!existing) {
      const nextContent = { ...nextClip.content } as Record<string, unknown>;
      (nextContent.storyboard as Record<string, unknown>).publishedFingerprint = clipFingerprint(nextClip);
      nextOwned.push({ ...nextClip, content: nextContent } as TimelineClip);
      added++;
      continue;
    }
    const metadata = (existing.content as Record<string, unknown>).storyboard as Record<string, unknown>;
    if (typeof metadata.publishedFingerprint !== "string" || metadata.publishedFingerprint !== clipFingerprint(existing)) {
      conflicts.push(`${existing.label}: Animator or user edits differ from the last Storyboard publish; kept the Timeline version.`);
      nextOwned.push(existing);
      skipped++;
      continue;
    }
    const nextContent = { ...nextClip.content } as Record<string, unknown>;
    const nextMetadata = nextContent.storyboard as Record<string, unknown>;
    nextMetadata.publishedFingerprint = clipFingerprint(nextClip);
    const reconciled = { ...nextClip, content: nextContent } as TimelineClip;
    nextOwned.push(reconciled);
    updated++;
  }
  for (const old of existingOwned) {
    if (desiredIds.has(old.id)) continue;
    const metadata = (old.content as Record<string, unknown>).storyboard as Record<string, unknown>;
    if (typeof metadata.publishedFingerprint !== "string" || metadata.publishedFingerprint !== clipFingerprint(old)) {
      conflicts.push(`${old.label}: it was removed from the new Storyboard direction but has Animator or user edits; kept the Timeline version.`);
      nextOwned.push(old);
      skipped++;
    } else removed++;
  }
  const nonTargetScenes = existingScenes.filter(scene => !targetSceneIds.has(scene.id));
  const mergedScenes = [...nonTargetScenes, ...existingScenes.filter(scene => targetSceneIds.has(scene.id) && !preparedScenes.some(next => next.id === scene.id)), ...preparedScenes].sort((a, b) => a.from - b.from);
  const existingOutsideScope = input.document.clips.filter(clip => !isOwnedStoryboardClip(clip) || !targetSetIds.has(String((((clip.content as Record<string, unknown>).storyboard as Record<string, unknown> | undefined)?.setId) ?? "")));
  const unchangedOwned = input.document.clips.filter(clip => isOwnedStoryboardClip(clip) && !targetSetIds.has(String(((clip.content as Record<string, unknown>).storyboard as Record<string, unknown>).setId)));
  const clips = [...existingOutsideScope, ...unchangedOwned.filter(clip => !existingOutsideScope.some(item => item.id === clip.id)), ...nextOwned];
  const end = Math.max(input.document.durationInFrames, ...preparedScenes.map(scene => scene.from + scene.durationInFrames), ...clips.map(clip => clip.from + clip.durationInFrames));
  const timeline = parseEditTimeline({ ...input.document, trackOrder: "top-down", tracks, scenes: mergedScenes, durationInFrames: end, clips });
  return { timeline, added, updated, removed, skipped, conflicts, unsupported };
}
