import type {
  Storyboard,
  StoryboardCollaborationMessage,
} from "./storyboard";

export type StoryboardDirective = {
  directiveId: string;
  sceneId: string;
  setId: string | null;
  targetKind: StoryboardCollaborationMessage["targetKind"];
  targetId: string;
  field: string;
  label: string;
  instruction: string;
};

/**
 * Exposes existing Director-authored fields as stable, addressable directives.
 * This avoids copying directions into a second plan model.
 */
export function listStoryboardDirectives(
  doc: Storyboard,
): StoryboardDirective[] {
  const result: StoryboardDirective[] = [];
  const add = (
    sceneId: string,
    setId: string | null,
    targetKind: StoryboardDirective["targetKind"],
    targetId: string,
    field: string,
    label: string,
    instruction: string,
  ) => {
    const text = instruction.trim();
    if (!text) return;
    result.push({
      directiveId: `${targetKind}:${targetId}:${field}`,
      sceneId,
      setId,
      targetKind,
      targetId,
      field,
      label,
      instruction: text,
    });
  };

  for (const scene of doc.scenes) {
    add(scene.id, null, "scene", scene.id, "directions", "Scene direction", scene.directions);
    add(scene.id, null, "scene", scene.id, "style", "Visual style", scene.style);
    for (const shot of scene.sets) {
      add(scene.id, shot.id, "shot", shot.id, "description", "Shot action", shot.description);
      add(scene.id, shot.id, "shot", shot.id, "cameraNote", "Camera / framing", shot.cameraNote);
      add(scene.id, shot.id, "shot", shot.id, "transition", "Transition", shot.transition);
      add(scene.id, shot.id, "shot", shot.id, "compositionNote", "Composition", shot.compositionNote);
      add(scene.id, shot.id, "shot", shot.id, "timing", "Timing", shot.timing);
      for (const layer of shot.representations) {
        const label = layer.layerName || layer.id;
        add(scene.id, shot.id, "element", layer.id, "instructions", `${label} · direction`, layer.instructions);
        add(scene.id, shot.id, "element", layer.id, "motion", `${label} · motion`, layer.motion);
        add(scene.id, shot.id, "element", layer.id, "pose", `${label} · pose`, layer.pose);
        add(scene.id, shot.id, "element", layer.id, "spatialNote", `${label} · position`, layer.spatialNote);
      }
    }
  }
  for (const annotation of doc.annotations) {
    add(
      annotation.sceneId,
      annotation.setId,
      "annotation",
      annotation.id,
      "instruction",
      annotation.label || `Image ${annotation.kind}`,
      annotation.instruction,
    );
  }
  for (const action of doc.actionPlans) {
    add(
      action.sceneId,
      action.fromSetId,
      "action",
      action.id,
      "direction",
      `${action.libraryActionName} · action plan`,
      [action.direction, action.view, action.poseGuidance, action.note]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

export type DirectiveCoverageStatus =
  | "awaiting-animator"
  | "clarification-needed"
  | "proposed"
  | "implemented"
  | "self-checked"
  | "needs-revision"
  | "approved";

export type DirectiveCoverage = StoryboardDirective & {
  status: DirectiveCoverageStatus;
  messages: StoryboardCollaborationMessage[];
  timelineClipIds: string[];
  componentIds: string[];
  sourceFiles: string[];
};

/** Reports traceability only; it never claims that code looks artistically correct. */
export function getStoryboardDirectiveCoverage(
  doc: Storyboard,
  filters: { sceneId?: string; setId?: string } = {},
): DirectiveCoverage[] {
  return listStoryboardDirectives(doc)
    .filter((directive) => !filters.sceneId || directive.sceneId === filters.sceneId)
    .filter((directive) => !filters.setId || directive.setId === filters.setId)
    .map((directive) => {
      const messages = doc.collaboration
        .filter((message) =>
          message.sceneId === directive.sceneId &&
          message.setId === directive.setId &&
          message.targetKind === directive.targetKind &&
          message.targetId === directive.targetId &&
          message.field === directive.field,
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const latest = messages.at(-1);
      const openQuestion = messages.some((message) =>
        message.kind === "question" &&
        !messages.some((reply) => reply.replyToId === message.id && reply.author !== "animator"),
      );
      const status: DirectiveCoverageStatus = openQuestion
        ? "clarification-needed"
        : latest?.outcome === "needs-revision"
          ? "needs-revision"
          : latest?.outcome === "approved"
            ? "approved"
            : messages.some((message) => message.kind === "self-review" || message.outcome === "self-checked")
              ? "self-checked"
              : messages.some((message) => message.kind === "implementation" || message.outcome === "implemented")
                ? "implemented"
                : messages.some((message) => message.kind === "proposal" || message.outcome === "alternative-proposed")
                  ? "proposed"
                  : "awaiting-animator";
      return {
        ...directive,
        status,
        messages,
        timelineClipIds: [...new Set(messages.flatMap((message) => message.timelineClipIds))],
        componentIds: [...new Set(messages.flatMap((message) => message.componentIds))],
        sourceFiles: [...new Set(messages.flatMap((message) => message.sourceFiles))],
      };
    });
}
