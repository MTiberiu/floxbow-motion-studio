import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  changeClipRangeWithDurationExtension,
  createAudioTimelineTrack,
  createVisualTimelineTrack,
  isAudioTrack,
  isAudioTimelineClip,
  MAX_TIMELINE_DURATION_FRAMES,
  moveSoundtrackToAudioTrack,
  moveTimelineClipsToTrack,
  reorderTimelineTrack,
} from "./timeline-track-utils";
import { createTimelineRulerMarks } from "./timeline-ruler";
import type {
  ComponentInfo,
  EditTimeline,
  TimelineClip,
} from "@motion/sdk/timeline";
import {
  formatFrameTime,
  frameToSeconds,
  secondsToFrame,
} from "@motion/sdk/timeline";
import {
  MEDIA_ASSET_DRAG_TYPE,
  parseMediaAssetDragData,
  type MediaAssetDragData,
} from "./media-drag";

type Drag = {
  clip: TimelineClip;
  sourceClipId: string;
  mode: "move" | "left" | "right";
  x: number;
  y: number;
  pixels: number;
  scrollLeft: number;
  displayDurationInFrames: number;
  lastX: number;
  lastY: number;
  gestureId: string;
  active: boolean;
  trackOnly?: boolean;
  dropTrackId?: string;
  duplicateId?: string;
  groupClipIds?: readonly string[];
};
type TimelineMarquee = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  additive: boolean;
  active: boolean;
};
type TrackDropPreview = {
  x: number;
  y: number;
  label: string;
  trackId?: string;
  newTrackPosition?: "top" | "bottom";
};

const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8] as const;
type ZoomAnchor = { fraction: number; width: number; scrollLeft: number };

export function timelineCanvasWidthForZoom(
  viewportWidth: number,
  zoom: number,
) {
  const width = Math.max(0, Math.ceil(viewportWidth));
  const scale = Math.max(1, Math.min(8, zoom));
  return Math.max(width, Math.ceil(120 + Math.max(0, width - 120) * scale));
}

export type TimelineViewProps = {
  manifest: Pick<ProjectManifest, "id" | "fps" | "durationInFrames"> & {
    editTimeline?: string;
  };
  document?: EditTimeline;
  components: readonly ComponentInfo[];
  selectedClipIds: readonly string[];
  selectedClipId?: string;
  frame: number;
  playing?: boolean;
  onEdit: (
    next: EditTimeline | ((current: EditTimeline) => EditTimeline),
    checkpoint?: boolean,
  ) => void;
  onSelectClip: (clipId: string, additive?: boolean) => void;
  onSelectClips: (clipIds: readonly string[]) => void;
  onSeek: (frame: number) => void;
  onPause: () => void;
  onPlay?: () => void;
  onBeginClipGesture: (
    gestureId: string,
    clipId: string,
    duplicateId?: string,
    groupMove?: boolean,
  ) => void;
  onTimelineOperation?: (
    operation:
      "copy" | "cut" | "paste" | "duplicate" | "delete" | "undo" | "redo",
  ) => void;
  keyboardShortcutsEnabled?: boolean;
  onUpdateClipGesture: (
    gestureId: string,
    clipId: string,
    from: number,
    durationInFrames: number,
    trim: boolean,
  ) => void;
  onEndClipGesture: (gestureId: string) => void | Promise<void>;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: () => void;
  onAddSubtitle: () => void;
  onImportFile: (file: File | undefined) => void;
  onExportTiming: (format: "json" | "srt" | "lrc") => void;
  onExportDocument: () => void;
  onDropMedia?: (
    data: MediaAssetDragData,
    target: { frame: number; trackId: string },
  ) => void;
};

