import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  componentInfosSchema,
  parseEditTimeline,
  type ComponentInfo,
  type EditTimeline,
} from "@motion/sdk/timeline";

export type EditorSessionSnapshot = Readonly<{
  projectId: string;
  sessionId: string;
  stateVersion: number;
  document?: EditTimeline;
  revision: string;
  dirty: boolean;
  conflict: boolean;
  saving: boolean;
  components: readonly ComponentInfo[];
  selectedClipId: string;
  frame: number;
  playing: boolean;
  previewGeneration: number;
  undoCount: number;
  redoCount: number;
  error: string;
  notice: string;
}>;

export type EditorSessionCommands = Readonly<{
  edit: (next: EditTimeline, checkpoint?: boolean) => void;
  selectClip: (clipId: string) => void;
  seek: (frame: number) => void;
  play: () => void;
  pause: () => void;
  undo: () => void;
  redo: () => void;
  checkpoint: () => void;
  save: () => Promise<void>;
  reloadFromDisk: () => Promise<void>;
  sendPreview: (type: string, payload?: Record<string, unknown>) => void;
  receivePreviewMessage: (
    event: MessageEvent,
    previewWindow: WindowProxy | null,
  ) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  getCurrentDocument: () => EditTimeline | undefined;
  getSelectedClipId: () => string;
  getStateVersion: () => number;
}>;

export type EditorSession = Readonly<{
  snapshot: EditorSessionSnapshot;
  commands: EditorSessionCommands;
}>;

type Disk = { timeline: EditTimeline; revision: string };

