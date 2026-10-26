import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  comboDurationMs,
  emptyPoseStudioLibrary,
  gridRegions,
  makePose,
  poseStepAtTime,
  readPoseSheetSource,
  readPoseStudioLibrary,
  writePoseStudioLibrary,
  type PoseCombo,
  type PoseRegion,
  type PoseStudioLibrary,
} from "./pose-studio-data";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { TimelineScene, VisualAssetGroup } from "@motion/sdk/timeline";
import "./pose-studio.css";

const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
type Drag = {
  id: string;
  startX: number;
  startY: number;
  rect: PoseRegion["rectPx"];
  mode: "move" | "resize";
};
type MaskStroke = PoseRegion["maskStrokes"][number];
type InspectorTab = "crop" | "mask" | "action" | "sequence";
type SceneContext = {
  projectId: string;
  frame: number;
  scenes: TimelineScene[];
};

function PoseCatalogThumb({
  sheet,
  pose,
}: {
  sheet: PoseStudioLibrary["sheets"][number];
  pose?: PoseRegion;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !pose) return;
    void readPoseSheetSource(sheet.id).then(async (blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (cancelled) return;
      const view = sourceViewport(pose, sheet);
      const scale = Math.min(
        (canvas.width - 20) / view.w,
        (canvas.height - 20) / view.h,
      );
      const width = view.w * scale;
      const height = view.h * scale;
      const left = (canvas.width - width) / 2;
      const top = (canvas.height - height) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, view.x, view.y, view.w, view.h, left, top, width, height);
      ctx.globalCompositeOperation = "destination-out";
      for (const stroke of pose.maskStrokes) {
        ctx.beginPath();
        stroke.points.forEach((point, index) => {
          const x = left + point.x * width;
          const y = top + point.y * height;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineWidth = stroke.width * width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          ctx.arc(
            left + point.x * width,
            top + point.y * height,
            ctx.lineWidth / 2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sheet.id, sheet.widthPx, sheet.heightPx, pose?.id, pose?.sourceView, pose?.maskStrokes]);
  return <canvas ref={canvasRef} width={320} height={220} aria-hidden="true" />;
}

async function exportPosePng(
  image: HTMLImageElement,
  sheet: PoseStudioLibrary["sheets"][number],
  pose: PoseRegion,
) {
  const viewport = sourceViewport(pose, sheet);
  const scale = Math.min(
    1,
    2048 / viewport.w,
    2048 / viewport.h,
    Math.sqrt(8_000_000 / (viewport.w * viewport.h)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.w * scale));
  canvas.height = Math.max(1, Math.round(viewport.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a pose image for import.");
  ctx.drawImage(
    image,
    viewport.x,
    viewport.y,
    viewport.w,
    viewport.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  ctx.globalCompositeOperation = "destination-out";
  for (const stroke of pose.maskStrokes) {
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = stroke.width * canvas.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      ctx.arc(
        point.x * canvas.width,
        point.y * canvas.height,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else ctx.stroke();
  }
  return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}

function sourceViewport(
  pose: PoseRegion,
  sheet: PoseStudioLibrary["sheets"][number],
) {
  const zoom = pose.sourceView.zoom;
  const w = pose.rectPx.w / zoom;
  const h = pose.rectPx.h / zoom;
  return {
    x: Math.max(
      0,
      Math.min(
        sheet.widthPx - w,
        pose.rectPx.x +
          (pose.rectPx.w - w) / 2 +
          pose.sourceView.panX * ((pose.rectPx.w - w) / 2),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        sheet.heightPx - h,
        pose.rectPx.y +
          (pose.rectPx.h - h) / 2 +
          pose.sourceView.panY * ((pose.rectPx.h - h) / 2),
      ),
    ),
    w,
    h,
  };
}

export function PoseSheetStudio({
  manifest,
  built = false,
}: {
  manifest?: ProjectManifest;
  built?: boolean;
}) {
  const [library, setLibrary] = useState<PoseStudioLibrary>(() =>
    emptyPoseStudioLibrary(),
  );
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [categoryId, setCategoryId] = useState("category-general");
  const [characterId, setCharacterId] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [poseId, setPoseId] = useState("");
  const [comboId, setComboId] = useState("");
  const [mode, setMode] = useState<"crops" | "combo">("crops");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("crop");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pendingSource, setPendingSource] = useState<{
    sheetId: string;
    file: Blob;
  }>();
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(4);
  const [selectedForCombo, setSelectedForCombo] = useState<string[]>([]);
  const [poseLookup, setPoseLookup] = useState("1");
  const [maskBrush, setMaskBrush] = useState(0.06);
  const [maskDraft, setMaskDraft] = useState<MaskStroke>();
  const [stepViewport, setStepViewport] = useState({ top: 0, height: 170 });
  const [selectedStepId, setSelectedStepId] = useState("");
  const [timelineScale, setTimelineScale] = useState(420);
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [query, setQuery] = useState("");
  const [importSearch, setImportSearch] = useState("");
  const [newCharacterName, setNewCharacterName] = useState("");
  const [showCreateCharacter, setShowCreateCharacter] = useState(false);
  const [newActionName, setNewActionName] = useState("");
  const [showCreateAction, setShowCreateAction] = useState(false);
  const [showGridOptions, setShowGridOptions] = useState(false);
  const [showGridPreview, setShowGridPreview] = useState(false);
  const [showProjectImport, setShowProjectImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sceneContext, setSceneContext] = useState<SceneContext>();
  const [targetSceneId, setTargetSceneId] = useState("");
  const [importStartSeconds, setImportStartSeconds] = useState("");
  const sceneRequestId = useRef("");
  const pendingImportId = useRef("");
  const [gridMargins, setGridMargins] = useState({
    marginX: 0,
    marginY: 0,
    gutterX: 0,
    gutterY: 0,
  });
  const [dragRect, setDragRect] = useState<{
    id: string;
    rect: PoseRegion["rectPx"];
  }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const cropPreviewCanvas = useRef<HTMLCanvasElement>(null);
  const cropLayer = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const playStart = useRef<number | undefined>(undefined);
  const playOrigin = useRef(0);
  const maskDrawing = useRef<{ id: string; stroke: MaskStroke } | undefined>(
    undefined,
  );
  const timelineDragIndex = useRef<number | undefined>(undefined);
  const timelineScroll = useRef<HTMLDivElement>(null);

  function requestSceneContext() {
    if (!manifest) return;
    const requestId = crypto.randomUUID();
    sceneRequestId.current = requestId;
    setSceneContext(undefined);
    window.dispatchEvent(
      new CustomEvent("motion-request-scene-context", {
        detail: { requestId, projectId: manifest.id },
      }),
    );
  }

  useEffect(() => {
    if (!manifest) return;
    const receive = (event: Event) => {
      const detail = (
        event as CustomEvent<SceneContext & { requestId?: unknown }>
      ).detail;
      if (
        detail?.projectId !== manifest.id ||
        detail.requestId !== sceneRequestId.current ||
        !Number.isInteger(detail.frame) ||
        !Array.isArray(detail.scenes)
      )
        return;
      const scenes = detail.scenes;
      setSceneContext({
        projectId: manifest.id,
        frame: detail.frame,
        scenes,
      });
      setImportStartSeconds((current) =>
        current || (detail.frame / manifest.fps).toFixed(3),
      );
      setTargetSceneId((selected) =>
        scenes.some((scene) => scene.id === selected)
          ? selected
          : (scenes.find(
              (scene) =>
                detail.frame >= scene.from &&
                detail.frame < scene.from + scene.durationInFrames,
            )?.id ??
            scenes[0]?.id ??
            ""),
      );
    };
    window.addEventListener("motion-scene-context", receive);
    requestSceneContext();
    return () => window.removeEventListener("motion-scene-context", receive);
  }, [manifest?.id]);

  useEffect(() => {
    if (!manifest) return;
    const openFromScene = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const detail = value as {
        projectId?: unknown;
        sceneId?: unknown;
        startFrame?: unknown;
      };
      if (
        detail.projectId !== manifest.id ||
        typeof detail.sceneId !== "string" ||
        !Number.isInteger(detail.startFrame)
      )
        return;
      setTargetSceneId(detail.sceneId);
      setImportStartSeconds(
        ((detail.startFrame as number) / manifest.fps).toFixed(3),
      );
      setShowProjectImport(true);
      requestSceneContext();
    };
    const consumePending = () => {
      const raw = window.sessionStorage.getItem(
        "floxbow.pose-studio.import-request",
      );
      if (!raw) return;
      window.sessionStorage.removeItem("floxbow.pose-studio.import-request");
      try {
        openFromScene(JSON.parse(raw));
      } catch {
        // Ignore a stale or malformed workspace navigation hint.
      }
    };
    const receive = (event: Event) =>
      openFromScene(
        (event as CustomEvent<Record<string, unknown>>).detail,
      );
    consumePending();
    window.addEventListener("motion-open-pose-studio-import", receive);
    return () =>
      window.removeEventListener("motion-open-pose-studio-import", receive);
  }, [manifest?.id, manifest?.fps]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId?: unknown;
          requestId?: unknown;
          success?: unknown;
          message?: unknown;
        }>
      ).detail;
      if (
        detail?.projectId !== manifest?.id ||
        detail.requestId !== pendingImportId.current
      )
        return;
      pendingImportId.current = "";
      setImporting(false);
      if (detail.success === true) {
        setShowProjectImport(false);
        setNotice(
          typeof detail.message === "string"
            ? detail.message
            : "Animation imported into the project.",
        );
      } else {
        setNotice(
          typeof detail.message === "string"
            ? detail.message
            : "The animation could not be imported.",
        );
      }
    };
    window.addEventListener("motion-pose-import-result", receive);
    return () =>
      window.removeEventListener("motion-pose-import-result", receive);
  }, [manifest?.id]);

  useEffect(() => {
    void readPoseStudioLibrary()
      .then((saved) => {
        setLibrary(saved);
        setLoaded(true);
        setCharacterId(saved.characters[0]?.id ?? "");
        setCategoryId(saved.categories[0]?.id ?? "category-general");
        const character = saved.characters[0];
        const sheet = saved.sheets.find(
          (item) => item.characterId === character?.id,
        );
        setSheetId(sheet?.id ?? "");
        setPoseId(sheet?.regions[0]?.id ?? "");
        const combo = saved.combos.find(
          (item) => item.characterId === character?.id,
        );
        setComboId(combo?.id ?? "");
        setSelectedStepId(combo?.steps[0]?.id ?? "");
      })
      .catch((error) => {
        setNotice(error instanceof Error ? error.message : String(error));
        setLoaded(true);
      });
  }, []);
  const categories = library.categories;
  const characters = library.characters.filter(
    (item) => !query || item.name.toLowerCase().includes(query.toLowerCase()),
  );
  const character = library.characters.find((item) => item.id === characterId);
  const sheets = library.sheets.filter(
    (item) => item.characterId === characterId,
  );
  const sheet = sheets.find((item) => item.id === sheetId);
  const pose = sheet?.regions.find((item) => item.id === poseId);
  const combos = library.combos.filter(
    (item) => item.characterId === characterId,
  );
  const combo = combos.find((item) => item.id === comboId);
  const importEntries = library.combos
    .map((action) => {
      const owner = library.characters.find(
        (item) => item.id === action.characterId,
      );
      const actionSheet = library.sheets.find(
        (item) => item.id === action.sheetId,
      );
      const firstPose = actionSheet?.regions.find(
        (item) => item.id === action.steps[0]?.poseId,
      );
      const category = library.categories.find(
        (item) => item.id === owner?.categoryId,
      );
      return owner && actionSheet
        ? { action, owner, actionSheet, firstPose, category }
        : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => {
      const search = importSearch.trim().toLowerCase();
      return (
        !search ||
        `${item.owner.name} ${item.action.name} ${item.category?.name ?? ""}`
          .toLowerCase()
          .includes(search)
      );
    });
  const filteredPoses = useMemo(
    () => sheet?.regions.filter((item) => !item.hidden) ?? [],
    [sheet],
  );
  const gridPreviewRegions = useMemo(() => {
    if (!sheet) return [];
    try {
      return gridRegions(
        sheet.widthPx,
        sheet.heightPx,
        columns,
        rows,
        gridMargins.marginX,
        gridMargins.marginY,
        gridMargins.gutterX,
        gridMargins.gutterY,
      );
    } catch {
      return [];
    }
  }, [sheet, columns, rows, gridMargins]);

  useEffect(() => {
    let cancelled = false;
    let url = "";
    setSourceUrl("");
    if (sheet && pendingSource?.sheetId === sheet.id) {
      url = URL.createObjectURL(pendingSource.file);
      setSourceUrl(url);
    } else if (sheet)
      void readPoseSheetSource(sheet.id).then((blob) => {
        if (blob && !cancelled) {
          url = URL.createObjectURL(blob);
          setSourceUrl(url);
        } else if (!cancelled) setSourceUrl("");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sheet?.id, pendingSource]);

  function updateLibrary(recipe: (draft: PoseStudioLibrary) => void) {
    setLibrary((current) => {
      const next = structuredClone(current);
      recipe(next);
      return next;
    });
  }
  function updatePose(patch: Partial<PoseRegion>) {
    if (!sheet || !pose) return;
    updateLibrary((draft) => {
      const target = draft.sheets
        .find((item) => item.id === sheet.id)!
        .regions.find((item) => item.id === pose.id)!;
      Object.assign(target, patch);
    });
  }
  function updateCombo(recipe: (draft: PoseCombo) => void) {
    if (!combo) return;
    updateLibrary((draft) =>
      recipe(draft.combos.find((item) => item.id === combo.id)!),
    );
  }
  async function save() {
    try {
      const saved = await writePoseStudioLibrary(library, pendingSource);
      setLibrary(saved);
      setPendingSource(undefined);
      setNotice("Pose library saved on this device.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function importActionIntoProject() {
    if (
      !manifest ||
      built ||
      !manifest.editTimeline ||
      !character ||
      !sheet ||
      !combo ||
      !sourceUrl
    ) {
      setNotice(
        "Open a live project with an editable Timeline, then choose an action to import.",
      );
      return;
    }
    if (!sceneContext || sceneContext.projectId !== manifest.id) {
      requestSceneContext();
      setNotice("Loading the project's scenes. Try Import again in a moment.");
      return;
    }
    const poseIds = [...new Set(combo.steps.map((step) => step.poseId))];
    if (poseIds.length > 100) {
      setNotice(
        "A project character can contain up to 100 distinct poses. Split this action into smaller actions.",
      );
      return;
    }
    const regions = poseIds.map((id) =>
      sheet.regions.find((region) => region.id === id),
    );
    if (regions.some((region) => !region)) {
      setNotice(
        "This action references a pose that is missing from its sheet.",
      );
      return;
    }
    setImporting(true);
    setNotice("Preparing transparent pose images…");
    try {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();
      const poses = await Promise.all(
        regions.map(async (region) => ({
          poseId: region!.id,
          displayName:
            `${character.name} · ${region!.name || `Pose ${region!.label}`}`.slice(
              0,
              100,
            ),
          pngBase64: await exportPosePng(image, sheet, region!),
        })),
      );
      const mediaUrl = `/api/media/${encodeURIComponent(manifest.id)}`;
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) throw new Error(await mediaResponse.text());
      const media = (await mediaResponse.json()) as { revision?: unknown };
      if (typeof media.revision !== "string")
        throw new Error("The project Media Library could not be read.");
      const response = await fetch(`${mediaUrl}/pose-studio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: media.revision, poses }),
      });
      const raw = await response.text();
      if (response.status === 404) {
        throw new Error(
          "The running FloxBow media service does not support Pose Studio imports yet. Restart FloxBow, then try again.",
        );
      }
      let registered: {
        assets?: Array<{ poseId?: unknown; assetId?: unknown }>;
      };
      try {
        registered = JSON.parse(raw);
      } catch {
        throw new Error(raw || "The project could not store the pose images.");
      }
      if (!response.ok)
        throw new Error(raw || "The project could not store the pose images.");
      const assetIds = new Map(
        (registered.assets ?? []).map((asset) => [asset.poseId, asset.assetId]),
      );
      const memberIds = new Map(
        poseIds.map((id) => [id, makeId("pose-member")]),
      );
      if (poseIds.some((id) => typeof assetIds.get(id) !== "string"))
        throw new Error("The project returned an incomplete pose-image list.");
      const group: VisualAssetGroup = {
        id: makeId("pose-group"),
        name: `${character.name} · ${combo.name}`.slice(0, 100),
        category: "characters",
        source: {
          kind: "pose-studio",
          characterId: character.id,
          sheetId: sheet.id,
          comboId: combo.id,
        },
        members: regions.map((region) => ({
          id: memberIds.get(region!.id)!,
          assetId: assetIds.get(region!.id) as string,
          sourcePoseId: region!.id,
          label: (region!.name || `Pose ${region!.label}`).slice(0, 100),
          role: "pose" as const,
          offsetX: 0,
          offsetY: 0,
        })),
      };
      const requestId = crypto.randomUUID();
      pendingImportId.current = requestId;
      const targetScene = sceneContext.scenes.find(
        (scene) => scene.id === targetSceneId,
      );
      const startFrame = Math.round(
        Number(importStartSeconds || sceneContext.frame / manifest.fps) *
          manifest.fps,
      );
      window.dispatchEvent(
        new CustomEvent("motion-import-pose-action", {
          detail: {
            projectId: manifest.id,
            requestId,
            group,
            steps: combo.steps.map((step) => ({
              memberId: memberIds.get(step.poseId),
              durationMs: step.durationMs,
            })),
            speed: combo.speed,
            ...(targetScene ? { sceneId: targetScene.id } : {}),
            startFrame,
            label: `${character.name} · ${combo.name}`,
          },
        }),
      );
      setNotice("Adding the action to the project's Timeline…");
    } catch (error) {
      pendingImportId.current = "";
      setImporting(false);
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  function addCategory() {
    const name = window.prompt("Category name");
    if (!name?.trim()) return;
    const item = { id: makeId("category"), name: name.trim() };
    updateLibrary((draft) => draft.categories.push(item));
    setCategoryId(item.id);
  }
  function beginCreateCharacter() {
    setQuery("");
    setNewCharacterName("");
    setShowCreateCharacter(true);
  }
  function createCharacter() {
    const name = newCharacterName.trim();
    if (!name) {
      setNotice("Enter a name for the character.");
      return;
    }
    if (!categoryId) {
      setNotice("Create a category first.");
      return;
    }
    const item = {
      id: makeId("character"),
      name,
      categoryId,
      description: "",
      sheetIds: [],
    };
    updateLibrary((draft) => draft.characters.push(item));
    setCharacterId(item.id);
    setSheetId("");
    setPoseId("");
    setComboId("");
    setShowCreateCharacter(false);
    setNewCharacterName("");
    setNotice(`Character ${item.name} created. Import a pose sheet to begin.`);
  }
  async function importSheet(file: File) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setNotice("Choose a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setNotice("Pose sheets are limited to 100 MB.");
      return;
    }
    const url = URL.createObjectURL(file),
      image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      setNotice("This image could not be decoded.");
      return;
    }
    URL.revokeObjectURL(url);
    if (image.naturalWidth > 32768 || image.naturalHeight > 32768) {
      setNotice(
        "This image is larger than the supported 32,768 px edge limit.",
      );
      return;
    }
    let owner = character;
    if (!owner) {
      const newCharacter = {
        id: makeId("character"),
        name: file.name.replace(/\.[^.]+$/, "") || "New character",
        categoryId: categoryId || categories[0]?.id || "category-general",
        description: "",
        sheetIds: [],
      };
      updateLibrary((draft) => draft.characters.push(newCharacter));
      setCharacterId(newCharacter.id);
      owner = newCharacter;
    }
    const id = makeId("sheet"),
      region = makePose("1", {
        x: 0,
        y: 0,
        w: image.naturalWidth,
        h: image.naturalHeight,
      });
    const newSheet = {
      id,
      characterId: owner.id,
      name: file.name.replace(/\.[^.]+$/, "") || "Pose sheet",
      sourceName: file.name,
      mimeType: file.type,
      widthPx: image.naturalWidth,
      heightPx: image.naturalHeight,
      regions: [region],
    };
    updateLibrary((draft) => {
      draft.sheets.push(newSheet);
      const current = draft.characters.find((item) => item.id === owner!.id)!;
      current.sheetIds.push(id);
    });
    setSheetId(id);
    setPoseId(region.id);
    setPendingSource({ sheetId: id, file });
    setMode("crops");
    setShowGridPreview(true);
    setNotice(
      `Imported ${file.name} once. The source image stays shared by every crop and combo.`,
    );
  }
  function createGrid() {
    if (!sheet) return;
    try {
      const next = gridRegions(
        sheet.widthPx,
        sheet.heightPx,
        columns,
        rows,
        gridMargins.marginX,
        gridMargins.marginY,
        gridMargins.gutterX,
        gridMargins.gutterY,
      );
      const regions = next.map((item, index) => ({
        ...item,
        ...sheet.regions[index],
        id: sheet.regions[index]?.id ?? item.id,
        label: String(index + 1),
        rectPx: item.rectPx,
      }));
      const retained = new Set(regions.map((region) => region.id));
      const starter = library.combos.find(
        (action) =>
          action.sheetId === sheet.id && action.name === "Starter sequence",
      );
      const losesComboPose = library.combos.some(
        (action) =>
          action.sheetId === sheet.id &&
          action.id !== starter?.id &&
          action.steps.some((step) => !retained.has(step.poseId)),
      );
      if (losesComboPose) {
        setNotice(
          "This grid would remove poses used in saved actions. Remove those steps before reducing the grid.",
        );
        return;
      }
      const starterId = starter?.id ?? makeId("combo");
      const visibleRegions = regions.filter((region) => !region.hidden);
      const starterSteps = visibleRegions.map((region) => ({
        id: makeId("step"),
        poseId: region.id,
        durationMs: 120,
        transition: "cut" as const,
      }));
      updateLibrary((draft) => {
        draft.sheets.find((item) => item.id === sheet.id)!.regions = regions;
        const existingStarter = draft.combos.find(
          (action) => action.id === starterId,
        );
        if (existingStarter) existingStarter.steps = starterSteps;
        else
          draft.combos.push({
            id: starterId,
            characterId: sheet.characterId,
            sheetId: sheet.id,
            name: "Starter sequence",
            speed: 1,
            loop: true,
            steps: starterSteps,
          });
      });
      setPoseId(regions[0].id);
      setShowGridPreview(false);
      setComboId(starterId);
      setSelectedStepId(starterSteps[0]?.id ?? "");
      setMode("combo");
      setInspectorTab("action");
      setPlayheadMs(0);
      playOrigin.current = 0;
      playStart.current = undefined;
      setPlaying(true);
      setNotice(
        `${regions.length} poses created. The starter sequence is playing. Adjust it in the right-side tabs and reorder frames on the timeline. Save library to keep changes.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  function addManualRegion() {
    if (!sheet) return;
    const region = makePose(String(sheet.regions.length + 1), {
      x: sheet.widthPx * 0.35,
      y: sheet.heightPx * 0.25,
      w: sheet.widthPx * 0.3,
      h: sheet.heightPx * 0.5,
    });
    updateLibrary((draft) =>
      draft.sheets.find((item) => item.id === sheet.id)!.regions.push(region),
    );
    setPoseId(region.id);
  }
  function beginCropDrag(
    event: ReactPointerEvent<HTMLElement>,
    region: PoseRegion,
    mode: Drag["mode"],
  ) {
    if (!stage.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: region.id,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...region.rectPx },
      mode,
    };
  }
  function moveCropDrag(event: ReactPointerEvent<HTMLElement>) {
    const activeMask = maskDrawing.current;
    if (activeMask) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = {
        x: Math.max(
          0,
          Math.min(1, (event.clientX - bounds.left) / bounds.width),
        ),
        y: Math.max(
          0,
          Math.min(1, (event.clientY - bounds.top) / bounds.height),
        ),
      };
      const stroke = {
        ...activeMask.stroke,
        points: [...activeMask.stroke.points, point],
      };
      maskDrawing.current = { ...activeMask, stroke };
      setMaskDraft(stroke);
      return;
    }
    const active = drag.current;
    if (!active || !stage.current || !sheet) return;
    const box = stage.current.getBoundingClientRect(),
      dx = ((event.clientX - active.startX) * sheet.widthPx) / box.width,
      dy = ((event.clientY - active.startY) * sheet.heightPx) / box.height;
    const w =
      active.mode === "resize"
        ? Math.max(
            1,
            Math.min(sheet.widthPx - active.rect.x, active.rect.w + dx),
          )
        : active.rect.w;
    const h =
      active.mode === "resize"
        ? Math.max(
            1,
            Math.min(sheet.heightPx - active.rect.y, active.rect.h + dy),
          )
        : active.rect.h;
    const x =
      active.mode === "move"
        ? Math.max(0, Math.min(sheet.widthPx - w, active.rect.x + dx))
        : active.rect.x;
    const y =
      active.mode === "move"
        ? Math.max(0, Math.min(sheet.heightPx - h, active.rect.y + dy))
        : active.rect.y;
    setDragRect({ id: active.id, rect: { x, y, w, h } });
  }
  function beginMaskStroke(
    event: ReactPointerEvent<HTMLElement>,
    region: PoseRegion,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const stroke: MaskStroke = {
      width: maskBrush,
      points: [
        {
          x: Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
          ),
          y: Math.max(
            0,
            Math.min(1, (event.clientY - bounds.top) / bounds.height),
          ),
        },
      ],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    maskDrawing.current = { id: region.id, stroke };
    setMaskDraft(stroke);
  }
  function finishMaskStroke() {
    const active = maskDrawing.current;
    maskDrawing.current = undefined;
    if (active && active.stroke.points.length > 0)
      updateLibrary((draft) => {
        const target = draft.sheets
          .find((item) => item.id === sheetId)
          ?.regions.find((item) => item.id === active.id);
        if (target) target.maskStrokes.push(active.stroke);
      });
    setMaskDraft(undefined);
  }
  function endCropDrag() {
    if (maskDrawing.current) {
      finishMaskStroke();
      return;
    }
    const current = dragRect;
    drag.current = undefined;
    if (current) {
      updateLibrary((draft) => {
        const target = draft.sheets
          .find((item) => item.id === sheetId)
          ?.regions.find((item) => item.id === current.id);
        if (target) target.rectPx = current.rect;
      });
    }
    setDragRect(undefined);
  }
  function beginCreateAction() {
    if (!character || !sheet) {
      setNotice("Choose a character and a pose sheet first.");
      return;
    }
    setNewActionName("");
    setShowCreateAction(true);
  }
  function createCombo() {
    if (!character || !sheet) return;
    const name = newActionName.trim();
    if (!name) {
      setNotice("Enter a name for this action.");
      return;
    }
    const firstPose = sheet.regions.find((item) => !item.hidden);
    if (!firstPose) return;
    const item: PoseCombo = {
      id: makeId("combo"),
      characterId: character.id,
      sheetId: sheet.id,
      name,
      speed: 1,
      loop: true,
      steps: [
        {
          id: makeId("step"),
          poseId: firstPose.id,
          durationMs: 120,
          transition: "cut",
        },
      ],
    };
    updateLibrary((draft) => draft.combos.push(item));
    setPlaying(false);
    setComboId(item.id);
    setSelectedStepId(item.steps[0]?.id ?? "");
    setMode("combo");
    setInspectorTab("action");
    setPlayheadMs(0);
    setShowCreateAction(false);
    setNewActionName("");
    setNotice(
      `Action ${item.name} created with one pose. Add or reorder poses, then Save library to keep it.`,
    );
  }
  function appendSelectedPoses() {
    if (!combo || selectedForCombo.length === 0) return;
    updateCombo((draft) =>
      draft.steps.push(
        ...selectedForCombo.map((pose) => ({
          id: makeId("step"),
          poseId: pose,
          durationMs: 120,
          transition: "cut" as const,
        })),
      ),
    );
    setSelectedForCombo([]);
  }
  function selectPoseByLabel() {
    const match = sheet?.regions.find(
      (region) =>
        region.label.toLowerCase() === poseLookup.trim().toLowerCase(),
    );
    if (!match) {
      setNotice(`Pose ${poseLookup} was not found on this sheet.`);
      return;
    }
    setPoseId(match.id);
    setSelectedForCombo((current) =>
      current.includes(match.id) ? current : [...current, match.id],
    );
    setNotice(`Pose ${match.label} selected for the next append.`);
  }
  function addRepeatedPose() {
    if (!combo || !pose) return;
    updateCombo((draft) =>
      draft.steps.push({
        id: makeId("step"),
        poseId: pose.id,
        durationMs: 120,
        transition: "cut",
      }),
    );
  }
  function useAllVisiblePoses() {
    if (!combo || !filteredPoses.length) return;
    const steps = filteredPoses.map((region) => ({
      id: makeId("step"),
      poseId: region.id,
      durationMs: 120,
      transition: "cut" as const,
    }));
    updateCombo((draft) => {
      draft.steps = steps;
    });
    setSelectedStepId(steps[0].id);
    setPlayheadMs(0);
    playOrigin.current = 0;
    playStart.current = undefined;
    setPlaying(true);
    setNotice(
      `Sequence rebuilt from all ${filteredPoses.length} visible poses in crop order. Save library to keep it.`,
    );
  }
  function updateStep(
    stepId: string,
    patch: Partial<PoseCombo["steps"][number]>,
  ) {
    updateCombo((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      if (step) Object.assign(step, patch);
    });
  }
  function moveStep(index: number, delta: number) {
    updateCombo((draft) => {
      const target = index + delta;
      if (target < 0 || target >= draft.steps.length) return;
      [draft.steps[index], draft.steps[target]] = [
        draft.steps[target],
        draft.steps[index],
      ];
    });
  }
  function reorderStep(from: number, to: number) {
    updateCombo((draft) => {
      if (from < 0 || from >= draft.steps.length) return;
      const destination = Math.max(0, Math.min(draft.steps.length - 1, to));
      const [step] = draft.steps.splice(from, 1);
      draft.steps.splice(destination, 0, step);
    });
  }
  function seekToStep(index: number) {
    if (!combo) return;
    const step = combo.steps[index];
    if (!step) return;
    setSelectedStepId(step.id);
    setPoseId(step.poseId);
    setPlayheadMs(
      combo.steps
        .slice(0, index)
        .reduce((sum, item) => sum + item.durationMs, 0) / combo.speed,
    );
  }
  function removeStep(stepId: string) {
    if (!combo || combo.steps.length <= 1) return;
    updateCombo((draft) => {
      draft.steps = draft.steps.filter((step) => step.id !== stepId);
    });
  }

  useEffect(() => {
    const canvas = previewCanvas.current,
      ctx = canvas?.getContext("2d"),
      cropCanvas = cropLayer.current ?? document.createElement("canvas"),
      image = new Image();
    cropLayer.current = cropCanvas;
    if (!canvas || !ctx || !sheet || !pose || !sourceUrl) return;
    image.src = sourceUrl;
    const draw = () => {
      const target =
        mode === "combo" && combo
          ? (sheet.regions.find(
              (item) => item.id === poseStepAtTime(combo, playheadMs)?.poseId,
            ) ?? pose)
          : pose;
      if (!target) return;
      const rect = sourceViewport(target, sheet),
        aspect = rect.w / rect.h,
        maxW = canvas.width * 0.76,
        maxH = canvas.height * 0.78;
      const w = Math.min(maxW, maxH * aspect) * target.registration.scale,
        h = w / aspect;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#354457";
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(0, canvas.height * 0.88);
      ctx.lineTo(canvas.width, canvas.height * 0.88);
      ctx.stroke();
      ctx.setLineDash([]);
      const anchorX = canvas.width * (0.5 + target.registration.offsetX),
        anchorY = canvas.height * (0.88 + target.registration.offsetY);
      ctx.save();
      ctx.translate(anchorX, anchorY);
      ctx.rotate((target.registration.rotationDeg * Math.PI) / 180);
      cropCanvas.width = 1024;
      cropCanvas.height = Math.max(1, Math.round(1024 / aspect));
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) return;
      cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropCtx.globalCompositeOperation = "source-over";
      cropCtx.drawImage(
        image,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height,
      );
      cropCtx.globalCompositeOperation = "destination-out";
      for (const stroke of target.maskStrokes) {
        cropCtx.beginPath();
        stroke.points.forEach((point, index) => {
          const x = point.x * cropCanvas.width,
            y = point.y * cropCanvas.height;
          if (index === 0) cropCtx.moveTo(x, y);
          else cropCtx.lineTo(x, y);
        });
        cropCtx.lineWidth = stroke.width * cropCanvas.width;
        cropCtx.lineCap = "round";
        cropCtx.lineJoin = "round";
        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          cropCtx.arc(
            point.x * cropCanvas.width,
            point.y * cropCanvas.height,
            cropCtx.lineWidth / 2,
            0,
            Math.PI * 2,
          );
          cropCtx.fill();
        } else cropCtx.stroke();
      }
      cropCtx.globalCompositeOperation = "source-over";
      ctx.drawImage(
        cropCanvas,
        -w * target.anchor.x,
        -h * target.anchor.y,
        w,
        h,
      );
      ctx.restore();
    };
    if (image.complete) draw();
    else image.onload = draw;
  }, [sourceUrl, sheet, pose, combo, mode, playheadMs]);

  useEffect(() => {
    if (!playing || !combo) return;
    let frame = 0;
    const tick = (now: number) => {
      if (playStart.current === undefined) playStart.current = now;
      const elapsed = playOrigin.current + now - playStart.current;
      setPlayheadMs(
        combo.loop ? elapsed : Math.min(elapsed, comboDurationMs(combo)),
      );
      if (combo.loop || elapsed < comboDurationMs(combo))
        frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, combo]);

  const duration = combo ? comboDurationMs(combo) : 0;
  const activeStep = combo ? poseStepAtTime(combo, playheadMs) : undefined;
  const poseView = sheet && pose ? sourceViewport(pose, sheet) : undefined;
  const listHeight = stepViewport.height,
    rowHeight = 44,
    firstVisible = Math.max(0, Math.floor(stepViewport.top / rowHeight) - 1),
    visibleCount = Math.ceil(listHeight / rowHeight) + 2;
  const visibleSteps =
    combo?.steps.slice(firstVisible, firstVisible + visibleCount) ?? [];
  const timelineItems = useMemo(() => {
    if (!combo) return [];
    let cursor = 0;
    return combo.steps.map((step, index) => {
      const startMs = cursor / combo.speed;
      cursor += step.durationMs;
      return {
        step,
        index,
        startMs,
        durationMs: step.durationMs / combo.speed,
        region: sheet?.regions.find((item) => item.id === step.poseId),
      };
    });
  }, [combo, sheet]);
  const timelineWidth = Math.max(720, duration * timelineScale);
  const selectedStep = combo?.steps.find((step) => step.id === selectedStepId);
  const timelineTickMs =
    duration > 15_000 ? 2000 : duration > 8000 ? 1000 : 500;
  const timelineTicks = Array.from(
    { length: Math.floor(duration / timelineTickMs) + 1 },
    (_, index) => index * timelineTickMs,
  );

  const sequencePanel = combo ? (
    <section className="pose-sequence-editor" aria-label="Sequence editor">
      <div className="pose-sequence-toolbar">
        <strong>Sequence</strong>
        <span>{combo.steps.length} frames</span>
      </div>
      <div className="pose-sequence-toolbar">
        <button onClick={useAllVisiblePoses}>
          Use all {filteredPoses.length} poses
        </button>
        <button onClick={addRepeatedPose} disabled={!pose}>
          ＋ Repeat selected
        </button>
      </div>
      <details className="pose-add-poses">
        <summary>Add poses</summary>
        <div className="pose-number-lookup">
          <label>
            Find pose
            <input
              aria-label="Find pose number"
              value={poseLookup}
              onChange={(event) => setPoseLookup(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") selectPoseByLabel();
              }}
            />
          </label>
          <button onClick={selectPoseByLabel}>Select</button>
        </div>
        <div className="pose-pick-list" aria-label="Available poses">
          {filteredPoses.map((region) => (
            <button
              key={region.id}
              className={selectedForCombo.includes(region.id) ? "selected" : ""}
              aria-pressed={selectedForCombo.includes(region.id)}
              onClick={() =>
                setSelectedForCombo((current) =>
                  current.includes(region.id)
                    ? current.filter((id) => id !== region.id)
                    : [...current, region.id],
                )
              }
            >
              {region.label}
            </button>
          ))}
        </div>
        <button
          onClick={appendSelectedPoses}
          disabled={!selectedForCombo.length}
        >
          Add selected ({selectedForCombo.length})
        </button>
      </details>
      <div
        className="pose-step-list"
        aria-label="Sequence frame settings"
        onScroll={(event) =>
          setStepViewport({
            top: event.currentTarget.scrollTop,
            height: event.currentTarget.clientHeight,
          })
        }
      >
        <div
          style={{
            height: `${combo.steps.length * rowHeight}px`,
            position: "relative",
          }}
        >
          {visibleSteps.map((step, offset) => {
            const index = firstVisible + offset,
              region = sheet?.regions.find((item) => item.id === step.poseId);
            return (
              <div
                className={`pose-step-row ${selectedStepId === step.id ? "selected" : ""}`}
                key={step.id}
                style={{
                  position: "absolute",
                  top: index * rowHeight,
                  left: 0,
                  right: 0,
                  height: rowHeight - 4,
                }}
              >
                <button
                  className="pose-step-pose"
                  onClick={() => seekToStep(index)}
                >
                  {index + 1}. {region?.name || `Pose ${region?.label}`}
                </button>
                <label>
                  <input
                    aria-label={`Step ${index + 1} duration`}
                    type="number"
                    min="16"
                    max="60000"
                    step="16"
                    value={step.durationMs}
                    onChange={(event) =>
                      updateStep(step.id, {
                        durationMs: Math.max(
                          16,
                          Math.min(60000, +event.target.value),
                        ),
                      })
                    }
                  />
                  ms
                </label>
                <button
                  title="Move earlier"
                  aria-label={`Move step ${index + 1} earlier`}
                  disabled={index === 0}
                  onClick={() => moveStep(index, -1)}
                >
                  ←
                </button>
                <button
                  title="Move later"
                  aria-label={`Move step ${index + 1} later`}
                  disabled={index === combo.steps.length - 1}
                  onClick={() => moveStep(index, 1)}
                >
                  →
                </button>
                <button
                  title="Remove frame"
                  aria-label={`Remove step ${index + 1}`}
                  disabled={combo.steps.length <= 1}
                  onClick={() => removeStep(step.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {selectedStep && (
        <small className="pose-muted">
          Selected frame:{" "}
          {
            sheet?.regions.find((item) => item.id === selectedStep.poseId)
              ?.label
          }
        </small>
      )}
    </section>
  ) : null;
  const timelinePanel = combo ? (
    <section className="pose-timeline" aria-label="Pose sequence timeline">
      <div className="pose-timeline-toolbar">
        <strong>{combo.name}</strong>
        <span>{(duration / 1000).toFixed(2)} s</span>
        <button
          aria-label={playing ? "Pause animation" : "Play animation"}
          onClick={() => {
            if (playing) {
              playOrigin.current = playheadMs;
              playStart.current = undefined;
              setPlaying(false);
            } else {
              playOrigin.current = playheadMs;
              playStart.current = undefined;
              setPlaying(true);
            }
          }}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button
          title="Center playhead"
          aria-label="Center playhead"
          onClick={() => {
            if (!timelineScroll.current) return;
            const x = (playheadMs / 1000) * timelineScale;
            timelineScroll.current.scrollLeft = Math.max(
              0,
              x - timelineScroll.current.clientWidth / 2,
            );
          }}
        >
          Center
        </button>
        <div className="pose-timeline-zoom" aria-label="Timeline zoom">
          <button
            title="Zoom out timeline"
            aria-label="Zoom out timeline"
            onClick={() =>
              setTimelineScale((scale) => Math.max(80, scale * 0.8))
            }
          >
            −
          </button>
          <span>{Math.round(timelineScale)} px/s</span>
          <button
            title="Zoom in timeline"
            aria-label="Zoom in timeline"
            onClick={() =>
              setTimelineScale((scale) => Math.min(2400, scale * 1.25))
            }
          >
            ＋
          </button>
        </div>
      </div>
      <div className="pose-timeline-scroll" ref={timelineScroll}>
        <div
          className="pose-timeline-inner"
          style={{ width: timelineWidth, minWidth: "100%" }}
        >
          <div className="pose-timeline-ruler">
            {timelineTicks.map((tick) => (
              <span
                key={tick}
                style={{ left: `${(tick / 1000) * timelineScale}px` }}
              >
                {(tick / 1000).toFixed(tick % 1000 ? 1 : 0)}s
              </span>
            ))}
          </div>
          <div className="pose-timeline-track">
            {timelineItems.map(
              ({ step, index, startMs, durationMs: span, region }) => (
                <button
                  className={`pose-timeline-clip ${selectedStepId === step.id ? "selected" : ""}`}
                  key={step.id}
                  draggable
                  aria-label={`Frame ${index + 1}, pose ${region?.label}, ${(span / 1000).toFixed(2)} seconds`}
                  style={{
                    left: `${(startMs / 1000) * timelineScale}px`,
                    width: `${Math.max(26, (span / 1000) * timelineScale)}px`,
                  }}
                  onClick={() => seekToStep(index)}
                  onDragStart={(event) => {
                    timelineDragIndex.current = index;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = timelineDragIndex.current;
                    if (from !== undefined) reorderStep(from, index);
                    timelineDragIndex.current = undefined;
                  }}
                  onDragEnd={() => {
                    timelineDragIndex.current = undefined;
                  }}
                >
                  <span>
                    {index + 1} · {region?.name || `Pose ${region?.label}`}
                  </span>
                  <small>{(span / 1000).toFixed(2)}s</small>
                </button>
              ),
            )}
            <i
              className="pose-timeline-playhead"
              style={{ left: `${(playheadMs / 1000) * timelineScale}px` }}
            />
          </div>
        </div>
      </div>
    </section>
  ) : null;

  useEffect(() => {
    const canvas = cropPreviewCanvas.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !sheet || !pose || !sourceUrl || !poseView) return;
    const image = new Image();
    image.src = sourceUrl;
    const draw = () => {
      const aspect = poseView.w / poseView.h;
      canvas.width = 520;
      canvas.height = Math.max(1, Math.round(canvas.width / aspect));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(
        image,
        poseView.x,
        poseView.y,
        poseView.w,
        poseView.h,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      ctx.globalCompositeOperation = "destination-out";
      const strokes = [
        ...pose.maskStrokes,
        ...(maskDraft && maskDrawing.current?.id === pose.id
          ? [maskDraft]
          : []),
      ];
      for (const stroke of strokes) {
        ctx.beginPath();
        stroke.points.forEach((point, index) => {
          const x = point.x * canvas.width,
            y = point.y * canvas.height;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineWidth = stroke.width * canvas.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          ctx.arc(
            point.x * canvas.width,
            point.y * canvas.height,
            ctx.lineWidth / 2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };
    if (image.complete) draw();
    else image.onload = draw;
  }, [
    sourceUrl,
    sheet?.id,
    sheet?.widthPx,
    sheet?.heightPx,
    pose?.id,
    pose?.rectPx.x,
    pose?.rectPx.y,
    pose?.rectPx.w,
    pose?.rectPx.h,
    pose?.sourceView,
    pose?.maskStrokes,
    maskDraft,
  ]);

  const selectedTargetScene = sceneContext?.scenes.find(
    (scene) => scene.id === targetSceneId,
  );
  const parsedStartTime = Number(importStartSeconds);
  const requestedStartFrame =
    importStartSeconds.trim() && Number.isFinite(parsedStartTime) && manifest
      ? Math.round(parsedStartTime * manifest.fps)
      : undefined;
  const startFitsScene =
    !selectedTargetScene ||
    (requestedStartFrame !== undefined &&
      requestedStartFrame >= selectedTargetScene.from &&
      requestedStartFrame <
        selectedTargetScene.from + selectedTargetScene.durationInFrames);

  if (!loaded)
    return (
      <section className="pose-studio" aria-busy="true">
        Opening Pose Studio…
      </section>
    );
  return (
    <section className="pose-studio" aria-label="Pose Sheet Studio">
      <header className="pose-studio-header">
        <div>
          <strong>Pose Sheet Studio</strong>
          <span>Reusable characters, pose sheets and action combos</span>
        </div>
        <div className="pose-header-actions">
          <button
            disabled={!manifest || built || !manifest.editTimeline}
            onClick={() => {
              setShowProjectImport(true);
              setImportSearch("");
              requestSceneContext();
            }}
          >
            Choose animation
          </button>
          <button className="pose-primary" onClick={() => void save()}>
            Save library
          </button>
        </div>
      </header>
      {notice && (
        <div className="pose-notice" role="status">
          {notice}
        </div>
      )}
      {showProjectImport &&
        createPortal(
          <div className="pose-studio pose-import-portal-host">
            <div
              className="pose-import-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setShowProjectImport(false);
              }}
            >
          <section
            className="pose-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pose-import-title"
          >
            <header className="pose-import-header">
              <div>
                <span className="pose-import-eyebrow">ANIMATION LIBRARY</span>
                <h2 id="pose-import-title">Choose an animation</h2>
                <p>Pick a saved action and place it directly on this project’s Timeline.</p>
              </div>
              <button
                aria-label="Close animation catalog"
                className="pose-import-close"
                onClick={() => setShowProjectImport(false)}
              >
                ×
              </button>
            </header>
            {!manifest?.editTimeline || built ? (
              <p className="pose-import-empty">
                Open a live project with an editable Timeline to import an animation.
              </p>
            ) : (
              <div className="pose-import-layout">
                <div className="pose-import-catalog">
                  <div className="pose-import-search-row">
                    <label className="pose-import-search">
                      <span aria-hidden="true">⌕</span>
                      <input
                        aria-label="Search animations"
                        placeholder="Search characters or actions…"
                        value={importSearch}
                        onChange={(event) => setImportSearch(event.currentTarget.value)}
                      />
                    </label>
                    <span className="pose-import-count">
                      {importEntries.length} {importEntries.length === 1 ? "animation" : "animations"}
                    </span>
                  </div>
                  {importEntries.length ? (
                    <div className="pose-import-card-grid">
                      {importEntries.map(({ action, owner, actionSheet, firstPose, category }) => {
                        const selected = action.id === comboId;
                        return (
                          <button
                            key={action.id}
                            className={`pose-import-card${selected ? " is-selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() => {
                              setCharacterId(owner.id);
                              setCategoryId(owner.categoryId);
                              setSheetId(actionSheet.id);
                              setPoseId(firstPose?.id ?? "");
                              setComboId(action.id);
                              setMode("combo");
                            }}
                          >
                            <div className="pose-import-card-art">
                              <PoseCatalogThumb sheet={actionSheet} pose={firstPose} />
                              <span className="pose-import-card-badge">{action.steps.length} poses</span>
                            </div>
                            <span className="pose-import-card-copy">
                              <strong>{action.name}</strong>
                              <span>{owner.name}{category ? ` · ${category.name}` : ""}</span>
                            </span>
                            <span className="pose-import-card-meta">
                              {((comboDurationMs(action) / 1000) / action.speed).toFixed(2)} sec
                              {action.loop ? " · Loops" : " · Plays once"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="pose-import-empty">
                      <span aria-hidden="true">▧</span>
                      <strong>{library.combos.length ? "No matching animations" : "Your animation library is empty"}</strong>
                      <p>{library.combos.length ? "Try another character or action name." : "Create and save an action in Pose Studio, then it will appear here."}</p>
                    </div>
                  )}
                </div>
                <aside className="pose-import-details">
                  <span className="pose-import-eyebrow">PLACE IN PROJECT</span>
                  {combo && sheet ? (
                    <>
                      <div className="pose-import-feature-art">
                        <PoseCatalogThumb
                          sheet={sheet}
                          pose={sheet.regions.find((item) => item.id === combo.steps[0]?.poseId)}
                        />
                      </div>
                      <h3>{combo.name}</h3>
                      <p className="pose-import-subtitle">{character?.name ?? "Character"} · {combo.steps.length} poses · {((comboDurationMs(combo) / 1000) / combo.speed).toFixed(2)} sec</p>
                      {!sceneContext || sceneContext.projectId !== manifest.id ? (
                        <p className="pose-import-loading">Reading project scenes…</p>
                      ) : (
                        <>
                          <label className="pose-import-field">
                            Scene
                            <select
                              aria-label="Target scene"
                              value={targetSceneId}
                              onChange={(event) => {
                                const nextId = event.currentTarget.value;
                                setTargetSceneId(nextId);
                                const nextScene = sceneContext.scenes.find((scene) => scene.id === nextId);
                                const currentFrame = Math.round(Number(importStartSeconds || 0) * manifest.fps);
                                if (nextScene && (currentFrame < nextScene.from || currentFrame >= nextScene.from + nextScene.durationInFrames))
                                  setImportStartSeconds((nextScene.from / manifest.fps).toFixed(3));
                              }}
                            >
                              {sceneContext.scenes.length === 0 ? (
                                <option value="">Main Timeline</option>
                              ) : sceneContext.scenes.map((scene) => (
                                <option key={scene.id} value={scene.id}>{scene.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="pose-import-field">
                            Start time
                            <span className="pose-import-time-input">
                              <input
                                aria-label="Animation start time in seconds"
                                type="number"
                                min={targetSceneId ? (sceneContext.scenes.find((scene) => scene.id === targetSceneId)?.from ?? 0) / manifest.fps : 0}
                                max={targetSceneId ? (() => {
                                  const scene = sceneContext.scenes.find((item) => item.id === targetSceneId);
                                  return scene ? (scene.from + scene.durationInFrames - 1) / manifest.fps : 216_000 / manifest.fps;
                                })() : 216_000 / manifest.fps}
                                step={1 / manifest.fps}
                                value={importStartSeconds}
                                onChange={(event) => setImportStartSeconds(event.currentTarget.value)}
                              />
                              <span>seconds</span>
                            </span>
                          </label>
                          {!startFitsScene && (
                            <p className="pose-import-position-error" role="alert">Choose a start time inside {selectedTargetScene?.name}.</p>
                          )}
                        </>
                      )}
                      <div className="pose-import-footer">
                        <button onClick={requestSceneContext}>Refresh</button>
                        <button
                          className="pose-primary"
                          disabled={importing || !combo || !sheet || !sourceUrl || !sceneContext || requestedStartFrame === undefined || !startFitsScene}
                          onClick={() => void importActionIntoProject()}
                        >
                          {importing ? "Importing…" : targetSceneId ? "Import into scene" : "Import to Timeline"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="pose-import-empty pose-import-empty-detail">
                      <strong>Select an animation</strong>
                      <p>Its preview and placement options will appear here.</p>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </section>
            </div>
          </div>,
          document.body,
        )}
      <div className="pose-studio-workspace">
        <aside className="pose-sidebar">
          <div className="pose-sidebar-heading">
            <strong>Library</strong>
            <button title="Add category" onClick={addCategory}>
              ＋ Category
            </button>
          </div>
          <label className="pose-category-picker">
            Category
            <select
              aria-label="Pose category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="pose-list-head">
            <span>Characters</span>
            <button
              className="pose-create-character-button"
              title="Create character"
              onClick={beginCreateCharacter}
            >
              ＋ New character
            </button>
          </div>
          {showCreateCharacter && (
            <form
              className="pose-inline-create"
              onSubmit={(event) => {
                event.preventDefault();
                createCharacter();
              }}
            >
              <label>
                Character name
                <input
                  aria-label="New character name"
                  autoFocus
                  maxLength={160}
                  value={newCharacterName}
                  onChange={(event) =>
                    setNewCharacterName(event.currentTarget.value)
                  }
                  placeholder="e.g. Andrei"
                />
              </label>
              <div>
                <button className="pose-primary" type="submit">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCharacter(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <input
            className="pose-search"
            aria-label="Find character"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Find character…"
          />
          <div className="pose-character-list">
            {characters.map((item) => (
              <button
                key={item.id}
                className={item.id === characterId ? "selected" : ""}
                onClick={() => {
                  setCharacterId(item.id);
                  setCategoryId(item.categoryId);
                  const next = library.sheets.find(
                    (s) => s.characterId === item.id,
                  );
                  setSheetId(next?.id ?? "");
                  setPoseId(next?.regions[0]?.id ?? "");
                  const action = library.combos.find(
                    (c) => c.characterId === item.id,
                  );
                  setComboId(action?.id ?? "");
                  setMode("crops");
                  setInspectorTab("crop");
                }}
              >
                {item.name}
                <small>
                  {item.sheetIds.length} sheets ·{" "}
                  {
                    library.combos.filter(
                      (comboItem) => comboItem.characterId === item.id,
                    ).length
                  }{" "}
                  actions
                </small>
              </button>
            ))}
          </div>
          <div className="pose-list-head">
            <span>Pose sheets</span>
            <button
              title="Import a pose sheet"
              disabled={!character}
              onClick={() => fileInput.current?.click()}
            >
              ＋
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importSheet(file);
              event.currentTarget.value = "";
            }}
          />
          <div className="pose-sheet-list">
            {sheets.map((item) => (
              <button
                key={item.id}
                className={item.id === sheetId ? "selected" : ""}
                onClick={() => {
                  setSheetId(item.id);
                  setPoseId(item.regions[0]?.id ?? "");
                  setMode("crops");
                  setInspectorTab("crop");
                }}
              >
                {item.name}
                <small>
                  {item.widthPx} × {item.heightPx} · {item.regions.length} poses
                </small>
              </button>
            ))}
            {!sheets.length && (
              <small className="pose-muted">
                Import one image; every pose will reference that source.
              </small>
            )}
          </div>
          <div className="pose-list-head">
            <span>Actions</span>
            <button
              className="pose-create-character-button"
              title="Create action combo"
              disabled={!sheet}
              onClick={beginCreateAction}
            >
              ＋ New action
            </button>
          </div>
          {showCreateAction && (
            <form
              className="pose-inline-create"
              onSubmit={(event) => {
                event.preventDefault();
                createCombo();
              }}
            >
              <label>
                Action name
                <input
                  aria-label="New action name"
                  autoFocus
                  maxLength={160}
                  value={newActionName}
                  onChange={(event) =>
                    setNewActionName(event.currentTarget.value)
                  }
                  placeholder="e.g. Walk, Dance or Jump"
                />
              </label>
              <div>
                <button className="pose-primary" type="submit">
                  Create action
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateAction(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="pose-combo-list">
            {combos.map((item) => (
              <button
                key={item.id}
                className={
                  item.id === comboId && mode === "combo" ? "selected" : ""
                }
                onClick={() => {
                  setComboId(item.id);
                  setSelectedStepId(item.steps[0]?.id ?? "");
                  setSheetId(item.sheetId);
                  setPoseId(
                    library.sheets.find((s) => s.id === item.sheetId)
                      ?.regions[0]?.id ?? "",
                  );
                  setMode("combo");
                  setInspectorTab("action");
                  setPlayheadMs(0);
                }}
              >
                {item.name}
                <small>
                  {item.steps.length} steps ·{" "}
                  {(comboDurationMs(item) / 1000).toFixed(2)} s
                </small>
              </button>
            ))}
          </div>
        </aside>
        <main className="pose-main">
          {!sheet ? (
            <div className="pose-empty">
              <div className="pose-empty-icon">▧</div>
              <h2>Start with one character and one image</h2>
              <p>
                Import one pose sheet or a single photo. Crop regions and
                actions reuse that same source image.
              </p>
              <button
                className="pose-primary"
                disabled={!character}
                onClick={() => fileInput.current?.click()}
              >
                Import image sheet
              </button>
              {!character && (
                <button onClick={beginCreateCharacter}>
                  Create a character
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="pose-work-toolbar">
                <div
                  className="pose-mode-switch"
                  role="tablist"
                  aria-label="Pose Studio mode"
                >
                  <button
                    role="tab"
                    aria-selected={mode === "crops"}
                    onClick={() => {
                      setPlaying(false);
                      setMode("crops");
                      setInspectorTab("crop");
                    }}
                  >
                    {showGridPreview ? "Grid preview" : "Crop review"}
                  </button>
                  <button
                    role="tab"
                    aria-selected={mode === "combo"}
                    disabled={!combo}
                    onClick={() => {
                      setMode("combo");
                      setInspectorTab("action");
                    }}
                  >
                    Combo preview
                  </button>
                </div>
                <span>
                  {sheet.widthPx} × {sheet.heightPx}px · {sheet.regions.length}{" "}
                  poses · one source
                </span>
                <button
                  title="Import another sheet"
                  disabled={!character}
                  onClick={() => fileInput.current?.click()}
                >
                  Import sheet
                </button>
              </div>
              {mode === "crops" && (
                <div className="pose-crop-mode-hint" role="status">
                  {showGridPreview
                    ? gridPreviewRegions.length > 0
                      ? "Grid preview only. Apply the grid below to create editable crops."
                      : "Adjust columns, rows or grid settings to preview valid crops."
                    : inspectorTab === "mask"
                      ? "Select a crop, then paint over unwanted parts to erase them to transparency."
                      : "Click a numbered crop to inspect it. Drag its frame to move; resize from the lower-right handle or edit X, Y, Width and Height."}
                </div>
              )}
              <div className="pose-work-area">
                <div className="pose-stage-wrap">
                  {mode === "crops" ? (
                    <div
                      ref={stage}
                      className="pose-source-stage"
                      style={{
                        aspectRatio: `${sheet.widthPx}/${sheet.heightPx}`,
                        width: `min(100%, ${Math.max(45, (70 * sheet.widthPx) / sheet.heightPx)}vh)`,
                      }}
                    >
                      {sourceUrl && (
                        <img
                          className="pose-source-image"
                          src={sourceUrl}
                          alt={`${sheet.name} source sheet`}
                        />
                      )}
                      {showGridPreview && gridPreviewRegions.length > 0
                        ? gridPreviewRegions.map((region, index) => (
                            <div
                              key={`grid-preview-${index}`}
                              className={`pose-grid-preview-cell ${gridPreviewRegions.length > 200 ? "dense" : ""}`}
                              aria-label={`Grid preview crop ${index + 1}`}
                              style={{
                                left: `${(100 * region.rectPx.x) / sheet.widthPx}%`,
                                top: `${(100 * region.rectPx.y) / sheet.heightPx}%`,
                                width: `${(100 * region.rectPx.w) / sheet.widthPx}%`,
                                height: `${(100 * region.rectPx.h) / sheet.heightPx}%`,
                              }}
                            >
                              <span>{index + 1}</span>
                            </div>
                          ))
                        : sheet.regions.map((region) => {
                            const bounds =
                              dragRect?.id === region.id
                                ? dragRect.rect
                                : region.rectPx;
                            return (
                              <button
                                key={region.id}
                                className={`pose-crop-box ${region.id === poseId ? "selected" : ""} ${region.id === poseId && inspectorTab === "mask" ? "masking" : ""} ${region.hidden ? "hidden-pose" : ""}`}
                                style={{
                                  left: `${(100 * bounds.x) / sheet.widthPx}%`,
                                  top: `${(100 * bounds.y) / sheet.heightPx}%`,
                                  width: `${(100 * bounds.w) / sheet.widthPx}%`,
                                  height: `${(100 * bounds.h) / sheet.heightPx}%`,
                                }}
                                aria-label={`Pose ${region.label}`}
                                onClick={() => setPoseId(region.id)}
                                onPointerDown={(event) => {
                                  setPoseId(region.id);
                                  if (
                                    inspectorTab === "mask" &&
                                    region.id === poseId
                                  )
                                    beginMaskStroke(event, region);
                                  else if (inspectorTab !== "mask")
                                    beginCropDrag(event, region, "move");
                                }}
                                onPointerMove={moveCropDrag}
                                onPointerUp={endCropDrag}
                                onPointerCancel={endCropDrag}
                              >
                                <span>{region.label}</span>
                                {(region.maskStrokes.length > 0 ||
                                  (maskDraft &&
                                    maskDrawing.current?.id === region.id)) && (
                                  <svg
                                    className="pose-mask-overlay"
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="none"
                                    aria-hidden="true"
                                  >
                                    {[
                                      ...region.maskStrokes,
                                      ...(maskDraft &&
                                      maskDrawing.current?.id === region.id
                                        ? [maskDraft]
                                        : []),
                                    ].map((stroke, index) => (
                                      <g key={index}>
                                        <polyline
                                          points={stroke.points
                                            .map(
                                              (point) =>
                                                `${point.x * 100},${point.y * 100}`,
                                            )
                                            .join(" ")}
                                          fill="none"
                                          stroke="#ff615f"
                                          strokeWidth={stroke.width * 100}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        {stroke.points.length === 1 && (
                                          <circle
                                            cx={stroke.points[0].x * 100}
                                            cy={stroke.points[0].y * 100}
                                            r={stroke.width * 50}
                                            fill="#ff615f"
                                          />
                                        )}
                                      </g>
                                    ))}
                                  </svg>
                                )}
                                {region.id === poseId &&
                                  inspectorTab !== "mask" && (
                                    <i
                                      role="presentation"
                                      title="Resize crop"
                                      onPointerDown={(event) =>
                                        beginCropDrag(
                                          event as unknown as ReactPointerEvent<HTMLElement>,
                                          region,
                                          "resize",
                                        )
                                      }
                                      onPointerMove={moveCropDrag}
                                      onPointerUp={endCropDrag}
                                    />
                                  )}
                              </button>
                            );
                          })}
                    </div>
                  ) : (
                    <div className="pose-combo-stage">
                      <canvas
                        ref={previewCanvas}
                        width={640}
                        height={640}
                        aria-label="Live pose combo preview"
                      />
                      <div className="pose-combo-overlay">
                        <span>{combo?.name}</span>
                        <small>
                          {activeStep
                            ? `Pose ${sheet.regions.find((item) => item.id === activeStep.poseId)?.label ?? "?"} · ${activeStep.stepIndex + 1}/${combo?.steps.length}`
                            : "Preview"}
                        </small>
                      </div>
                    </div>
                  )}
                </div>
                <aside className="pose-inspector">
                  <div
                    className="pose-inspector-tabs"
                    role="tablist"
                    aria-label="Inspector"
                  >
                    {mode === "crops" ? (
                      <>
                        <button
                          role="tab"
                          aria-selected={inspectorTab === "crop"}
                          onClick={() => setInspectorTab("crop")}
                        >
                          Crop
                        </button>
                        <button
                          role="tab"
                          aria-selected={inspectorTab === "mask"}
                          onClick={() => setInspectorTab("mask")}
                        >
                          Erase
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          role="tab"
                          aria-selected={inspectorTab === "action"}
                          onClick={() => setInspectorTab("action")}
                        >
                          Action
                        </button>
                        <button
                          role="tab"
                          aria-selected={inspectorTab === "sequence"}
                          onClick={() => setInspectorTab("sequence")}
                        >
                          Sequence
                        </button>
                      </>
                    )}
                  </div>
                  {mode === "crops" && inspectorTab === "crop" ? (
                    pose ? (
                      <>
                        <div className="pose-inspector-heading">
                          <label className="pose-label-field">
                            Pose label
                            <input
                              aria-label="Pose label"
                              value={pose.label}
                              onChange={(event) =>
                                updatePose({ label: event.currentTarget.value })
                              }
                            />
                          </label>
                          <select
                            aria-label="Pose review status"
                            value={pose.reviewStatus}
                            onChange={(event) =>
                              updatePose({
                                reviewStatus: event.currentTarget
                                  .value as PoseRegion["reviewStatus"],
                              })
                            }
                          >
                            <option value="unreviewed">Unreviewed</option>
                            <option value="approved">Approved</option>
                            <option value="needs-fix">Needs fix</option>
                          </select>
                        </div>
                        <label>
                          Pose name
                          <input
                            aria-label="Pose name"
                            value={pose.name}
                            onChange={(event) =>
                              updatePose({ name: event.currentTarget.value })
                            }
                            placeholder="e.g. arms up"
                          />
                        </label>
                        <div className="pose-crop-preview">
                          <canvas
                            ref={cropPreviewCanvas}
                            aria-label={`Transparent crop preview ${pose.label}`}
                          />
                        </div>
                        <div className="pose-source-view-control">
                          <strong>Image inside crop</strong>
                          <label>
                            Zoom{" "}
                            <output>{pose.sourceView.zoom.toFixed(1)}×</output>
                            <input
                              aria-label="Crop image zoom"
                              type="range"
                              min="1"
                              max="6"
                              step="0.05"
                              value={pose.sourceView.zoom}
                              onChange={(event) =>
                                updatePose({
                                  sourceView: {
                                    ...pose.sourceView,
                                    zoom: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Pan X
                            <input
                              aria-label="Crop image pan X"
                              type="range"
                              min="-1"
                              max="1"
                              step="0.01"
                              value={pose.sourceView.panX}
                              onChange={(event) =>
                                updatePose({
                                  sourceView: {
                                    ...pose.sourceView,
                                    panX: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Pan Y
                            <input
                              aria-label="Crop image pan Y"
                              type="range"
                              min="-1"
                              max="1"
                              step="0.01"
                              value={pose.sourceView.panY}
                              onChange={(event) =>
                                updatePose({
                                  sourceView: {
                                    ...pose.sourceView,
                                    panY: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <button
                            onClick={() =>
                              updatePose({
                                sourceView: { zoom: 1, panX: 0, panY: 0 },
                              })
                            }
                          >
                            Reset image framing
                          </button>
                        </div>
                        <div className="pose-coordinate-grid">
                          <label>
                            X
                            <input
                              aria-label="Crop X"
                              type="number"
                              min="0"
                              max={sheet.widthPx - pose.rectPx.w}
                              value={Math.round(pose.rectPx.x)}
                              onChange={(event) =>
                                updatePose({
                                  rectPx: {
                                    ...pose.rectPx,
                                    x: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Y
                            <input
                              aria-label="Crop Y"
                              type="number"
                              min="0"
                              max={sheet.heightPx - pose.rectPx.h}
                              value={Math.round(pose.rectPx.y)}
                              onChange={(event) =>
                                updatePose({
                                  rectPx: {
                                    ...pose.rectPx,
                                    y: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Width
                            <input
                              aria-label="Crop width"
                              type="number"
                              min="1"
                              max={sheet.widthPx - pose.rectPx.x}
                              value={Math.round(pose.rectPx.w)}
                              onChange={(event) =>
                                updatePose({
                                  rectPx: {
                                    ...pose.rectPx,
                                    w: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Height
                            <input
                              aria-label="Crop height"
                              type="number"
                              min="1"
                              max={sheet.heightPx - pose.rectPx.y}
                              value={Math.round(pose.rectPx.h)}
                              onChange={(event) =>
                                updatePose({
                                  rectPx: {
                                    ...pose.rectPx,
                                    h: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="pose-anchor-control">
                          <strong>Registration anchor</strong>
                          <small>
                            Where the pose meets the ground or pivots.
                          </small>
                          <label>
                            X{" "}
                            <input
                              aria-label="Anchor X"
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={pose.anchor.x}
                              onChange={(event) =>
                                updatePose({
                                  anchor: {
                                    ...pose.anchor,
                                    x: +event.target.value,
                                  },
                                })
                              }
                            />
                            {Math.round(pose.anchor.x * 100)}%
                          </label>
                          <label>
                            Y{" "}
                            <input
                              aria-label="Anchor Y"
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={pose.anchor.y}
                              onChange={(event) =>
                                updatePose({
                                  anchor: {
                                    ...pose.anchor,
                                    y: +event.target.value,
                                  },
                                })
                              }
                            />
                            {Math.round(pose.anchor.y * 100)}%
                          </label>
                          <label>
                            Scale{" "}
                            <input
                              aria-label="Pose preview scale"
                              type="range"
                              min="0.25"
                              max="2"
                              step="0.01"
                              value={pose.registration.scale}
                              onChange={(event) =>
                                updatePose({
                                  registration: {
                                    ...pose.registration,
                                    scale: +event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Rotation{" "}
                            <input
                              aria-label="Pose preview rotation"
                              type="number"
                              min="-360"
                              max="360"
                              value={pose.registration.rotationDeg}
                              onChange={(event) =>
                                updatePose({
                                  registration: {
                                    ...pose.registration,
                                    rotationDeg: +event.target.value,
                                  },
                                })
                              }
                            />{" "}
                            deg
                          </label>
                        </div>
                        <label>
                          Tags
                          <input
                            aria-label="Pose tags"
                            value={pose.tags.join(", ")}
                            placeholder="idle, step-left, arms-up"
                            onChange={(event) =>
                              updatePose({
                                tags: [
                                  ...new Set(
                                    event.target.value
                                      .split(",")
                                      .map((tag) => tag.trim())
                                      .filter(Boolean),
                                  ),
                                ],
                              })
                            }
                          />
                        </label>
                        <div className="pose-inline-actions">
                          <button
                            onClick={() => updatePose({ hidden: !pose.hidden })}
                          >
                            {pose.hidden ? "Show pose" : "Hide pose"}
                          </button>
                          <button
                            className="pose-danger"
                            onClick={() => {
                              if (sheet.regions.length <= 1) {
                                setNotice(
                                  "Keep at least one pose on this sheet.",
                                );
                                return;
                              }
                              if (
                                library.combos.some(
                                  (action) =>
                                    action.sheetId === sheet.id &&
                                    action.steps.some(
                                      (step) => step.poseId === pose.id,
                                    ),
                                )
                              ) {
                                setNotice(
                                  "Remove this pose from its action combos before deleting the crop.",
                                );
                                return;
                              }
                              updateLibrary((draft) => {
                                draft.sheets.find(
                                  (item) => item.id === sheet.id,
                                )!.regions = sheet.regions.filter(
                                  (region) => region.id !== pose.id,
                                );
                              });
                              setPoseId(
                                sheet.regions.find(
                                  (item) => item.id !== pose.id,
                                )!.id,
                              );
                            }}
                          >
                            Delete crop
                          </button>
                        </div>
                      </>
                    ) : null
                  ) : mode === "combo" && inspectorTab === "action" ? (
                    <>
                      <div className="pose-inspector-heading">
                        <strong>{combo?.name}</strong>
                      </div>
                      {combo && (
                        <>
                          <label>
                            Action name
                            <input
                              aria-label="Action name"
                              value={combo.name}
                              onChange={(event) =>
                                updateCombo((draft) => {
                                  draft.name = event.target.value;
                                })
                              }
                            />
                          </label>
                          <label>
                            Playback speed{" "}
                            <output>{combo.speed.toFixed(2)}×</output>
                            <input
                              aria-label="Playback speed"
                              type="range"
                              min="0.25"
                              max="3"
                              step="0.05"
                              value={combo.speed}
                              onChange={(event) => {
                                playOrigin.current = playheadMs;
                                playStart.current = performance.now();
                                updateCombo((draft) => {
                                  draft.speed = +event.target.value;
                                });
                              }}
                            />
                          </label>
                          <label className="pose-checkbox">
                            <input
                              aria-label="Loop action"
                              type="checkbox"
                              checked={combo.loop}
                              onChange={(event) =>
                                updateCombo((draft) => {
                                  draft.loop = event.target.checked;
                                })
                              }
                            />{" "}
                            Loop
                          </label>
                          <strong>
                            Total {(duration / 1000).toFixed(2)} s
                          </strong>
                          <label>
                            Preview position{" "}
                            <input
                              aria-label="Preview position"
                              type="range"
                              min="0"
                              max={Math.max(1, Math.round(duration))}
                              value={Math.min(playheadMs, duration)}
                              onChange={(event) => {
                                setPlaying(false);
                                playStart.current = undefined;
                                setPlayheadMs(+event.target.value);
                              }}
                            />
                          </label>
                          <div className="pose-play-controls">
                            <button
                              onClick={() => {
                                if (playing) {
                                  playOrigin.current = playheadMs;
                                  playStart.current = undefined;
                                  setPlaying(false);
                                } else {
                                  if (!combo.loop && playheadMs >= duration) {
                                    playOrigin.current = 0;
                                    setPlayheadMs(0);
                                  } else playOrigin.current = playheadMs;
                                  playStart.current = undefined;
                                  setPlaying(true);
                                }
                              }}
                            >
                              {playing ? "Pause" : "Play"}
                            </button>
                            <button
                              onClick={() => {
                                setPlayheadMs(0);
                                playOrigin.current = 0;
                                playStart.current = undefined;
                              }}
                            >
                              Restart
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                  {mode === "crops" && inspectorTab === "mask" && pose && (
                    <div className="pose-mask-controls">
                      <strong>Erase from this pose</strong>
                      <p>
                        Paint inside the selected crop. Erased pixels stay
                        transparent in the pose preview.
                      </p>
                      <div className="pose-mask-preview">
                        <canvas
                          ref={cropPreviewCanvas}
                          aria-label={`Erase unwanted pixels from pose ${pose.label}`}
                          onPointerDown={(event) =>
                            beginMaskStroke(event, pose)
                          }
                          onPointerMove={moveCropDrag}
                          onPointerUp={endCropDrag}
                          onPointerCancel={endCropDrag}
                        />
                      </div>
                      <label>
                        Eraser size{" "}
                        <output>{Math.round(maskBrush * 100)}%</output>
                        <input
                          aria-label="Eraser size"
                          type="range"
                          min="0.015"
                          max="0.25"
                          step="0.005"
                          value={maskBrush}
                          onChange={(event) =>
                            setMaskBrush(+event.target.value)
                          }
                        />
                      </label>
                      <div className="pose-inline-actions">
                        <button
                          disabled={!pose.maskStrokes.length}
                          onClick={() =>
                            updatePose({
                              maskStrokes: pose.maskStrokes.slice(0, -1),
                            })
                          }
                        >
                          Undo erase
                        </button>
                        <button
                          className="pose-danger"
                          disabled={!pose.maskStrokes.length}
                          onClick={() => updatePose({ maskStrokes: [] })}
                        >
                          Clear mask
                        </button>
                      </div>
                      <small>
                        {pose.maskStrokes.length} erase strokes · select the
                        crop, then drag over the unwanted pixels.
                      </small>
                    </div>
                  )}
                  {mode === "combo" &&
                    inspectorTab === "sequence" &&
                    sequencePanel}
                </aside>
              </div>
              {mode === "crops" ? (
                <section className="pose-crop-footer">
                  <div className="pose-grid-tools">
                    <strong>Define pose crops</strong>
                    <label>
                      Columns
                      <input
                        aria-label="Grid columns"
                        type="number"
                        min="1"
                        max="1000"
                        value={columns}
                        onChange={(event) => {
                          setColumns(Math.max(1, +event.target.value));
                          setShowGridPreview(true);
                        }}
                      />
                    </label>
                    <label>
                      Rows
                      <input
                        aria-label="Grid rows"
                        type="number"
                        min="1"
                        max="1000"
                        value={rows}
                        onChange={(event) => {
                          setRows(Math.max(1, +event.target.value));
                          setShowGridPreview(true);
                        }}
                      />
                    </label>
                    <button onClick={createGrid}>
                      Apply grid · {columns * rows}
                    </button>
                    <button onClick={addManualRegion}>＋ Manual crop</button>
                    <button
                      onClick={() => {
                        const region = makePose(
                          String(sheet.regions.length + 1),
                          { x: 0, y: 0, w: sheet.widthPx, h: sheet.heightPx },
                        );
                        updateLibrary((draft) => {
                          draft.sheets
                            .find((item) => item.id === sheet.id)!
                            .regions.push(region);
                        });
                        setPoseId(region.id);
                      }}
                    >
                      ＋ Full image pose
                    </button>
                    <button
                      className="pose-advanced-button"
                      aria-expanded={showGridOptions}
                      onClick={() => setShowGridOptions((value) => !value)}
                    >
                      Grid settings
                    </button>
                  </div>
                  {showGridOptions && (
                    <div className="pose-grid-advanced">
                      <small>
                        Grid cells are proposals. You can resize, move and save
                        every crop separately.
                      </small>
                      {(
                        ["marginX", "marginY", "gutterX", "gutterY"] as const
                      ).map((key) => (
                        <label key={key}>
                          {key.replace(/([A-Z])/g, " $1")}
                          <input
                            aria-label={`Grid ${key.replace(/([A-Z])/g, " $1")}`}
                            type="number"
                            min="0"
                            value={gridMargins[key]}
                            onChange={(event) => {
                              setGridMargins((current) => ({
                                ...current,
                                [key]: Math.max(0, +event.target.value),
                              }));
                              setShowGridPreview(true);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="pose-crop-status">
                    {showGridPreview && gridPreviewRegions.length > 0
                      ? `Preview: ${columns} × ${rows} = ${gridPreviewRegions.length} crops. Apply grid to edit each crop.`
                      : showGridPreview
                        ? "This grid does not fit the source image. Adjust rows, columns or grid settings."
                        : `${sheet.regions.length} crops · ${sheet.sourceName} stays one source image`}
                  </div>
                </section>
              ) : (
                <>{timelinePanel}</>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
