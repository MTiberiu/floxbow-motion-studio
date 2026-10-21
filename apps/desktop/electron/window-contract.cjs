const MAX_IPC_MESSAGE_BYTES = 4096;
const CHANNELS = Object.freeze({
  getContext: "flox:window:get-context",
  openPanel: "flox:window:open-panel",
  panelClosed: "flox:window:panel-closed",
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
    ]) &&
    value.role === "panel" &&
    value.panelId === "timeline" &&
    typeof value.projectId === "string" &&
    projectIdPattern.test(value.projectId) &&
    typeof value.sessionId === "string" &&
    sessionIdPattern.test(value.sessionId) &&
    typeof value.instanceId === "string" &&
    instanceIdPattern.test(value.instanceId)
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

function isEmptyRequest(args) {
  return args.length === 0;
}

module.exports = {
  CHANNELS,
  MAX_IPC_MESSAGE_BYTES,
  PANEL_REGISTRY,
  hasExactKeys,
  isEmptyRequest,
  isOpenPanelResult,
  isPanelClosedEvent,
  isPanelOpenRequest,
  isWindowContext,
  isWithinMessageLimit,
  projectIdPattern,
  sessionIdPattern,
};