export function TimelineView({
  manifest,
  document,
  components,
  selectedClipIds,
  selectedClipId = selectedClipIds[0] ?? "",
  frame,
  playing = false,
  onEdit,
  onSelectClip,
  onSelectClips,
  onSeek,
  onPause,
  onPlay,
  onBeginClipGesture,
  onTimelineOperation,
  keyboardShortcutsEnabled = true,
  onUpdateClipGesture,
  onEndClipGesture,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onAddSubtitle,
  onImportFile,
  onExportTiming,
  onExportDocument,
  onDropMedia,
}: TimelineViewProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const zoomRef = useRef(1);
  const zoomAnchor = useRef<ZoomAnchor | undefined>(undefined);
  const wheelDelta = useRef(0);
  const onUpdateClipGestureRef = useRef(onUpdateClipGesture);
  onUpdateClipGestureRef.current = onUpdateClipGesture;
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [dragging, setDragging] = useState(false);
  const [trackDropPreview, setTrackDropPreview] = useState<TrackDropPreview>();
  const [marquee, setMarquee] = useState<TimelineMarquee>();
  const operationRef = useRef(onTimelineOperation);
  operationRef.current = onTimelineOperation;

  useEffect(() => {
    if (!keyboardShortcutsEnabled || !onTimelineOperation) return;
    const isTextEntry = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        ),
      );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextEntry(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      let operation: Parameters<typeof onTimelineOperation>[0] | undefined;
      if (modifier && event.key.toLowerCase() === "c") operation = "copy";
      else if (modifier && event.key.toLowerCase() === "x") operation = "cut";
      else if (modifier && event.key.toLowerCase() === "v") operation = "paste";
      else if (modifier && event.key.toLowerCase() === "d")
        operation = "duplicate";
      else if (modifier && event.key.toLowerCase() === "z")
        operation = event.shiftKey ? "redo" : "undo";
      else if (modifier && event.key.toLowerCase() === "y") operation = "redo";
      else if (
        !modifier &&
        (event.key === "Delete" || event.key === "Backspace")
      )
        operation = "delete";
      if (!operation) return;
      event.preventDefault();
      operationRef.current?.(operation);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardShortcutsEnabled, Boolean(onTimelineOperation)]);
  const displayDurationInFrames = Math.min(
    MAX_TIMELINE_DURATION_FRAMES,
    Math.max(
      (document?.durationInFrames ?? manifest.durationInFrames) +
        manifest.fps * 2,
      Math.ceil(
        (document?.durationInFrames ?? manifest.durationInFrames) * 1.1,
      ),
    ),
  );
  const zoomBaseWidth = Math.max(
    viewportWidth,
    scroll.current?.clientWidth ?? 0,
  );
  const canvasWidth = timelineCanvasWidthForZoom(zoomBaseWidth, zoom);
  const hasDocument = Boolean(document);
  const rulerMarks = createTimelineRulerMarks(
    displayDurationInFrames,
    document?.fps ?? manifest.fps,
    canvasWidth,
  );

  function allowMediaDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(MEDIA_ASSET_DRAG_TYPE)) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".track-lane")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function dropMedia(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(MEDIA_ASSET_DRAG_TYPE)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const lane = target.closest<HTMLElement>(".track-lane");
    if (!lane) return;
    event.preventDefault();
    const data = parseMediaAssetDragData(
      event.dataTransfer.getData(MEDIA_ASSET_DRAG_TYPE),
    );
    const rect = lane.getBoundingClientRect();
    const trackId = lane.dataset.track;
    if (!data || !rect.width || !trackId || !onDropMedia) return;
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const targetFrame = Math.min(
      MAX_TIMELINE_DURATION_FRAMES - 1,
      Math.max(0, Math.floor(fraction * displayDurationInFrames)),
    );
    onDropMedia(data, { frame: targetFrame, trackId });
  }

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [hasDocument]);

  function changeZoom(nextZoom: number, clientX?: number) {
    const currentZoom = zoomRef.current;
    const nextIndex = ZOOM_STEPS.indexOf(
      nextZoom as (typeof ZOOM_STEPS)[number],
    );
    if (nextIndex < 0 || nextZoom === currentZoom) return;
    const rulerElement = ruler.current;
    const scrollElement = scroll.current;
    if (rulerElement && scrollElement) {
      const rect = rulerElement.getBoundingClientRect();
      const viewport = scrollElement.getBoundingClientRect();
      const requestedX = clientX ?? viewport.left + viewport.width / 2;
      const anchorX = Math.max(
        Math.max(rect.left, viewport.left),
        Math.min(Math.min(rect.right, viewport.right), requestedX),
      );
      zoomAnchor.current = {
        fraction: rect.width ? (anchorX - rect.left) / rect.width : 0,
        width: rect.width,
        scrollLeft: scrollElement.scrollLeft,
      };
    }
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const scrollElement = scroll.current;
    const rulerElement = ruler.current;
    if (!anchor || !scrollElement || !rulerElement) return;
    const width = rulerElement.getBoundingClientRect().width;
    scrollElement.scrollLeft =
      anchor.scrollLeft + anchor.fraction * (width - anchor.width);
    zoomAnchor.current = undefined;
  }, [zoom, viewportWidth]);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      wheelDelta.current += event.deltaY;
      if (Math.abs(wheelDelta.current) < 60) return;
      const direction = wheelDelta.current < 0 ? 1 : -1;
      wheelDelta.current = 0;
      const index = ZOOM_STEPS.indexOf(
        zoomRef.current as (typeof ZOOM_STEPS)[number],
      );
      const nextIndex = Math.max(
        0,
        Math.min(ZOOM_STEPS.length - 1, index + direction),
      );
      changeZoom(ZOOM_STEPS[nextIndex], event.clientX);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [hasDocument]);

  function begin(event: PointerEvent, clip: TimelineClip, mode: Drag["mode"]) {
    if (!document || !ruler.current) return;
    event.stopPropagation();
    const wasSelected = selectedClipIds.includes(clip.id);
    const duplicate =
      clip.componentId !== "soundtrack" &&
      mode === "move" &&
      (event.ctrlKey || event.metaKey || event.altKey);
    if (!wasSelected || duplicate)
      onSelectClip(
        clip.id,
        !duplicate && (event.shiftKey || event.ctrlKey || event.metaKey),
      );
    const additiveSelection =
      !duplicate && (event.shiftKey || event.ctrlKey || event.metaKey);
    const groupClipIds =
      mode === "move" &&
      clip.componentId !== "soundtrack" &&
      !duplicate &&
      (wasSelected || additiveSelection)
        ? [...new Set([...selectedClipIds, clip.id])]
        : [clip.id];
    const gestureId = crypto.randomUUID();
    drag.current = {
      clip: structuredClone(clip),
      sourceClipId: clip.id,
      mode,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pixels: ruler.current.getBoundingClientRect().width,
      scrollLeft: scroll.current?.scrollLeft ?? 0,
      displayDurationInFrames,
      gestureId,
      active: false,
      trackOnly: clip.componentId === "soundtrack",
      groupClipIds,
      duplicateId: duplicate ? `clip-${crypto.randomUUID()}` : undefined,
    };
    setDragging(true);
  }

  function updateDrag(clientX: number, clientY = drag.current?.lastY ?? 0) {
    const current = drag.current;
    if (!current) return;
    current.lastX = clientX;
    current.lastY = clientY;
    const deltaX =
      clientX -
      current.x +
      ((scroll.current?.scrollLeft ?? current.scrollLeft) - current.scrollLeft);
    if (!current.active && Math.hypot(deltaX, clientY - current.y) < 4) return;
    if (!current.active) {
      current.active = true;
      onPause();
      if (current.duplicateId) {
        const source = current.clip;
        current.clip = {
          ...source,
          id: current.duplicateId,
          label: `${source.label} (copy)`,
        };
      }
      if (!current.trackOnly)
        onBeginClipGesture(
          current.gestureId,
          current.sourceClipId,
          current.duplicateId,
          !current.duplicateId && (current.groupClipIds?.length ?? 0) > 1,
        );
      setDragging(true);
    }
    if (current.mode === "move" && document) {
      const movingIds = current.duplicateId
        ? [current.duplicateId]
        : (current.groupClipIds ?? [current.sourceClipId]);
      const hit = window.document.elementFromPoint(clientX, clientY);
      const row =
        hit?.closest<HTMLElement>(".track-row") ??
        Array.from(
          scroll.current?.querySelectorAll<HTMLElement>(".track-row") ?? [],
        ).find((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          return clientY >= bounds.top && clientY <= bounds.bottom;
        });
      const insertZone = hit?.closest<HTMLElement>(".track-insert-zone");
      const lane =
        hit?.closest<HTMLElement>(".track-lane") ??
        row?.querySelector<HTMLElement>(".track-lane");
      const trackId = lane?.dataset.track;
      const newTrackPosition = current.trackOnly
        ? undefined
        : insertZone?.dataset.trackInsert === "top"
          ? "top"
          : insertZone?.dataset.trackInsert === "bottom"
            ? "bottom"
            : undefined;
      const target = document.tracks.find((track) => track.id === trackId);
      const movingClips = movingIds.map((id) =>
        id === current.duplicateId
          ? current.clip
          : document.clips.find((clip) => clip.id === id),
      );
      const validTarget = Boolean(
        target &&
        !target.locked &&
        movingClips.every((clip) => {
          if (!clip) return false;
          const source = document.tracks.find(
            (track) => track.id === clip.trackId,
          );
          const audioClip = isAudioTimelineClip(clip);
          return Boolean(
            source &&
            isAudioTrack(document, source) === isAudioTrack(document, target) &&
            !source.locked &&
            audioClip === isAudioTrack(document, target),
          );
        }),
      );
      current.dropTrackId = validTarget ? trackId : undefined;
      setTrackDropPreview({
        x: clientX,
        y: clientY,
        label: current.clip.label,
        trackId: validTarget ? trackId : undefined,
        newTrackPosition,
      });
    }
    if (current.trackOnly) return;
    const scrollDelta =
      (scroll.current?.scrollLeft ?? current.scrollLeft) - current.scrollLeft;
    const delta = Math.round(
      ((clientX - current.x + scrollDelta) / current.pixels) *
        current.displayDurationInFrames,
    );
    let start = current.clip.from;
    let end = start + current.clip.durationInFrames;
    if (current.mode === "move") {
      const selected = new Set(current.groupClipIds ?? [current.clip.id]);
      const grouped = (document?.clips ?? []).filter((clip) =>
        selected.has(clip.id),
      );
      const movementGroup = grouped.length ? grouped : [current.clip];
      const earliest = Math.min(...movementGroup.map((clip) => clip.from));
      const latest = Math.max(
        ...movementGroup.map((clip) => clip.from + clip.durationInFrames),
      );
      const safeDelta = Math.max(
        -earliest,
        Math.min(MAX_TIMELINE_DURATION_FRAMES - latest, delta),
      );
      start = current.clip.from + safeDelta;
      end = start + current.clip.durationInFrames;
    } else if (current.mode === "left") {
      start = Math.max(0, Math.min(end - 1, start + delta));
    } else {
      end = Math.max(
        start + 1,
        Math.min(MAX_TIMELINE_DURATION_FRAMES, end + delta),
      );
    }
    onUpdateClipGestureRef.current(
      current.gestureId,
      current.clip.id,
      start,
      end - start,
      current.mode !== "move",
    );
  }

  function scrollTowardPointer(clientX: number) {
    const element = scroll.current;
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const edge = Math.min(48, rect.width / 4);
    let amount = 0;
    if (clientX > rect.right - edge)
      amount = Math.ceil((16 * (clientX - (rect.right - edge))) / edge);
    else if (clientX < rect.left + edge)
      amount = -Math.ceil((16 * (rect.left + edge - clientX)) / edge);
    if (!amount) return false;
    const before = element.scrollLeft;
    element.scrollLeft = Math.max(
      0,
      Math.min(element.scrollWidth - element.clientWidth, before + amount),
    );
    return element.scrollLeft !== before;
  }

  const dragCallbacks = useRef({ updateDrag, finish, scrollTowardPointer });
  dragCallbacks.current = { updateDrag, finish, scrollTowardPointer };

  useLayoutEffect(() => {
    let frameId = 0;
    const handleMouseMove = (event: MouseEvent) => {
      if (!drag.current) return;
      if (drag.current.active)
        dragCallbacks.current.scrollTowardPointer(event.clientX);
      dragCallbacks.current.updateDrag(event.clientX, event.clientY);
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (drag.current) {
        drag.current.lastX = event.clientX;
        drag.current.lastY = event.clientY;
      }
      dragCallbacks.current.finish();
    };
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    const tick = () => {
      const current = drag.current;
      if (
        current?.active &&
        dragCallbacks.current.scrollTowardPointer(current.lastX)
      )
        dragCallbacks.current.updateDrag(current.lastX, current.lastY);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, []);

  function finish() {
    const current = drag.current;
    if (current?.active && current.trackOnly && scroll.current && document) {
      const hit = window.document.elementFromPoint(
        current.lastX,
        current.lastY,
      );
      const row =
        hit?.closest<HTMLElement>(".track-row") ??
        Array.from(scroll.current.querySelectorAll<HTMLElement>(".track-row"))
          .find((candidate) => {
            const bounds = candidate.getBoundingClientRect();
            return current.lastY >= bounds.top && current.lastY <= bounds.bottom;
          });
      const lane =
        hit?.closest<HTMLElement>(".track-lane") ??
        row?.querySelector<HTMLElement>(".track-lane");
      const targetTrackId = current.dropTrackId ?? lane?.dataset.track;
      const target = document.tracks.find(
        (track) => track.id === targetTrackId,
      );
      const source = document.tracks.find(
        (track) => track.id === current.clip.trackId,
      );
      if (
        target &&
        source &&
        target.id !== source.id &&
        isAudioTrack(document, target) &&
        !target.locked &&
        !source.locked
      ) {
        onEdit((latest) =>
          moveSoundtrackToAudioTrack(latest, current.sourceClipId, target.id),
        );
      }
      drag.current = undefined;
      setDragging(false);
      setTrackDropPreview(undefined);
      return;
    }
    if (
      current?.active &&
      current.mode === "move" &&
      scroll.current &&
      document
    ) {
      const hit = window.document.elementFromPoint(
        current.lastX,
        current.lastY,
      );
      const row =
        hit?.closest<HTMLElement>(".track-row") ??
        Array.from(scroll.current.querySelectorAll<HTMLElement>(".track-row"))
          .find((candidate) => {
            const bounds = candidate.getBoundingClientRect();
            return current.lastY >= bounds.top && current.lastY <= bounds.bottom;
          });
      const lane =
        hit?.closest<HTMLElement>(".track-lane") ??
        row?.querySelector<HTMLElement>(".track-lane");
      let targetTrackId = current.dropTrackId ?? lane?.dataset.track;
      const insertZone = hit?.closest<HTMLElement>(".track-insert-zone");
      let newTrackPosition: "top" | "bottom" | undefined =
        insertZone?.dataset.trackInsert === "top"
          ? "top"
          : insertZone?.dataset.trackInsert === "bottom"
            ? "bottom"
            : undefined;
      if (!targetTrackId) {
        const visualRows = Array.from(
          scroll.current.querySelectorAll<HTMLElement>(
            ".track-row.is-visual-track",
          ),
        );
        const first = visualRows[0]?.getBoundingClientRect();
        const last = visualRows.at(-1)?.getBoundingClientRect();
        if (first && current.lastY < first.top) newTrackPosition = "top";
        else if (last && current.lastY > last.bottom)
          newTrackPosition = "bottom";
      }
      const movingIds = current.duplicateId
        ? [current.duplicateId]
        : (current.groupClipIds ?? [current.sourceClipId]);
      const shouldChangeTrack =
        Boolean(newTrackPosition) ||
        Boolean(
          targetTrackId &&
          movingIds.some(
            (id) =>
              document.clips.find((clip) => clip.id === id)?.trackId !==
              targetTrackId,
          ),
        );
      const commitTrackChange = () => {
        if (!shouldChangeTrack) return;
        onEdit((latest) => {
          let next = latest;
          if (newTrackPosition) {
            const name = `Visual ${latest.tracks.filter((track) => !isAudioTrack(latest, track)).length + 1}`;
            const newTrackId = `visual-${crypto.randomUUID()}`;
            next = createVisualTimelineTrack(
              latest,
              newTrackId,
              name,
              newTrackPosition,
            );
            targetTrackId = newTrackId;
          }
          if (!targetTrackId) return latest;
          const destination = next.tracks.find(
            (track) => track.id === targetTrackId,
          );
          if (!destination || destination.locked) return latest;
          const clips = movingIds
            .map((id) => latest.clips.find((clip) => clip.id === id))
            .filter((clip): clip is TimelineClip => Boolean(clip));
          if (
            !clips.length ||
            clips.some((clip) => clip.trackId === targetTrackId)
          )
            return latest;
          return moveTimelineClipsToTrack(next, movingIds, targetTrackId);
        }, false);
      };
      const ended = onEndClipGesture(current.gestureId);
      if (shouldChangeTrack)
        void Promise.resolve(ended).then(commitTrackChange);
    } else if (current?.active) onEndClipGesture(current.gestureId);
    drag.current = undefined;
    setDragging(false);
    setTrackDropPreview(undefined);
  }

  function scrub(event: PointerEvent<HTMLDivElement>) {
    if (!ruler.current) return;
    const rect = ruler.current.getBoundingClientRect();
    onSeek(
      ((event.clientX - rect.left) / rect.width) * displayDurationInFrames,
    );
  }

  function beginMarquee(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      additive,
      active: false,
    });
  }

  function moveMarquee(event: PointerEvent<HTMLDivElement>) {
    setMarquee((current) => {
      if (!current || current.pointerId !== event.pointerId) return current;
      return {
        ...current,
        x: event.clientX,
        y: event.clientY,
        active:
          current.active ||
          Math.hypot(
            event.clientX - current.startX,
            event.clientY - current.startY,
          ) > 3,
      };
    });
  }

  function finishMarquee(event: PointerEvent<HTMLDivElement>) {
    const current = marquee;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.active) {
      const left = Math.min(current.startX, event.clientX);
      const right = Math.max(current.startX, event.clientX);
      const top = Math.min(current.startY, event.clientY);
      const bottom = Math.max(current.startY, event.clientY);
      const hits = [
        ...(scroll.current?.querySelectorAll<HTMLElement>(
          ".timeline-clip[data-clip-id]",
        ) ?? []),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left <= right &&
            rect.right >= left &&
            rect.top <= bottom &&
            rect.bottom >= top
          );
        })
        .map((element) => element.dataset.clipId)
        .filter((id): id is string => Boolean(id));
      const next = current.additive
        ? [...new Set([...selectedClipIds, ...hits])]
        : hits;
      onSelectClips(next);
    } else if (!current.additive) onSelectClip("");
    setMarquee(undefined);
  }

  return document ? (
    <div
      className="timeline-dock"
      data-editor-view="timeline"
      data-drag-active={dragging || undefined}
    >
      <button
        className="timeline-resize"
        aria-label="Resize timeline height"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />
      <div className="timeline-actions">
        <h3>
          Timeline{" "}
          <small>
            {document.fps} FPS · {document.tracks.length} tracks
          </small>
        </h3>
        <button
          disabled={
            !components.some((component) => component.id === "subtitles")
          }
          onClick={onAddSubtitle}
        >
          Add subtitle
        </button>
        <button
          type="button"
          aria-label={
            playing ? "Pause Timeline playback" : "Play Timeline playback"
          }
          onClick={playing ? onPause : onPlay}
          disabled={!onPlay && !playing}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() =>
            onEdit((current) =>
              createVisualTimelineTrack(
                current,
                `visual-${crypto.randomUUID()}`,
                `Visual ${current.tracks.filter((track) => !isAudioTrack(current, track)).length + 1}`,
              ),
            )
          }
        >
          Add visual track
        </button>
        <div className="timeline-zoom-controls">
          <span>Zoom</span>
          <button
            type="button"
            aria-label="Fit Timeline"
            disabled={zoom === 1}
            onClick={() => changeZoom(1)}
          >
            Fit
          </button>
          <button
            type="button"
            aria-label="Zoom Timeline out"
            disabled={zoom === ZOOM_STEPS[0]}
            onClick={() =>
              changeZoom(
                ZOOM_STEPS[
                  Math.max(
                    0,
                    ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]) - 1,
                  )
                ],
              )
            }
          >
            −
          </button>
          <select
            aria-label="Timeline zoom"
            value={zoom}
            onChange={(event) => changeZoom(+event.target.value)}
          >
            {ZOOM_STEPS.map((step) => (
              <option key={step} value={step}>
                {step === 1 ? "Fit" : `${step}×`}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Zoom Timeline in"
            disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() =>
              changeZoom(
                ZOOM_STEPS[
                  Math.min(
                    ZOOM_STEPS.length - 1,
                    ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]) + 1,
                  )
                ],
              )
            }
          >
            +
          </button>
        </div>
        <label>
          Time (seconds){" "}
          <input
            aria-label="Timeline playhead time (seconds)"
            data-fps={manifest.fps}
            type="number"
            min={0}
            max={frameToSeconds(manifest.durationInFrames - 1, manifest.fps)}
            step={0.001}
            value={frameToSeconds(frame, manifest.fps).toFixed(3)}
            onChange={(event) =>
              onSeek(secondsToFrame(Number(event.target.value), manifest.fps))
            }
          />
        </label>
      </div>
      <div
        className="timeline-scroll"
        ref={scroll}
        onDragOverCapture={allowMediaDrop}
        onDropCapture={dropMedia}
      >
        <div
          className="timeline-canvas"
          data-timeline-zoom={zoom}
          data-timeline-duration-in-frames={displayDurationInFrames}
          data-timeline-viewport-width={zoomBaseWidth}
          style={{
            minWidth: zoomBaseWidth,
            width: `${canvasWidth}px`,
          }}
        >
          <div className="ruler-row">
            <div className="track-label track-header">
              <span>TRACKS</span>
              <div>
                <button
                  type="button"
                  aria-label="Add visual track"
                  title="Add visual track"
                  onClick={() =>
                    onEdit((current) =>
                      createVisualTimelineTrack(
                        current,
                        `visual-${crypto.randomUUID()}`,
                        `Visual ${current.tracks.filter((track) => !isAudioTrack(current, track)).length + 1}`,
                      ),
                    )
                  }
                >
                  + V
                </button>
                <button
                  type="button"
                  aria-label="Add audio track"
                  title="Add audio track"
                  onClick={() =>
                    onEdit((current) =>
                      createAudioTimelineTrack(
                        current,
                        `audio-${crypto.randomUUID()}`,
                        `Audio ${current.tracks.filter((track) => isAudioTrack(current, track)).length + 1}`,
                      ),
                    )
                  }
                >
                  + A
                </button>
              </div>
            </div>
            <div
              className="time-ruler"
              ref={ruler}
              data-range-frames={displayDurationInFrames}
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={0}
              aria-valuemax={manifest.durationInFrames - 1}
              aria-valuenow={frame}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  onSeek(frame - 1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  onSeek(frame + 1);
                }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                scrub(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) scrub(event);
              }}
            >
              {rulerMarks.map((mark) => (
                <div
                  key={mark.frame}
                  className={`time-ruler-tick ${mark.major ? "is-major" : "is-minor"} ${mark.position === 0 ? "is-start" : ""} ${mark.position > 99.9 ? "is-end" : ""}`}
                  style={{ left: `${mark.position}%` }}
                  aria-hidden="true"
                >
                  {mark.label && <span>{mark.label}</span>}
                </div>
              ))}
              <div
                className="playhead-line"
                style={{
                  left: `${(frame / displayDurationInFrames) * 100}%`,
                }}
              />
              <div
                className="playhead-cap"
                style={{
                  left: `${(frame / displayDurationInFrames) * 100}%`,
                }}
              />
            </div>
          </div>
          <div
            className={`track-insert-zone ${trackDropPreview?.newTrackPosition === "top" ? "is-drop-target" : ""}`}
            data-track-insert="top"
            aria-label="Drop a visual clip here to create a track above"
          >
            <span />
            <span>Drop here to create a visual track above</span>
          </div>
          {document.tracks.map((track) => (
            <div
              className={`track-row ${track.kind === "audio" || isAudioTrack(document, track) ? "is-audio-track" : "is-visual-track"} ${track.visible === false ? "is-hidden-track" : ""} ${track.locked ? "is-locked-track" : ""} ${trackDropPreview?.trackId === track.id ? "is-drop-target" : ""}`}
              key={track.id}
              data-track-row={track.id}
              data-drop-target={
                trackDropPreview?.trackId === track.id ? "true" : undefined
              }
            >
              <div
                className="track-label track-label-controls"
                title={track.name}
              >
                <span className="track-name">{track.name}</span>
                <div className="track-tools">
                  <button
                    type="button"
                    aria-label={`Move ${track.name} up`}
                    title="Move track up"
                    disabled={
                      isAudioTrack(document, track)
                        ? document.tracks
                            .filter((item) => isAudioTrack(document, item))
                            .findIndex((item) => item.id === track.id) === 0
                        : document.tracks
                            .filter((item) => !isAudioTrack(document, item))
                            .findIndex((item) => item.id === track.id) === 0
                    }
                    onClick={() =>
                      onEdit((current) =>
                        reorderTimelineTrack(current, track.id, -1),
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${track.name} down`}
                    title="Move track down"
                    disabled={
                      isAudioTrack(document, track)
                        ? document.tracks
                            .filter((item) => isAudioTrack(document, item))
                            .findIndex((item) => item.id === track.id) ===
                          document.tracks.filter((item) =>
                            isAudioTrack(document, item),
                          ).length -
                            1
                        : document.tracks
                            .filter((item) => !isAudioTrack(document, item))
                            .findIndex((item) => item.id === track.id) ===
                          document.tracks.filter(
                            (item) => !isAudioTrack(document, item),
                          ).length -
                            1
                    }
                    onClick={() =>
                      onEdit((current) =>
                        reorderTimelineTrack(current, track.id, 1),
                      )
                    }
                  >
                    ↓
                  </button>
                  {!isAudioTrack(document, track) && (
                    <button
                      type="button"
                      aria-label={`${track.visible === false ? "Show" : "Hide"} ${track.name}`}
                      title={
                        track.visible === false ? "Show track" : "Hide track"
                      }
                      onClick={() =>
                        onEdit((current) => ({
                          ...current,
                          tracks: current.tracks.map((item) =>
                            item.id === track.id
                              ? {
                                  ...item,
                                  kind: "visual",
                                  visible: item.visible === false,
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      {track.visible === false ? "◉" : "◌"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`${track.locked ? "Unlock" : "Lock"} ${track.name}`}
                    title={track.locked ? "Unlock track" : "Lock track"}
                    onClick={() =>
                      onEdit((current) => ({
                        ...current,
                        tracks: current.tracks.map((item) =>
                          item.id === track.id
                            ? { ...item, locked: !item.locked }
                            : item,
                        ),
                      }))
                    }
                  >
                    {track.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${track.name}`}
                    title="Rename track"
                    onClick={() => {
                      const name = window
                        .prompt("Track name", track.name)
                        ?.trim();
                      if (!name || name === track.name) return;
                      onEdit((current) => ({
                        ...current,
                        tracks: current.tracks.map((item) =>
                          item.id === track.id
                            ? { ...item, name: name.slice(0, 100) }
                            : item,
                        ),
                      }));
                    }}
                  >
                    …
                  </button>
                </div>
              </div>
              <div
                className="track-lane"
                data-track={track.id}
                onPointerDown={beginMarquee}
                onPointerMove={moveMarquee}
                onPointerUp={finishMarquee}
                onPointerCancel={finishMarquee}
              >
                {document.clips
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => {
                    const audioClip = isAudioTimelineClip(clip);
                    const soundtrackClip = clip.componentId === "soundtrack";
                    const trackLocked = track.locked === true;
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          soundtrackClip
                            ? `Audio clip ${clip.id}; fixed at frame zero`
                            : clip.componentId === "video-audio"
                              ? `Video audio clip ${clip.id}`
                              : `Clip ${clip.id}`
                        }
                        aria-pressed={selectedClipIds.includes(clip.id)}
                        data-clip-id={clip.id}
                        data-from-frame={clip.from}
                        data-end-frame={clip.from + clip.durationInFrames}
                        data-range-locked={soundtrackClip ? "true" : undefined}
                        title={
                          soundtrackClip
                            ? "Soundtrack timing is fixed at frame zero; it cannot be moved or trimmed."
                            : undefined
                        }
                        className={`timeline-clip ${clip.componentId === "subtitles" ? "subtitle-clip" : ""} ${audioClip ? "audio-clip" : ""} ${selectedClipIds.includes(clip.id) ? "is-selected" : ""} ${trackLocked ? "is-track-locked" : ""} ${track.visible === false ? "is-track-hidden" : ""}`}
                        style={{
                          left: `${(clip.from / displayDurationInFrames) * 100}%`,
                          width: `${(clip.durationInFrames / displayDurationInFrames) * 100}%`,
                        }}
                        onPointerDown={(event) => {
                          if (!trackLocked) begin(event, clip, "move");
                          else {
                            event.stopPropagation();
                            onSelectClip(
                              clip.id,
                              event.shiftKey || event.ctrlKey || event.metaKey,
                            );
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.defaultPrevented) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectClip(
                              clip.id,
                              event.shiftKey || event.ctrlKey || event.metaKey,
                            );
                          }
                          if (
                            !soundtrackClip &&
                            (event.key === "ArrowLeft" ||
                              event.key === "ArrowRight")
                          ) {
                            event.preventDefault();
                            onEdit((current) => {
                              const latest = current.clips.find(
                                (candidate) => candidate.id === clip.id,
                              );
                              if (!latest) return current;
                              const start = Math.min(
                                MAX_TIMELINE_DURATION_FRAMES -
                                  latest.durationInFrames,
                                Math.max(
                                  0,
                                  latest.from +
                                    (event.key === "ArrowRight" ? 1 : -1),
                                ),
                              );
                              return changeClipRangeWithDurationExtension(
                                current,
                                latest.id,
                                start,
                                start + latest.durationInFrames,
                              );
                            });
                          }
                        }}
                      >
                        {!soundtrackClip &&
                          !trackLocked &&
                          selectedClipId === clip.id && (
                            <button
                              className="resize-handle left"
                              aria-label={`Resize start ${clip.id}`}
                              onPointerDown={(event) =>
                                begin(event, clip, "left")
                              }
                            />
                          )}
                        <span className="clip-title">
                          {String(clip.content.text ?? clip.label)}
                        </span>
                        <small>
                          {formatFrameTime(clip.from, document.fps)}–
                          {formatFrameTime(
                            clip.from + clip.durationInFrames,
                            document.fps,
                          )}
                        </small>
                        {!soundtrackClip &&
                          !trackLocked &&
                          selectedClipId === clip.id && (
                            <button
                              className="resize-handle right"
                              aria-label={`Resize end ${clip.id}`}
                              onPointerDown={(event) =>
                                begin(event, clip, "right")
                              }
                            />
                          )}
                      </div>
                    );
                  })}
                <div
                  className="playhead-line"
                  style={{
                    left: `${(frame / displayDurationInFrames) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <div
            className={`track-insert-zone ${trackDropPreview?.newTrackPosition === "bottom" ? "is-drop-target" : ""}`}
            data-track-insert="bottom"
            aria-label="Drop a visual clip here to create a track below"
          >
            <span />
            <span>Drop here to create a visual track below</span>
          </div>
        </div>
      </div>
      {trackDropPreview && dragging && (
        <div
          className="timeline-drag-ghost"
          style={{
            left: trackDropPreview.x + 14,
            top: trackDropPreview.y + 14,
          }}
          aria-hidden="true"
        >
          <strong>{trackDropPreview.label}</strong>
          <span>
            {trackDropPreview.newTrackPosition
              ? `Create a visual track ${trackDropPreview.newTrackPosition === "top" ? "above" : "below"}`
              : trackDropPreview.trackId
                ? document?.tracks.find(
                    (track) => track.id === trackDropPreview.trackId,
                  )?.visible === false
                  ? `Hidden track: ${document.tracks.find((track) => track.id === trackDropPreview.trackId)?.name}; clip will not appear in preview`
                  : `Move to ${document?.tracks.find((track) => track.id === trackDropPreview.trackId)?.name ?? "track"}`
                : "Choose an unlocked visual track"}
          </span>
        </div>
      )}
      <div className="timeline-footer">
        <label className="button">
          Import subtitles / timeline
          <input
            aria-label="Import subtitles"
            type="file"
            accept=".json,.srt,.lrc"
            onChange={(event) => {
              onImportFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button onClick={() => onExportTiming("json")}>
          Export timing JSON
        </button>
        <button onClick={() => onExportTiming("srt")}>Export SRT</button>
        <button onClick={() => onExportTiming("lrc")}>Export LRC</button>
        <button onClick={onExportDocument}>Export editable timeline</button>
      </div>
      {marquee?.active && (
        <div
          className="timeline-marquee"
          style={{
            left: Math.min(marquee.startX, marquee.x),
            top: Math.min(marquee.startY, marquee.y),
            width: Math.abs(marquee.x - marquee.startX),
            height: Math.abs(marquee.y - marquee.startY),
          }}
          aria-hidden="true"
        />
      )}
    </div>
  ) : (
    <p className="muted timeline-loading" data-editor-view="timeline">
      {manifest.editTimeline
        ? "Loading editable timeline…"
        : "This code-only project has no declared timeline. Playback remains available."}
    </p>
  );
}
