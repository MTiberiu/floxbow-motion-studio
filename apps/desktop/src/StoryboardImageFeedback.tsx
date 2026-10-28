import { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { Representation, Storyboard, StorySet } from "@motion/project-loader/storyboard";
import { StoryboardCompositionImage } from "./StoryboardCompositionImage";
import { imageBoundsInComposition, compositionPointToImage, imagePathData, smoothImagePath, type ImagePoint } from "./storyboard-annotation-geometry";

type MarkKind = "point" | "line" | "polyline" | "polygon" | "rectangle";
type StoredAnnotation = Storyboard["annotations"][number];
const snapDistance = 2.4;

function pointPin([x, y]: ImagePoint, size = 1.8) {
  return `M${x} ${y + size * 1.8} C${x - size * 0.1} ${y + size * 1.45} ${x - size} ${y + size * 0.25} ${x - size} ${y - size * 0.45} A${size} ${size} 0 1 1 ${x + size} ${y - size * 0.45} C${x + size} ${y + size * 0.25} ${x + size * 0.1} ${y + size * 1.45} ${x} ${y + size * 1.8} Z`;
}

export function StoryboardImageFeedback({ doc, set, target, annotations, manifest, images, onCreate, onDelete }: {
  doc: Storyboard; set: StorySet; target: Representation; annotations: StoredAnnotation[];
  manifest: ProjectManifest; images: Record<string, HTMLImageElement>;
  onCreate: (annotation: { kind: MarkKind; points: ImagePoint[]; label: string; instruction: string; color: string; strokeWidth: number; objectId: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [kind, setKind] = useState<MarkKind>("point");
  const [drawingMode, setDrawingMode] = useState<"clicks" | "freehand">("clicks");
  const [label, setLabel] = useState("");
  const [objectId, setObjectId] = useState(target.objectId ?? "");
  const [instruction, setInstruction] = useState("");
  const [draftPoints, setDraftPointsState] = useState<ImagePoint[]>([]);
  const draftPointsRef = useRef<ImagePoint[]>([]);
  const [color, setColor] = useState("#ffb52e");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [stabilizer, setStabilizer] = useState(1);
  const [dragStart, setDragStart] = useState<ImagePoint | null>(null);
  const [previewPoint, setPreviewPoint] = useState<ImagePoint | null>(null);
  const [closed, setClosed] = useState(false);
  const [geometryReady, setGeometryReady] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState("");
  const clipId = useId().replace(/:/g, "");
  const scene = doc.scenes.find(item => item.sets.some(candidate => candidate.id === set.id));
  const targetObject = scene?.objects.find(item => item.id === target.objectId);
  useEffect(() => { setObjectId(target.objectId ?? ""); }, [target.id, target.objectId]);

  function setDraftPoints(points: ImagePoint[]) {
    draftPointsRef.current = points;
    setDraftPointsState(points);
  }
  function resetDraft() {
    setDraftPoints([]);
    setDragStart(null);
    setPreviewPoint(null);
    setClosed(false);
    setGeometryReady(false);
  }
  function imagePoint(event: ReactPointerEvent<SVGSVGElement>): ImagePoint | null {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const px = (event.clientX - bounds.left) / bounds.width * 100;
    const py = (event.clientY - bounds.top) / bounds.height * 100;
    const source = images[target.referenceId ?? ""];
    const reference = doc.references.find(item => item.id === target.referenceId);
    const imageWidth = source?.naturalWidth || reference?.width;
    const imageHeight = source?.naturalHeight || reference?.height;
    if (!imageWidth || !imageHeight) return null;
    const point = compositionPointToImage(target, [px, py], imageWidth, imageHeight, manifest.width, manifest.height, target.imageFit ?? "contain");
    return point && point.every(value => value >= 0 && value <= 100) ? [point[0], point[1]] : null;
  }
  function completeGesture(points: ImagePoint[]) {
    if (points.length < (kind === "rectangle" || kind === "line" || kind === "polyline" ? 2 : 3)) return;
    const closedArea = kind === "polygon";
    setDraftPoints(smoothImagePath(points, stabilizer, closedArea));
    setClosed(closedArea);
    setDragStart(null);
    setPreviewPoint(null);
    setGeometryReady(true);
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const point = imagePoint(event);
    if (!point) return;
    if (kind === "point") {
      setDraftPoints([point]);
      setGeometryReady(true);
      return;
    }
    if (kind === "polygon" && drawingMode === "clicks" && draftPointsRef.current.length >= 3) {
      const first = draftPointsRef.current[0];
      if (Math.hypot(first[0] - point[0], first[1] - point[1]) <= snapDistance) {
        setClosed(true);
        setGeometryReady(true);
        return;
      }
    }
    if (kind === "rectangle" || drawingMode === "freehand") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragStart(point);
      setPreviewPoint(point);
      setDraftPoints([point]);
      setGeometryReady(false);
      setClosed(false);
      return;
    }
    const next = [...draftPointsRef.current, point].slice(0, 500);
    setDraftPoints(next);
    setGeometryReady(kind === "line" && next.length >= 2);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = imagePoint(event);
    if (!point) {
      if (dragStart && (kind === "rectangle" || drawingMode === "freehand")) return;
      setPreviewPoint(null);
      return;
    }
    if (dragStart && (kind === "rectangle" || drawingMode === "freehand")) {
      setPreviewPoint(point);
      if (drawingMode === "freehand" && kind !== "rectangle") {
        const current = draftPointsRef.current;
        const last = current.at(-1);
        if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= 0.28) {
          setDraftPoints([...current, point].slice(-240));
        }
      }
    } else if ((kind === "polygon" || kind === "polyline") && draftPointsRef.current.length) {
      setPreviewPoint(point);
    }
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragStart) return;
    const point = imagePoint(event);
    const finalPoint = point ?? previewPoint;
    if (!finalPoint) { setDragStart(null); setPreviewPoint(null); return; }
    if (kind === "rectangle") completeGesture([dragStart, finalPoint]);
    else completeGesture([...draftPointsRef.current, finalPoint]);
  }
  function finishPath() {
    if (kind === "polygon") {
      if (draftPointsRef.current.length < 3) return;
      setClosed(true);
      setGeometryReady(true);
      setDraftPoints(smoothImagePath(draftPointsRef.current, stabilizer, true));
    } else if (kind === "polyline" && draftPointsRef.current.length >= 2) {
      setDraftPoints(smoothImagePath(draftPointsRef.current, stabilizer, false));
      setGeometryReady(true);
    }
  }
  function saveFeedback() {
    if (!geometryReady || !instruction.trim()) return;
    const points = draftPointsRef.current;
    onCreate({ kind, points, label: label.trim() || (kind === "point" ? "Location" : "Direction"), instruction: instruction.trim(), color, strokeWidth, objectId: objectId || null });
    setInstruction("");
    setLabel("");
    setSelectedAnnotationId("");
    resetDraft();
  }
  function handleKindChange(next: MarkKind) {
    setKind(next);
    setDrawingMode("clicks");
    resetDraft();
  }
  function renderMark(annotation: StoredAnnotation, isSelected = false) {
    const width = (annotation.strokeWidth ?? 4) * (isSelected ? 1.5 : 1);
    const path = imagePathData(annotation.points, annotation.kind === "polygon");
    if (annotation.kind === "point") {
      const [x, y] = annotation.points[0];
      return <g key={annotation.id} className={`sb-feedback-mark ${isSelected ? "selected" : ""}`} onPointerDown={event => { event.stopPropagation(); setSelectedAnnotationId(annotation.id); }}>
        <path d={pointPin([x, y])} fill={annotation.color} stroke={annotation.color} strokeWidth={width / 8} />
        <circle cx={x} cy={y - .42} r=".45" fill="#17191e" stroke="#fff" strokeWidth=".22" />
        <title>{annotation.label}: {annotation.instruction}</title>
      </g>;
    }
    if (annotation.kind === "rectangle") {
      const xs = annotation.points.map(point => point[0]), ys = annotation.points.map(point => point[1]);
      return <g key={annotation.id} className={`sb-feedback-mark ${isSelected ? "selected" : ""}`} onPointerDown={event => { event.stopPropagation(); setSelectedAnnotationId(annotation.id); }}>
        <rect x={Math.min(...xs)} y={Math.min(...ys)} width={Math.max(...xs) - Math.min(...xs)} height={Math.max(...ys) - Math.min(...ys)} stroke={annotation.color} strokeWidth={width / 10} fill="none" />
        <title>{annotation.label}: {annotation.instruction}</title>
      </g>;
    }
    return <g key={annotation.id} className={`sb-feedback-mark ${isSelected ? "selected" : ""}`} onPointerDown={event => { event.stopPropagation(); setSelectedAnnotationId(annotation.id); }}>
      <path d={path} stroke={annotation.color} strokeWidth={width / 10} fill={annotation.kind === "polygon" ? `${annotation.color}26` : "none"} />
      <title>{annotation.label}: {annotation.instruction}</title>
    </g>;
  }

  const closable = kind === "polygon" && draftPoints.length >= 3 && !closed;
  const canFinishOpenPath = kind === "polyline" && draftPoints.length >= 2 && !geometryReady;
  const draftPath = imagePathData(draftPoints, closed);
  const selected = annotations.find(annotation => annotation.id === selectedAnnotationId);
  const source = images[target.referenceId ?? ""];
  const reference = doc.references.find(item => item.id === target.referenceId);
  const imageWidth = source?.naturalWidth || reference?.width;
  const imageHeight = source?.naturalHeight || reference?.height;
  const imageBounds = imageWidth && imageHeight
    ? imageBoundsInComposition(target, imageWidth, imageHeight, manifest.width, manifest.height, target.imageFit ?? "contain")
    : { x: target.x, y: target.y, width: target.width, height: target.height };
  const compositionWidth = `${68 * manifest.width / manifest.height}vh`;
  return <div className="sb-markup-mode">
    <div className="sb-markup-instructions"><strong>Image feedback</strong><span>The mark uses this image for exact coordinates and is linked to the selected story element.</span><small>Image layer: {target.layerName || target.id} · {target.id}</small><small>Element: {targetObject ? `${targetObject.name} · ${targetObject.id}` : "No story object selected"}</small></div>
    <div className="sb-markup-controls">
      <label>Apply to element<select aria-label="Annotation story element" value={objectId} onChange={event => setObjectId(event.target.value)}><option value="">Shot direction / no specific element</option>{scene?.objects.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>
      <label>Mark type<select value={kind} onChange={event => handleKindChange(event.target.value as MarkKind)}><option value="point">Point / location pin</option><option value="line">Line</option><option value="polyline">Smooth path</option><option value="polygon">Closed area / mask</option><option value="rectangle">Rectangle</option></select></label>
      {kind !== "point" && kind !== "rectangle" && <label>Drawing method<select value={drawingMode} onChange={event => { setDrawingMode(event.target.value as "clicks" | "freehand"); resetDraft(); }}><option value="clicks">Point to point</option><option value="freehand">Freehand drag</option></select></label>}
      <label>Label<input value={label} onChange={event => setLabel(event.target.value)} placeholder="Water, heart, character…" /></label>
      <label>Border<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <label className="sb-markup-range">Width<input type="range" min="1" max="16" value={strokeWidth} onChange={event => setStrokeWidth(+event.target.value)} /><small>{strokeWidth}px</small></label>
      {drawingMode === "freehand" && kind !== "point" && kind !== "rectangle" && <label className="sb-markup-range">Smooth<input type="range" min="0" max="2" step="1" value={stabilizer} onChange={event => setStabilizer(+event.target.value)} /><small>{stabilizer}</small></label>}
      {closable && <button onClick={finishPath}>Close area</button>}
      {canFinishOpenPath && <button onClick={finishPath}>Finish path</button>}
      {geometryReady && <button className="sb-markup-save" disabled={!instruction.trim()} onClick={saveFeedback}>Save feedback</button>}
      <label className="sb-markup-feedback">What should the Director change here?<input value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Add a water effect inside this area" /></label>
      <small className="sb-markup-help">{kind === "point" ? "Click once to place a pin." : kind === "rectangle" ? "Drag and release to place the rectangle." : kind === "polygon" ? "Click to add corners, then Close area—or click near the first point to close it." : drawingMode === "freehand" ? "Drag a line; the smooth control stabilizes and rounds the path." : "Click to add points, then finish the path."}</small>
    </div>
    <div className="sb-shot-composition sb-markup-composition" style={{ aspectRatio: `${manifest.width} / ${manifest.height}`, width: `min(100%, ${compositionWidth})` }}>
      <StoryboardCompositionImage doc={doc} set={set} manifest={manifest} images={images} className="sb-shot-full-image" includeAnnotations={false} />
      <svg className="sb-markup-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Image markup drawing area"
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
        onDoubleClick={() => { if (kind === "polygon" || kind === "polyline") finishPath(); }}>
        <defs><clipPath id={clipId}><rect x={target.x} y={target.y} width={target.width} height={target.height}/></clipPath></defs>
        <g clipPath={`url(#${clipId})`} transform={`rotate(${target.rotation} ${target.x + target.width / 2} ${target.y + target.height / 2})`}>
          <rect x={imageBounds.x} y={imageBounds.y} width={imageBounds.width} height={imageBounds.height} className="sb-markup-target-outline" />
          <g transform={`translate(${imageBounds.x} ${imageBounds.y}) scale(${imageBounds.width / 100} ${imageBounds.height / 100})`}>
            {annotations.filter(item => item.targetRepresentationId === target.id).map(item => renderMark(item, item.id === selectedAnnotationId))}
            {draftPoints.length > 0 && <g className="sb-markup-draft-group" stroke={color} strokeWidth={strokeWidth / 9} strokeLinecap="round" strokeLinejoin="round">
              {kind === "point" && <><path d={pointPin(draftPoints[0])} fill={color} stroke={color} strokeWidth={strokeWidth / 8} /><circle cx={draftPoints[0][0]} cy={draftPoints[0][1] - .42} r=".45" fill="#17191e" stroke="#fff" strokeWidth=".22" /></>}
              {kind === "rectangle" && (previewPoint || geometryReady && draftPoints[1]) && <rect x={Math.min(draftPoints[0][0], (previewPoint || draftPoints[1])[0])} y={Math.min(draftPoints[0][1], (previewPoint || draftPoints[1])[1])} width={Math.abs(draftPoints[0][0] - (previewPoint || draftPoints[1])[0])} height={Math.abs(draftPoints[0][1] - (previewPoint || draftPoints[1])[1])} fill={`${color}20`} />}
              {(kind === "line" || kind === "polyline" || kind === "polygon") && <path d={draftPath + (!closed && previewPoint && !geometryReady ? ` L${previewPoint[0]} ${previewPoint[1]}` : "")} fill={closed ? `${color}26` : "none"} />}
              {kind === "polygon" && draftPoints.length >= 3 && !closed && <circle cx={draftPoints[0][0]} cy={draftPoints[0][1]} r="1.2" className="sb-markup-snap-target" />}
            </g>}
          </g>
        </g>
      </svg>
    </div>
    {selected && <div className="sb-markup-selected"><span>Selected: <strong>{selected.label}</strong> — {selected.instruction}</span><button onClick={() => { onDelete(selected.id); setSelectedAnnotationId(""); }}>Delete mark</button></div>}
    {annotations.filter(item => item.targetRepresentationId === target.id).length > 0 && <div className="sb-markup-list"><strong>Feedback on this image</strong>{annotations.filter(item => item.targetRepresentationId === target.id).map(item => { const object = scene?.objects.find(candidate => candidate.id === item.objectId); return <div key={item.id} className={item.id === selectedAnnotationId ? "selected" : ""}><button className="sb-markup-select" onClick={() => setSelectedAnnotationId(item.id)}><b>{item.label}</b><small>{item.instruction}</small><small>Element: {object ? `${object.name} · ${object.id}` : "Shot direction"} · {item.kind} · {item.strokeWidth ?? 4}px</small></button><button aria-label={`Delete annotation ${item.label}`} onClick={() => { onDelete(item.id); if (selectedAnnotationId === item.id) setSelectedAnnotationId(""); }}>×</button></div>; })}</div>}
  </div>;
}