export function useEditorSession({
  manifest,
  previewOrigin,
  active,
  requestPreviewReload,
  sendPreview,
}: {
  manifest: ProjectManifest;
  previewOrigin: string;
  active: boolean;
  requestPreviewReload: () => void;
  sendPreview: (type: string, payload?: Record<string, unknown>) => void;
}): EditorSession {
  const sessionId = useRef(crypto.randomUUID()).current;
  const stateVersionRef = useRef(0);
  const [stateVersion, setStateVersion] = useState(0);
  const advanceStateVersion = useCallback(() => {
    stateVersionRef.current += 1;
    setStateVersion(stateVersionRef.current);
  }, []);
  const [document, setDocument] = useState<EditTimeline>();
  const documentRef = useRef(document);
  documentRef.current = document;
  const [revision, setRevision] = useState("");
  const revisionRef = useRef("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const selectedClipIdRef = useRef("");
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(
    Math.min(manifest.fps * 2, manifest.durationInFrames - 1),
  );
  const [playing, setPlaying] = useState(false);
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const wasActive = useRef(active);
  const resumePlaybackAfterHide = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undoStack, setUndoStack] = useState<EditTimeline[]>([]);
  const [redoStack, setRedoStack] = useState<EditTimeline[]>([]);
  const loadedTimeline = useRef(false);
  const mounted = useRef(true);
  const draftKey = `motion-draft-v1:${manifest.id}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setClean = (disk: Disk, refreshPreview = false) => {
    advanceStateVersion();
    documentRef.current = disk.timeline;
    setDocument(disk.timeline);
    sendPreview("document", { timeline: disk.timeline });
    if (refreshPreview) requestPreviewReload();
    revisionRef.current = disk.revision;
    setRevision(disk.revision);
    dirtyRef.current = false;
    setDirty(false);
    setConflict(false);
    setError("");
    localStorage.removeItem(draftKey);
    setUndoStack([]);
    setRedoStack([]);
  };

  useEffect(() => {
    if (wasActive.current === active) return;
    wasActive.current = active;
    if (!active) {
      resumePlaybackAfterHide.current = playing;
      if (playing) sendPreview("pause");
      return;
    }
    setPreviewGeneration((generation) => generation + 1);
  }, [active, playing, sendPreview]);

  useEffect(() => {
    if (!manifest.editTimeline || !active) return;
    let alive = true;
    const read = async (initial = !loadedTimeline.current) => {
      try {
        const response = await fetch(`/api/edit/${manifest.id}`);
        if (!response.ok) throw new Error(await response.text());
        const disk: Disk = await response.json();
        disk.timeline = parseEditTimeline(disk.timeline);
        if (
          disk.timeline.fps !== manifest.fps ||
          disk.timeline.durationInFrames < manifest.durationInFrames
        )
          throw new Error(
            "Timeline FPS or duration does not match project.json.",
          );
        if (!alive) return;
        if (initial) {
          loadedTimeline.current = true;
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            try {
              const draft = JSON.parse(raw);
              const restored = parseEditTimeline(draft.timeline);
              if (
                restored.fps !== manifest.fps ||
                restored.durationInFrames < manifest.durationInFrames
              )
                throw new Error(
                  "Draft timeline no longer matches project settings.",
                );
              documentRef.current = restored;
              setDocument(restored);
              revisionRef.current = draft.revision;
              setRevision(draft.revision);
              dirtyRef.current = true;
              setDirty(true);
              setConflict(draft.revision !== disk.revision);
              setNotice("Restored your unsaved draft.");
              return;
            } catch {
              localStorage.removeItem(draftKey);
            }
          }
          setClean(disk);
        } else if (disk.revision !== revisionRef.current) {
          if (dirtyRef.current) {
            setConflict(true);
          } else {
            setClean(disk, true);
            setNotice("Updated from project files.");
          }
        }
      } catch (readError) {
        if (alive) setError(String(readError));
      }
    };
    void read();
    const timer = setInterval(() => void read(), 1800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, manifest.id, manifest.editTimeline, manifest.durationInFrames]);

  useEffect(() => {
    if (!document || !dirty) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ timeline: document, revision }),
      );
    } catch {
      setError(
        "Draft storage is full. Save the project or export your timeline.",
      );
    }
  }, [document, dirty, revision]);

  const edit = useCallback(
    (next: EditTimeline, checkpoint = true) => {
      try {
        const parsed = parseEditTimeline(next);
        if (
          parsed.fps !== manifest.fps ||
          parsed.durationInFrames < manifest.durationInFrames
        )
          throw new Error(
            "Timeline FPS or duration does not match project.json.",
          );
        if (checkpoint && documentRef.current) {
          const previousDocument = documentRef.current;
          setUndoStack((history) => [
            ...history.slice(-49),
            structuredClone(previousDocument),
          ]);
          setRedoStack([]);
        }
        documentRef.current = next;
        setDocument(next);
        sendPreview("document", { timeline: next });
        dirtyRef.current = true;
        setDirty(true);
        setError("");
        advanceStateVersion();
      } catch (editError) {
        setError(String(editError));
      }
    },
    [advanceStateVersion, manifest, sendPreview],
  );

  const seek = useCallback(
    (requestedFrame: number) => {
      const duration =
        documentRef.current?.durationInFrames ?? manifest.durationInFrames;
      const value = Math.max(
        0,
        Math.min(duration - 1, Math.round(requestedFrame)),
      );
      setFrame(value);
      frameRef.current = value;
      sendPreview("seek", { frame: value });
      advanceStateVersion();
    },
    [advanceStateVersion, manifest.durationInFrames, sendPreview],
  );

  const save = useCallback(async () => {
    const savedDocument = documentRef.current;
    if (!savedDocument) return;
    const savedRevision = revisionRef.current;
    setSaving(true);
    try {
      const response = await fetch(`/api/edit/${manifest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeline: savedDocument,
          revision: savedRevision,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const disk: Disk = await response.json();
      if (!mounted.current) return;
      if (documentRef.current === savedDocument) {
        setClean(disk);
        setNotice("Saved to the project. Renders use these edits.");
      } else {
        revisionRef.current = disk.revision;
        setRevision(disk.revision);
        dirtyRef.current = true;
        setDirty(true);
        setConflict(false);
        setNotice("Saved earlier edits. Newer changes are still unsaved.");
      }
    } catch (saveError) {
      if (mounted.current) setError(String(saveError));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [manifest, sendPreview]);

  const reloadFromDisk = useCallback(async () => {
    try {
      const response = await fetch(`/api/edit/${manifest.id}`);
      if (!response.ok) throw new Error(await response.text());
      const disk: Disk = await response.json();
      if (!mounted.current) return;
      setClean(disk, true);
      setNotice("Loaded the file on disk.");
    } catch (reloadError) {
      if (mounted.current) setError(String(reloadError));
    }
  }, [manifest, requestPreviewReload, sendPreview]);

  const undo = useCallback(() => {
    const current = documentRef.current;
    if (!current || !undoStack.length) return;
    const previous = undoStack.at(-1)!;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((history) => [...history, current]);
    edit(previous, false);
  }, [edit, undoStack]);

  const redo = useCallback(() => {
    const current = documentRef.current;
    if (!current || !redoStack.length) return;
    const next = redoStack.at(-1)!;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((history) => [...history, current]);
    edit(next, false);
  }, [edit, redoStack]);

  const checkpoint = useCallback(() => {
    const current = documentRef.current;
    if (!current) return;
    setUndoStack((history) => [
      ...history.slice(-49),
      structuredClone(current),
    ]);
    setRedoStack([]);
  }, []);

  const receivePreviewMessage = useCallback(
    (event: MessageEvent, previewWindow: WindowProxy | null) => {
      if (
        event.source !== previewWindow ||
        event.origin !== previewOrigin ||
        event.data?.channel !== "motion-editor-v1" ||
        event.data.projectId !== manifest.id
      )
        return;
      if (event.data.type === "ready") {
        try {
          setComponents(componentInfosSchema.parse(event.data.components));
          if (documentRef.current)
            sendPreview("document", { timeline: documentRef.current });
          sendPreview("seek", { frame: frameRef.current });
          if (resumePlaybackAfterHide.current) sendPreview("play");
        } catch (messageError) {
          setError(String(messageError));
        }
      }
      if (
        event.data.type === "frame" &&
        Number.isInteger(event.data.frame) &&
        event.data.frame >= 0 &&
        event.data.frame <
          (documentRef.current?.durationInFrames ?? manifest.durationInFrames)
      ) {
        setFrame(event.data.frame);
        frameRef.current = event.data.frame;
        const isPlaying = event.data.playing === true;
        setPlaying(isPlaying);
        if (isPlaying) resumePlaybackAfterHide.current = false;
      }
      if (event.data.type === "error") setError(String(event.data.message));
    },
    [manifest.durationInFrames, manifest.id, previewOrigin, sendPreview],
  );

  const state: EditorSessionSnapshot = {
    projectId: manifest.id,
    sessionId,
    stateVersion,
    document,
    revision,
    dirty,
    conflict,
    saving,
    components,
    selectedClipId,
    frame,
    playing,
    previewGeneration,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    error,
    notice,
  };
  const commands: EditorSessionCommands = {
    edit,
    selectClip: (clipId) => {
      selectedClipIdRef.current = clipId;
      setSelectedClipId(clipId);
      advanceStateVersion();
    },
    seek,
    play: () => {
      sendPreview("play");
      advanceStateVersion();
    },
    pause: () => {
      resumePlaybackAfterHide.current = false;
      sendPreview("pause");
      advanceStateVersion();
    },
    undo,
    redo,
    checkpoint: () => {
      checkpoint();
      advanceStateVersion();
    },
    save,
    reloadFromDisk,
    sendPreview,
    receivePreviewMessage,
    setError,
    setNotice,
    getCurrentDocument: () => documentRef.current,
    getSelectedClipId: () => selectedClipIdRef.current,
    getStateVersion: () => stateVersionRef.current,
  };
  return { snapshot: state, commands };
}
