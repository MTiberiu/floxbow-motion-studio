const MAX_IPC_MESSAGE_BYTES = 4096;
const MAX_TIMELINE_SNAPSHOT_BYTES = 1024 * 1024;
const CHANNELS = Object.freeze({
  getContext: "flox:window:get-context",
  openPanel: "flox:window:open-panel",
  panelClosed: "flox:window:panel-closed",
  closePanel: "flox:window:close-panel",
  timelineSnapshot: "flox:timeline:snapshot",
  timelineSnapshotRequest: "flox:timeline:snapshot-request",
  timelineFrame: "flox:timeline:frame",
  timelineCommand: "flox:timeline:command",
  timelineCommandResult: "flox:timeline:command-result",
});
const PANEL_REGISTRY = Object.freeze({
  timeline: Object.freeze({
    id: "timeline",
    title: "Timeline",
    route: "#studio-panel=timeline",
    width: 1200,
    height: 460,
    minWidth: 720,
    minHeight: 320,
  }),
});

const projectIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instanceIdPattern = sessionIdPattern;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isWithinMessageLimit(value) {
  try {
    return (
      Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_IPC_MESSAGE_BYTES
    );
  } catch {
    return false;
  }
}

function isWithinTimelineSnapshotLimit(value) {
  try {
    return (
      Buffer.byteLength(JSON.stringify(value), "utf8") <=
      MAX_TIMELINE_SNAPSHOT_BYTES
    );
  } catch {
    return false;
  }
}

function isJsonValue(value, depth = 0) {
  if (depth > 24) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      value.length <= 10000 &&
      value.every((item) => isJsonValue(item, depth + 1))
    );
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).length <= 1000 &&
    Object.values(value).every((item) => isJsonValue(item, depth + 1))
  );
}

function isTimelineDocument(value) {
  if (
    !isRecord(value) ||
    !["version", "fps", "durationInFrames", "tracks", "clips"].every((key) =>
      Object.hasOwn(value, key),
    ) ||
    Object.keys(value).some(
      (key) =>
        ![
          "version",
          "fps",
          "durationInFrames",
          "trackOrder",
          "tracks",
          "clips",
        ].includes(key),
    ) ||
    (value.trackOrder !== undefined &&
      value.trackOrder !== "legacy" &&
      value.trackOrder !== "top-down")
  )
    return false;
  if (
    value.version !== 1 ||
    !Number.isInteger(value.fps) ||
    value.fps < 1 ||
    value.fps > 120
  )
    return false;
  if (
    !Number.isInteger(value.durationInFrames) ||
    value.durationInFrames < 1 ||
    value.durationInFrames > 216000
  )
    return false;
  if (
    !Array.isArray(value.tracks) ||
    value.tracks.length < 1 ||
    value.tracks.length > 32
  )
    return false;
  const tracks = new Set();
  for (const track of value.tracks) {
    if (
      !isRecord(track) ||
      !Object.hasOwn(track, "id") ||
      !Object.hasOwn(track, "name") ||
      Object.keys(track).some(
        (key) => !["id", "name", "kind", "visible", "locked"].includes(key),
      ) ||
      typeof track.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(track.id) ||
      typeof track.name !== "string" ||
      track.name.length < 1 ||
      track.name.length > 100 ||
      tracks.has(track.id) ||
      (track.kind !== undefined &&
        track.kind !== "visual" &&
        track.kind !== "audio") ||
      (track.visible !== undefined && typeof track.visible !== "boolean") ||
      (track.locked !== undefined && typeof track.locked !== "boolean")
    )
      return false;
    tracks.add(track.id);
  }
  if (!Array.isArray(value.clips) || value.clips.length > 3000) return false;
  const clips = new Set();
  for (const clip of value.clips) {
    if (
      !hasExactKeys(clip, [
        "id",
        "trackId",
        "componentId",
        "label",
        "from",
        "durationInFrames",
        "content",
        "props",
      ])
    )
      return false;
    if (
      ![clip.id, clip.trackId, clip.componentId].every(
        (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id),
      )
    )
      return false;
    if (
      clips.has(clip.id) ||
      !tracks.has(clip.trackId) ||
      typeof clip.label !== "string" ||
      clip.label.length > 200
    )
      return false;
    if (
      !Number.isInteger(clip.from) ||
      clip.from < 0 ||
      !Number.isInteger(clip.durationInFrames) ||
      clip.durationInFrames < 1 ||
      clip.from + clip.durationInFrames > value.durationInFrames
    )
      return false;
    if (
      !isRecord(clip.content) ||
      !isRecord(clip.props) ||
      !isJsonValue(clip.content) ||
      !isJsonValue(clip.props)
    )
      return false;
    clips.add(clip.id);
  }
  return isWithinTimelineSnapshotLimit(value);
}

function isTimelineSnapshot(value) {
  if (
    !hasExactKeys(value, [
      "panelId",
      "projectId",
      "sessionId",
      "instanceId",
      "stateVersion",
      "sourceCommandId",
      "fps",
      "durationInFrames",
      "hasEditableTimeline",
      "document",
      "components",
      "selectedClipId",
      "selectedClipIds",
      "frame",
      "playing",
      "dirty",
      "conflict",
      "undoCount",
      "redoCount",
    ])
  )
    return false;
  return (
    value.panelId === "timeline" &&
    typeof value.projectId === "string" &&
    projectIdPattern.test(value.projectId) &&
    typeof value.sessionId === "string" &&
    sessionIdPattern.test(value.sessionId) &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId) &&
    Number.isSafeInteger(value.stateVersion) &&
    value.stateVersion >= 0 &&
    (value.sourceCommandId === null ||
      (typeof value.sourceCommandId === "string" &&
        /^.+:[1-9][0-9]{0,14}$/.test(value.sourceCommandId))) &&
    Number.isInteger(value.fps) &&
    value.fps >= 1 &&
    value.fps <= 120 &&
    Number.isInteger(value.durationInFrames) &&
    value.durationInFrames >= 1 &&
    value.durationInFrames <= 216000 &&
    typeof value.hasEditableTimeline === "boolean" &&
    (value.document === null ||
      (isTimelineDocument(value.document) &&
        value.document.fps === value.fps &&
        value.document.durationInFrames === value.durationInFrames)) &&
    Array.isArray(value.components) &&
    value.components.length <= 256 &&
    value.components.every((item) => isJsonValue(item)) &&
    typeof value.selectedClipId === "string" &&
    value.selectedClipId.length <= 100 &&
    Array.isArray(value.selectedClipIds) &&
    value.selectedClipIds.length <= 256 &&
    value.selectedClipIds.every(
      (clipId) => typeof clipId === "string" && clipId.length <= 100,
    ) &&
    new Set(value.selectedClipIds).size === value.selectedClipIds.length &&
    value.selectedClipId === (value.selectedClipIds[0] ?? "") &&
    Number.isInteger(value.frame) &&
    value.frame >= 0 &&
    value.frame < value.durationInFrames &&
    typeof value.playing === "boolean" &&
    typeof value.dirty === "boolean" &&
    typeof value.conflict === "boolean" &&
    Number.isInteger(value.undoCount) &&
    value.undoCount >= 0 &&
    value.undoCount <= 50 &&
    Number.isInteger(value.redoCount) &&
    value.redoCount >= 0 &&
    value.redoCount <= 50 &&
    isWithinTimelineSnapshotLimit(value)
  );
}

function isTimelineCommand(value) {
  if (
    !hasExactKeys(value, [
      "panelId",
      "projectId",
      "sessionId",
      "instanceId",
      "commandId",
      "stateVersion",
      "command",
    ])
  )
    return false;
  if (
    value.panelId !== "timeline" ||
    typeof value.projectId !== "string" ||
    !projectIdPattern.test(value.projectId) ||
    typeof value.sessionId !== "string" ||
    !sessionIdPattern.test(value.sessionId) ||
    typeof value.instanceId !== "string" ||
    !instanceIdPattern.test(value.instanceId) ||
    typeof value.commandId !== "string" ||
    !value.commandId.startsWith(`${value.instanceId}:`) ||
    !/^[0-9a-f-]{36}:[1-9][0-9]{0,14}$/i.test(value.commandId) ||
    !Number.isSafeInteger(value.stateVersion) ||
    value.stateVersion < 0 ||
    !isRecord(value.command)
  )
    return false;
  const command = value.command;
  if (
    command.type === "editTimeline"
      ? !isWithinTimelineSnapshotLimit(value)
      : !isWithinMessageLimit(value)
  )
    return false;
  if (command.type === "selectClip")
    return (
      hasExactKeys(command, ["type", "clipId"]) &&
      typeof command.clipId === "string" &&
      command.clipId.length <= 100
    );
  if (command.type === "selectClips")
    return (
      hasExactKeys(command, ["type", "clipIds"]) &&
      Array.isArray(command.clipIds) &&
      command.clipIds.length <= 256 &&
      command.clipIds.every(
        (clipId) => typeof clipId === "string" && clipId.length <= 100,
      ) &&
      new Set(command.clipIds).size === command.clipIds.length
    );
  if (command.type === "seek")
    return (
      hasExactKeys(command, ["type", "frame"]) &&
      Number.isInteger(command.frame) &&
      command.frame >= 0 &&
      command.frame <= 216000
    );
  if (["play", "pause", "undo", "redo"].includes(command.type))
    return hasExactKeys(command, ["type"]);
  if (["copy", "cut", "paste", "duplicate", "delete"].includes(command.type))
    return hasExactKeys(command, ["type"]);
  if (command.type === "editTimeline")
    return (
      hasExactKeys(command, ["type", "document", "checkpoint"]) &&
      isTimelineDocument(command.document) &&
      typeof command.checkpoint === "boolean"
    );
  if (command.type === "beginClipGesture")
    return (
      (hasExactKeys(command, ["type", "gestureId", "clipId"]) ||
        hasExactKeys(command, ["type", "gestureId", "clipId", "duplicateId"]) ||
        hasExactKeys(command, ["type", "gestureId", "clipId", "groupMove"])) &&
      typeof command.gestureId === "string" &&
      instanceIdPattern.test(command.gestureId) &&
      typeof command.clipId === "string" &&
      command.clipId.length <= 100 &&
      (command.groupMove === undefined || command.groupMove === true) &&
      !(command.groupMove && command.duplicateId) &&
      (command.duplicateId === undefined ||
        (typeof command.duplicateId === "string" &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(command.duplicateId)))
    );
  if (command.type === "updateClipGesture")
    return (
      (hasExactKeys(command, [
        "type",
        "gestureId",
        "clipId",
        "from",
        "durationInFrames",
        "trim",
      ]) ||
        hasExactKeys(command, [
          "type",
          "gestureId",
          "clipId",
          "from",
          "durationInFrames",
          "trim",
          "ripple",
        ])) &&
      typeof command.gestureId === "string" &&
      instanceIdPattern.test(command.gestureId) &&
      typeof command.clipId === "string" &&
      command.clipId.length <= 100 &&
      Number.isInteger(command.from) &&
      command.from >= 0 &&
      Number.isInteger(command.durationInFrames) &&
      command.durationInFrames > 0 &&
      typeof command.trim === "boolean" &&
      (command.ripple === undefined || typeof command.ripple === "boolean")
    );
  if (command.type === "endClipGesture")
    return (
      hasExactKeys(command, ["type", "gestureId"]) &&
      typeof command.gestureId === "string" &&
      instanceIdPattern.test(command.gestureId)
    );
  return false;
}

function isTimelineCommandResult(value) {
  return (
    hasExactKeys(value, [
      "panelId",
      "projectId",
      "sessionId",
      "instanceId",
      "commandId",
      "status",
      "stateVersion",
      "message",
    ]) &&
    value.panelId === "timeline" &&
    typeof value.projectId === "string" &&
    projectIdPattern.test(value.projectId) &&
    typeof value.sessionId === "string" &&
    sessionIdPattern.test(value.sessionId) &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId) &&
    typeof value.commandId === "string" &&
    value.commandId.startsWith(`${value.instanceId}:`) &&
    /^[0-9a-f-]{36}:[1-9][0-9]{0,14}$/i.test(value.commandId) &&
    ["accepted", "rejected"].includes(value.status) &&
    Number.isSafeInteger(value.stateVersion) &&
    value.stateVersion >= 0 &&
    typeof value.message === "string" &&
    value.message.length <= 300 &&
    isWithinMessageLimit(value)
  );
}

function isTimelineFrame(value) {
  return (
    hasExactKeys(value, [
      "panelId",
      "projectId",
      "sessionId",
      "instanceId",
      "stateVersion",
      "frame",
      "playing",
    ]) &&
    value.panelId === "timeline" &&
    typeof value.projectId === "string" &&
    projectIdPattern.test(value.projectId) &&
    typeof value.sessionId === "string" &&
    sessionIdPattern.test(value.sessionId) &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId) &&
    Number.isSafeInteger(value.stateVersion) &&
    value.stateVersion >= 0 &&
    Number.isInteger(value.frame) &&
    value.frame >= 0 &&
    value.frame <= 216000 &&
    typeof value.playing === "boolean" &&
    isWithinMessageLimit(value)
  );
}

function isPanelOpenRequest(value) {
  if (!hasExactKeys(value, ["panelId", "projectId", "sessionId"])) return false;
  if (
    value.panelId !== "timeline" ||
    typeof value.projectId !== "string" ||
    value.projectId.length > 64 ||
    !projectIdPattern.test(value.projectId) ||
    typeof value.sessionId !== "string" ||
    !sessionIdPattern.test(value.sessionId)
  )
    return false;
  return isWithinMessageLimit(value);
}

function isPrimaryWindowContext(value) {
  return (
    hasExactKeys(value, ["role", "panelId"]) &&
    value.role === "primary" &&
    value.panelId === null
  );
}

function isPanelWindowContext(value) {
  return (
    hasExactKeys(value, [
      "role",
      "panelId",
      "projectId",
      "sessionId",
      "instanceId",
      "commandSequence",
    ]) &&
    value.role === "panel" &&
    value.panelId === "timeline" &&
    typeof value.projectId === "string" &&
    projectIdPattern.test(value.projectId) &&
    typeof value.sessionId === "string" &&
    sessionIdPattern.test(value.sessionId) &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId) &&
    Number.isSafeInteger(value.commandSequence) &&
    value.commandSequence >= 0
  );
}

function isWindowContext(value) {
  return isPrimaryWindowContext(value) || isPanelWindowContext(value);
}

function isOpenPanelResult(value) {
  return (
    hasExactKeys(value, ["panelId", "instanceId", "status"]) &&
    value.panelId === "timeline" &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId) &&
    (value.status === "opened" || value.status === "focused")
  );
}

function isPanelClosedEvent(value) {
  return (
    hasExactKeys(value, ["panelId", "projectId", "sessionId", "instanceId"]) &&
    value.panelId === "timeline" &&
    typeof value.projectId === "string" &&
    projectIdPattern.test(value.projectId) &&
    typeof value.sessionId === "string" &&
    sessionIdPattern.test(value.sessionId) &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId)
  );
}

function isClosePanelRequest(value) {
  return (
    hasExactKeys(value, ["panelId", "instanceId"]) &&
    value.panelId === "timeline" &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId)
  );
}

function isEmptyRequest(args) {
  return args.length === 0;
}

module.exports = {
  CHANNELS,
  MAX_IPC_MESSAGE_BYTES,
  MAX_TIMELINE_SNAPSHOT_BYTES,
  PANEL_REGISTRY,
  hasExactKeys,
  isEmptyRequest,
  isOpenPanelResult,
  isPanelClosedEvent,
  isClosePanelRequest,
  isPanelOpenRequest,
  isWindowContext,
  isWithinMessageLimit,
  isWithinTimelineSnapshotLimit,
  isTimelineDocument,
  isTimelineSnapshot,
  isTimelineCommand,
  isTimelineCommandResult,
  isTimelineFrame,
  projectIdPattern,
  sessionIdPattern,
};
