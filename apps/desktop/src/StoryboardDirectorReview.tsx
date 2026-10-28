import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { Representation, StoryScene, StorySet, Storyboard } from "@motion/project-loader/storyboard";
import { StoryboardCompositionImage } from "./StoryboardCompositionImage";
import { StoryboardImageFeedback } from "./StoryboardImageFeedback";
import { imageBoundsInComposition } from "@motion/project-loader/storyboard";
import { getStoryboardDirectiveCoverage } from "@motion/project-loader/storyboard-collaboration";

function formatTime(seconds: number | null) {
  return seconds === null ? "Time not set" : `${seconds.toFixed(1)}s`;
}

function shotReferenceId(doc: Storyboard, shot: StorySet) {
  return shot.referenceImageId
    ?? shot.referenceIds.find(id => doc.references.find(reference => reference.id === id)?.role === "shot-image")
    ?? shot.representations.find(layer => layer.kind === "reference" && layer.referenceId)?.referenceId
    ?? null;
}

export function StoryboardDirectorReview({
  doc, manifest, scene, set, selectedRepresentation, images, assetDrift,
  onSelectScene, onSelectShot, onSelectLayer, onEditScene, onEditShot, onEditLayer,
  onExportShot, onManualCreateScene, onManualCreateShot, drawingEditor, manualTools,
  onCreateAnnotation, onDeleteAnnotation, onSetReferenceImage, onDuplicateLayer,
}: {
  doc: Storyboard; manifest: ProjectManifest; scene?: StoryScene; set?: StorySet;
  selectedRepresentation?: Representation; images: Record<string, HTMLImageElement>; assetDrift: string[];
  onSelectScene: (id: string) => void; onSelectShot: (id: string) => void; onSelectLayer: (id: string) => void;
  onEditScene: (patch: Partial<StoryScene>) => void;
  onEditShot: (patch: Partial<StorySet>) => void;
  onEditLayer: (patch: Partial<Representation>) => void;
  onExportShot: () => void; onManualCreateScene: () => void; onManualCreateShot: () => void;
  drawingEditor: ReactNode; manualTools: ReactNode;
  onCreateAnnotation: (annotation: { kind: "point" | "line" | "polyline" | "polygon" | "rectangle"; points: [number, number][]; label: string; instruction: string; color: string; strokeWidth: number; objectId: string | null }) => void;
  onDeleteAnnotation: (id: string) => void;
  onSetReferenceImage: (id: string | null) => void;
  onDuplicateLayer: () => void;
}) {
  const [mode, setMode] = useState<"reference" | "composition" | "position" | "markup" | "draw">("composition");
  const [inspectorTab, setInspectorTab] = useState<"shot" | "element">("shot");
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const compositionRef = useRef<HTMLDivElement>(null);
  const placementDrag = useRef<{ pointerId: number; action: "move" | "resize"; start: [number, number]; origin: Pick<Representation, "x" | "y" | "width" | "height"> } | null>(null);
  const [placementDraft, setPlacementDraft] = useState<Pick<Representation, "x" | "y" | "width" | "height"> | null>(null);
  const primaryReferenceId = set ? shotReferenceId(doc, set) : null;
  const primaryReference = primaryReferenceId ? doc.references.find(item => item.id === primaryReferenceId) : undefined;
  const primaryReferenceImage = primaryReferenceId ? images[primaryReferenceId] : undefined;
  useEffect(() => { setMode(primaryReferenceId ? "reference" : "composition"); setPlacementDraft(null); placementDrag.current = null; }, [scene?.id, set?.id]);
  const shots = scene?.sets ?? [];
  const story = doc.scenes.map(item => item.description.trim()).filter(Boolean).join(" ");
  const styles = [...new Set(doc.scenes.map(item => item.style.trim()).filter(Boolean))];
  const duration = doc.scenes.reduce((filmEnd, item) => Math.max(filmEnd, ...item.sets.map(shot => shot.start !== null && shot.duration !== null ? shot.start + shot.duration : item.duration ?? 0)), 0);
  const reference = selectedRepresentation?.referenceId ? doc.references.find(item => item.id === selectedRepresentation.referenceId) : undefined;
  const referenceImage = reference ? images[reference.id] : undefined;
  const sourceWidth = referenceImage?.naturalWidth ?? reference?.width;
  const sourceHeight = referenceImage?.naturalHeight ?? reference?.height;
  const resetImageBounds = selectedRepresentation && reference && selectedRepresentation.kind === "reference" && sourceWidth && sourceHeight
    ? imageBoundsInComposition({ x: 0, y: 0, width: 100, height: 100 }, sourceWidth, sourceHeight, manifest.width, manifest.height, "contain")
    : undefined;
  const referenceChanged = !!reference && assetDrift.includes(reference.id);
  const visibleImages = set?.representations.filter(item => item.visible && (item.kind === "reference" || item.referenceId)) ?? [];
  const flattened = visibleImages.length === 1 && (set?.representations.filter(item => item.visible).length ?? 0) === 1;
  const markupTarget = selectedRepresentation?.referenceId && set?.representations.some(item => item.id === selectedRepresentation.id && item.kind === "reference") ? selectedRepresentation : undefined;
  const currentAnnotations = doc.annotations.filter(item => !!set && item.setId === set.id);
  const implementationCoverage = scene && set
    ? getStoryboardDirectiveCoverage(doc, { sceneId: scene.id, setId: set.id })
    : [];
  const implementationOutputs = doc.collaboration
    .filter(message => message.kind === "implementation" && message.sceneId === scene?.id && message.setId === set?.id)
    .flatMap(message => (message.outputs ?? []).map(output => ({
      ...output,
      sourceFiles: message.sourceFiles,
      timelineClipIds: message.timelineClipIds,
      componentIds: message.componentIds,
      message: message.message,
    })));
  const selectedOutput = implementationOutputs.find(output => output.id === selectedOutputId);
  const selectedOutputImage = selectedOutput?.assetReferenceId ? images[selectedOutput.assetReferenceId] : undefined;
  useEffect(() => {
    const firstLayer = set?.representations.find(layer => layer.visible) ?? set?.representations[0];
    if (firstLayer && selectedRepresentation?.setId !== set?.id) onSelectLayer(firstLayer.id);
    setInspectorTab("shot");
  }, [set?.id]);
  function selectLayer(id: string) { onSelectLayer(id); setSelectedOutputId(null); setInspectorTab("element"); }
  function renderOutputChildren(parentId: string, rootLayerId: string, depth = 0): ReactNode {
    return implementationOutputs.filter(output => output.targetElementId === parentId).map(output => {
      const asset = output.assetReferenceId ? doc.references.find(item => item.id === output.assetReferenceId) : undefined;
      const thumbnail = output.assetReferenceId ? images[output.assetReferenceId] : undefined;
      return <div className={`sb-layer-output ${selectedOutputId === output.id ? "selected" : ""}`} key={output.id} style={{ marginLeft: `${Math.min(depth, 3) * 12}px` }}>
        <button onClick={() => { if (set?.representations.some(layer => layer.id === rootLayerId)) onSelectLayer(rootLayerId); setSelectedOutputId(output.id); setInspectorTab("element"); }} aria-pressed={selectedOutputId === output.id}>
          {thumbnail ? <img src={thumbnail.src} alt="" /> : <span className="sb-layer-output-icon">{output.kind === "image" ? "▣" : "◇"}</span>}
          <span><strong>{output.name}</strong><small>{output.kind}{asset ? ` · ${asset.name}` : ""}</small></span>
        </button>
        {renderOutputChildren(output.id, rootLayerId, depth + 1)}
      </div>;
    });
  }
  function compositionPercent(event: { clientX: number; clientY: number }): [number, number] | null {
    const bounds = compositionRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return null;
    return [(event.clientX - bounds.left) / bounds.width * 100, (event.clientY - bounds.top) / bounds.height * 100];
  }
  function startPlacement(event: ReactPointerEvent<SVGElement>, action: "move" | "resize") {
    if (!selectedRepresentation || selectedRepresentation.locked) return;
    const point = compositionPercent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    placementDrag.current = { pointerId: event.pointerId, action, start: point, origin: { x: selectedRepresentation.x, y: selectedRepresentation.y, width: selectedRepresentation.width, height: selectedRepresentation.height } };
    setPlacementDraft(placementDrag.current.origin);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function startLayerDrag(event: ReactPointerEvent<HTMLButtonElement>, layer: Representation) {
    if (event.button !== 0 || layer.locked || mode === "reference" || mode === "markup" || mode === "draw") return;
    selectLayer(layer.id);
    const point = compositionPercent(event);
    if (!point) return;
    event.preventDefault();
    placementDrag.current = { pointerId: event.pointerId, action: "move", start: point, origin: { x: layer.x, y: layer.y, width: layer.width, height: layer.height } };
    setPlacementDraft(placementDrag.current.origin);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePlacement(event: ReactPointerEvent<SVGSVGElement | HTMLButtonElement>) {
    const drag = placementDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = compositionPercent(event);
    if (!point) return;
    const dx = point[0] - drag.start[0], dy = point[1] - drag.start[1];
    if (drag.action === "move") setPlacementDraft({ ...drag.origin, x: Math.max(0, Math.min(100 - drag.origin.width, drag.origin.x + dx)), y: Math.max(0, Math.min(100 - drag.origin.height, drag.origin.y + dy)) });
    else setPlacementDraft({ ...drag.origin, width: Math.max(1, Math.min(100 - drag.origin.x, drag.origin.width + dx)), height: Math.max(1, Math.min(100 - drag.origin.y, drag.origin.height + dy)) });
  }
  function finishPlacement(event: ReactPointerEvent<SVGSVGElement | HTMLButtonElement>) {
    const drag = placementDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = compositionPercent(event);
    if (point && selectedRepresentation) {
      const dx = point[0] - drag.start[0], dy = point[1] - drag.start[1];
      const next = drag.action === "move"
        ? { ...drag.origin, x: Math.max(0, Math.min(100 - drag.origin.width, drag.origin.x + dx)), y: Math.max(0, Math.min(100 - drag.origin.height, drag.origin.y + dy)) }
        : { ...drag.origin, width: Math.max(1, Math.min(100 - drag.origin.x, drag.origin.width + dx)), height: Math.max(1, Math.min(100 - drag.origin.y, drag.origin.height + dy)) };
      onEditLayer(next);
    }
    placementDrag.current = null;
    setPlacementDraft(null);
  }

  return <div className="sb-director-layout">
    <aside className="sb-film-nav">
      <div className="sb-film-overview">
        <span className="sb-eyebrow">FILM OVERVIEW</span>
        <h2>{manifest.name}</h2>
        <p>{story || "The Director has not added a story summary yet."}</p>
        <div className="sb-film-stats"><span>{doc.scenes.length} scenes</span><span>{doc.scenes.reduce((sum, item) => sum + item.sets.length, 0)} shots</span><span>{duration ? `${duration.toFixed(1)}s planned` : "Duration not set"}</span></div>
        {styles.length > 0 && <small>Visual style · {styles.join(" · ")}</small>}
      </div>
      <div className="sb-scene-list-heading"><strong>Scenes & shots</strong><span>{doc.scenes.length}</span></div>
      {doc.scenes.length === 0 ? <div className="sb-nav-empty"><strong>No director plan yet</strong><p>When the Director saves a storyboard in this project, its scenes and shots will appear here.</p></div> : doc.scenes.map((item, sceneIndex) => <section className={`sb-scene-group ${item.id === scene?.id ? "active" : ""}`} key={item.id}>
        <button className="sb-scene-title" onClick={() => onSelectScene(item.id)} aria-pressed={item.id === scene?.id}><span>{String(sceneIndex + 1).padStart(2, "0")}</span><strong>{item.name}</strong><small>{item.duration ? `${item.duration.toFixed(1)}s` : "Scene"}</small></button>
        {item.sets.map((shot, shotIndex) => <button key={shot.id} className={`sb-shot-card ${shot.id === set?.id ? "selected" : ""}`} onClick={() => { onSelectScene(item.id); onSelectShot(shot.id); }} aria-pressed={shot.id === set?.id}>
          <span className="sb-shot-thumb-frame" style={{ width: Math.min(200, 110 * manifest.width / manifest.height), height: Math.min(200, 110 * manifest.width / manifest.height) * manifest.height / manifest.width }}>
            <StoryboardCompositionImage doc={doc} set={shot} manifest={manifest} images={images} className="sb-shot-thumb" />
          </span>
          <span className="sb-shot-card-copy"><strong>{String(shotIndex + 1).padStart(2, "0")} — {shot.name}</strong><small>{shot.description || shot.compositionNote || "Visual beat not described"}</small><small>{formatTime(shot.start)}{shot.duration !== null ? ` · ${shot.duration.toFixed(1)}s` : ""}</small></span>
          <span className={`sb-asset-dot ${shot.representations.length ? "ready" : "missing"}`} title={shot.representations.length ? `${shot.representations.length} visual layers` : "No visual layers prepared"} />
        </button>)}
        {item.sets.length === 0 && <p className="sb-scene-no-shots">No shots prepared for this scene.</p>}
      </section>)}
      <details className="sb-manual-tools-disclosure"><summary>Manual authoring tools</summary><div><p>Optional tools for editing a plan by hand.</p><button onClick={onManualCreateScene}>＋ Add scene manually</button><button disabled={!scene} onClick={onManualCreateShot}>＋ Add shot manually</button></div></details>
    </aside>

    <main className="sb-shot-stage">
      {!set || !scene ? <div className="sb-director-empty"><div className="sb-empty-film-icon">▤</div><h2>{doc.scenes.length ? "Choose a prepared shot" : "Waiting for the Director"}</h2><p>{doc.scenes.length ? "Select a shot on the left to inspect its composition, layers and direction." : "This project does not have a visual plan yet. An external Codex Director can prepare storyboard.json and its image assets directly in the project."}</p></div> : <>
        <header className="sb-shot-stage-heading"><div><span className="sb-eyebrow">{scene.name} · SHOT {String(shots.findIndex(item => item.id === set.id) + 1).padStart(2, "0")}</span><h1>{set.name}</h1></div><div className="sb-shot-stage-actions"><span>{formatTime(set.start)}{set.duration !== null ? ` · ${set.duration.toFixed(1)}s` : ""}</span><button className={mode === "reference" ? "active" : ""} disabled={!primaryReferenceImage} title="View the approved key image for this shot" onClick={() => setMode("reference")}>Reference</button><button className={mode === "composition" || mode === "position" ? "active" : ""} title="View the actual layers prepared for animation" onClick={() => setMode("composition")}>Elements</button><button className={mode === "position" ? "active" : ""} disabled={!selectedRepresentation} title="Move or resize the selected object in the composition" onClick={() => { setMode(mode === "position" ? "composition" : "position"); setPlacementDraft(null); }}>{mode === "position" ? "← Done" : "↔ Position layer"}</button><button className={mode === "markup" ? "active" : ""} disabled={!markupTarget} title={markupTarget ? "Attach a point, line or area directly to this image" : "Select an image layer before adding image markup"} onClick={() => setMode(mode === "markup" ? (primaryReferenceId ? "reference" : "composition") : "markup")}>{mode === "markup" ? "← Done" : "⌖ Annotate image"}</button><button className={mode === "draw" ? "active" : ""} onClick={() => setMode(mode === "draw" ? (primaryReferenceId ? "reference" : "composition") : "draw")} aria-pressed={mode === "draw"}>{mode === "draw" ? "← Done" : "✎ Draw new layer"}</button><button onClick={onExportShot} title="Export this composition as PNG">⇩ PNG</button></div></header>
        {mode === "draw" ? <div className="sb-artwork-edit-mode"><p><strong>New drawing layer.</strong> This creates separate transparent artwork that can be positioned independently from the Director's source image.</p>{drawingEditor}</div> : mode === "markup" && markupTarget ? <StoryboardImageFeedback doc={doc} set={set} target={markupTarget} annotations={currentAnnotations} manifest={manifest} images={images} onCreate={onCreateAnnotation} onDelete={onDeleteAnnotation}/> : <><div ref={compositionRef} className={`sb-shot-composition ${mode === "position" ? "sb-position-mode" : ""}`} style={{ aspectRatio: `${manifest.width} / ${manifest.height}`, width: `min(100%, ${74 * manifest.width / manifest.height}vh)` }}>
          {mode === "reference" && primaryReferenceImage
            ? <img className="sb-approved-shot-reference" src={primaryReferenceImage.src} alt={`${set.name} approved reference`} />
            : <StoryboardCompositionImage doc={doc} set={set} manifest={manifest} images={images} className="sb-shot-full-image" />}
          {mode !== "reference" && set.representations.filter(layer => layer.visible).map(layer => { const bounds = layer.id === selectedRepresentation?.id ? placementDraft : null; return <button key={layer.id} className={`sb-layer-hit-area ${layer.id === selectedRepresentation?.id ? "selected" : ""}`} style={{ left: `${bounds?.x ?? layer.x}%`, top: `${bounds?.y ?? layer.y}%`, width: `${bounds?.width ?? layer.width}%`, height: `${bounds?.height ?? layer.height}%`, transform: `rotate(${layer.rotation}deg)` }} title={`${layer.layerName || layer.id} · drag to move`} aria-label={`Select or move ${layer.layerName || "visual layer"}`} onPointerDown={event => startLayerDrag(event, layer)} onPointerMove={movePlacement} onPointerUp={finishPlacement} onPointerCancel={finishPlacement} onClick={() => selectLayer(layer.id)} />; })}
          {mode === "position" && selectedRepresentation?.visible && <svg className="sb-position-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Position selected layer" onPointerMove={movePlacement} onPointerUp={finishPlacement} onPointerCancel={finishPlacement}>
            {(() => { const bounds = placementDraft ?? selectedRepresentation; return <g><rect className="sb-position-box" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} onPointerDown={event => startPlacement(event, "move")} /><rect className="sb-position-handle" x={bounds.x + bounds.width - 1.2} y={bounds.y + bounds.height - 1.2} width="2.4" height="2.4" onPointerDown={event => startPlacement(event, "resize")} /><text className="sb-position-label" x={bounds.x} y={Math.max(3, bounds.y - 1)}>{selectedRepresentation.layerName || "Layer"} · {Math.round(bounds.x)}%, {Math.round(bounds.y)}%</text></g>; })()}
          </svg>}
          <span className="sb-composition-size">{manifest.width} × {manifest.height}</span>
        </div>
        {mode === "position" && <p className="sb-position-hint">Drag the outlined layer to move it. Drag the lower-right handle to resize; the saved X/Y and size stay in composition percentages.</p>}
        <div className="sb-shot-direction"><span className="sb-eyebrow">DIRECTION</span><p>{set.description || "No action direction has been written for this shot."}</p>{set.cameraNote && <small>Camera · {set.cameraNote}</small>}</div></>}
      </>}
    </main>

    <aside className="sb-shot-inspector">
      {!set || !scene ? <><div className="sb-inspector-heading"><span className="sb-eyebrow">PROJECT</span><h2>Visual plan</h2></div><p className="sb-inspector-hint">The inspector will show shot direction, layer IDs, image status and composition controls when a prepared shot is selected.</p></> : <>
        <div className="sb-inspector-heading"><span className="sb-eyebrow">SHOT INSPECTOR</span><h2>{set.name}</h2><small>{set.representations.length === 1 ? "1 visual layer" : `${set.representations.length} visual layers`}</small></div>
        <div className="sb-inspector-tabs" role="tablist" aria-label="Inspector sections"><button role="tab" aria-selected={inspectorTab === "shot"} className={inspectorTab === "shot" ? "active" : ""} onClick={() => setInspectorTab("shot")}>Shot</button><button role="tab" aria-selected={inspectorTab === "element"} className={inspectorTab === "element" ? "active" : ""} onClick={() => setInspectorTab("element")}>Element{selectedRepresentation ? ` · ${selectedRepresentation.layerName || "selected"}` : "s"}</button></div>
        {inspectorTab === "shot" && <>
        <label className="sb-inspector-field">What happens in this shot?<textarea value={set.description} onChange={event => onEditShot({ description: event.target.value })} placeholder="Director's action and visual beat" /></label>
        <div className="sb-inspector-grid"><label>Start (s)<input type="number" min="0" step="0.1" value={set.start ?? ""} onChange={event => onEditShot({ start: event.target.value === "" ? null : +event.target.value })} /></label><label>Duration (s)<input type="number" min="0.1" step="0.1" value={set.duration ?? ""} onChange={event => onEditShot({ duration: event.target.value === "" ? null : +event.target.value })} /></label></div>
        <label className="sb-inspector-field">Approved reference image<select aria-label="Approved shot reference image" value={primaryReferenceId ?? ""} onChange={event => onSetReferenceImage(event.target.value || null)}><option value="">No reference image selected</option>{doc.references.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>
        <p className="sb-reference-help">The reference is the Director's approved key frame. If no separate layers are needed, it can also be used directly as the shot image in the video.</p>
        <label className="sb-inspector-field">Camera / framing<textarea value={set.cameraNote} onChange={event => onEditShot({ cameraNote: event.target.value })} placeholder="e.g. Medium shot, slow push-in" /></label>
        <details className="sb-shot-more"><summary>More shot settings</summary><label>Transition<textarea value={set.transition} onChange={event => onEditShot({ transition: event.target.value })}/></label><label>Composition notes<textarea value={set.compositionNote} onChange={event => onEditShot({ compositionNote: event.target.value })}/></label><label>Scene style<textarea value={scene.style} onChange={event => onEditScene({ style: event.target.value })}/></label><label>Scene direction<textarea value={scene.directions} onChange={event => onEditScene({ directions: event.target.value })}/></label></details>
        <section className="sb-implementation-review" aria-label="Director and Animator review">
          <div className="sb-scene-list-heading"><strong>Director ↔ Animator</strong><span>{implementationCoverage.length} directives</span></div>
          {implementationCoverage.length === 0 ? <p>No written directions to track for this shot yet.</p> : implementationCoverage.map(item => <article className="sb-directive-review" key={item.directiveId}>
            <header><strong>{item.label}</strong><span className={`sb-directive-status ${item.status}`}>{item.status === "implemented" ? "reported implemented" : item.status === "self-checked" ? "Animator self-checked" : item.status === "approved" ? "review approved" : item.status.replaceAll("-", " ")}</span></header>
            <p>{item.instruction}</p>
            {item.timelineClipIds.length > 0 && <small>Timeline clips · {item.timelineClipIds.join(", ")}</small>}
            {item.componentIds.length > 0 && <small>Components · {item.componentIds.join(", ")}</small>}
            {item.sourceFiles.length > 0 && <small>Code · {item.sourceFiles.join(", ")}</small>}
            {item.messages.length > 0 && <div className="sb-directive-messages">{item.messages.map(message => <div key={message.id} className={`sb-directive-message ${message.author}`}><b>{message.author} · {message.kind.replaceAll("-", " ")}{message.outcome ? ` · ${message.outcome.replaceAll("-", " ")}` : ""}</b><p>{message.message}</p></div>)}</div>}
          </article>)}
        </section>
        </>}
        {inspectorTab === "element" && <>
        <div className="sb-inspector-section"><div className="sb-scene-list-heading"><strong>Layers & Animator outputs</strong><span>{set.representations.length} layers · {implementationOutputs.length} outputs</span></div>
          <div className="sb-layer-panel" role="tree" aria-label="Shot layers">
          {set.representations.length === 0 ? <div className="sb-asset-empty">No visual assets or layers are attached.</div> : set.representations.map(layer => {
            const asset = layer.referenceId ? doc.references.find(item => item.id === layer.referenceId) : undefined;
            const ready = layer.kind !== "reference" || !!layer.rasterDataUrl || !!asset && !assetDrift.includes(asset.id);
            const objectAnnotations = currentAnnotations.filter(annotation => annotation.objectId === layer.objectId || (!annotation.objectId && annotation.targetRepresentationId === layer.id));
            return <div className={`sb-layer-tree-item ${layer.id === selectedRepresentation?.id ? "selected" : ""}`} key={layer.id} role="treeitem" aria-selected={layer.id === selectedRepresentation?.id}>
              <button className="sb-inspector-layer" onClick={() => selectLayer(layer.id)} aria-pressed={layer.id === selectedRepresentation?.id}>
                <span className="sb-layer-swatch">{asset?.role === "clean-background" ? "▧" : asset?.role === "character" ? "◉" : layer.kind === "reference" ? "▣" : "◇"}</span><span className="sb-layer-label"><strong>{layer.layerName || (asset?.name ?? "Visual layer")}</strong><small>{layer.objectId ? `${layer.objectId} · ` : "No object ID · "}{asset?.role || (layer.kind === "reference" ? "Image" : "Drawing")}</small></span><span className={`sb-asset-status ${ready ? "ready" : "missing"}`}>{referenceChanged && asset?.id === reference?.id ? "Changed" : ready ? "Ready" : "Missing"}</span>
              </button>
              {objectAnnotations.length > 0 && <div className="sb-layer-annotations" role="group" aria-label={`Annotations for ${layer.layerName}`}><small>Annotations · {objectAnnotations.length}</small>{objectAnnotations.map(annotation => <button key={annotation.id} title={annotation.instruction} onClick={() => { const targetLayer = set.representations.find(item => item.id === annotation.targetRepresentationId); if (targetLayer) selectLayer(targetLayer.id); setMode("markup"); }}><span>{annotation.kind === "point" ? "●" : annotation.kind === "rectangle" || annotation.kind === "polygon" ? "▱" : "⌁"}</span><b>{annotation.label || annotation.kind}</b><small>{annotation.instruction}</small></button>)}</div>}
              {renderOutputChildren(layer.id, layer.id)}
            </div>;
          })}
          {renderOutputChildren(set.id, set.id)}
          </div>
        </div>
        {selectedRepresentation && <div className="sb-selected-layer-inspector"><div className="sb-selected-layer-title"><div><span className="sb-eyebrow">SELECTED ELEMENT</span><strong>{selectedRepresentation.layerName || "Selected layer"}</strong><small>{selectedRepresentation.id}</small></div><button onClick={onDuplicateLayer} title="Duplicate this element">Duplicate</button></div>
          <label className="sb-inspector-field">Layer name<input value={selectedRepresentation.layerName} onChange={event => onEditLayer({ layerName: event.target.value })} placeholder="e.g. Andrei, Chair, Water" /></label>
          {selectedRepresentation.objectId && <small>Story object · {selectedRepresentation.objectId}</small>}
          {reference ? <div className="sb-asset-details"><strong>{reference.name}</strong><small>{reference.role || reference.category} · v{reference.version ?? 1}</small><small>{reference.file || `assets/storyboard/references/${reference.id}.png`}</small><span className={`sb-asset-status ${referenceChanged ? "missing" : "ready"}`}>{referenceChanged ? "Image changed since approval" : `${reference.width ?? "?"} × ${reference.height ?? "?"} · ${reference.hasAlpha ? "transparent" : "opaque"}`}</span></div> : <div className="sb-asset-empty">{selectedRepresentation.rasterDataUrl ? "Editable raster drawing" : "This layer has no separate image asset."}</div>}
          {reference && selectedRepresentation.kind === "reference" && <div className="sb-image-fit-control"><strong>Image layer</strong><label>How the source fills this layer<select aria-label="How the source image fills its layer" value={selectedRepresentation.imageFit ?? "contain"} onChange={event => onEditLayer({ imageFit: event.target.value as "contain" | "cover" | "stretch" })}><option value="contain">Fit · show the whole source</option><option value="cover">Fill · crop source edges</option><option value="stretch">Stretch · distort the source</option></select></label>{resetImageBounds && <button className="sb-fit-frame-button" onClick={() => onEditLayer({ ...resetImageBounds, imageFit: "contain" })}>Fit whole image to canvas</button>}<small>X/Y/Width/Height move and resize this image layer. Fit keeps the complete source visible; Fill covers the layer and crops the source; Stretch distorts it. No background layer is added. Blur already present in the source file stays visible. To use a separate backdrop, add the same image again as another layer.</small></div>}
          <div className="sb-inspector-grid"><label>X (%)<input type="number" value={selectedRepresentation.x} onChange={event => onEditLayer({ x: +event.target.value })}/></label><label>Y (%)<input type="number" value={selectedRepresentation.y} onChange={event => onEditLayer({ y: +event.target.value })}/></label><label>Width (%)<input type="number" min="0.01" value={selectedRepresentation.width} onChange={event => onEditLayer({ width: +event.target.value })}/></label><label>Height (%)<input type="number" min="0.01" value={selectedRepresentation.height} onChange={event => onEditLayer({ height: +event.target.value })}/></label><label>Rotation°<input type="number" value={selectedRepresentation.rotation} onChange={event => onEditLayer({ rotation: +event.target.value })}/></label></div>
          <label className="sb-inspector-checkbox"><input type="checkbox" checked={selectedRepresentation.visible} onChange={event => onEditLayer({ visible: event.target.checked })}/> Visible in composition</label>
          {flattened && <p className="sb-flattened-note">This shot is one flattened image. Its internal objects cannot be moved separately. Use “Annotate image” for feedback, or ask the Director to deliver separate layers.</p>}
        </div>}
        {selectedOutput && <div className="sb-implementation-output-inspector"><span className="sb-eyebrow">ANIMATOR OUTPUT</span><strong>{selectedOutput.name}</strong><small>{selectedOutput.kind} · {selectedOutput.id}</small>{selectedOutputImage && <img className="sb-implementation-output-preview" src={selectedOutputImage.src} alt={selectedOutput.name}/>}<p>{selectedOutput.description}</p>
          {selectedOutput.assetReferenceId && doc.references.find(item => item.id === selectedOutput.assetReferenceId) && <small>Image asset · {doc.references.find(item => item.id === selectedOutput.assetReferenceId)?.file || selectedOutput.assetReferenceId}</small>}
          {selectedOutput.startFrame !== null && selectedOutput.durationInFrames !== null && <small>Shot time {(selectedOutput.startFrame / manifest.fps).toFixed(2)}–{((selectedOutput.startFrame + selectedOutput.durationInFrames) / manifest.fps).toFixed(2)} s · frames {selectedOutput.startFrame}–{selectedOutput.startFrame + selectedOutput.durationInFrames}</small>}
          {selectedOutput.timelineClipIds.length > 0 && <small>Timeline clips · {selectedOutput.timelineClipIds.join(", ")}</small>}
          {selectedOutput.componentIds.length > 0 && <small>Components · {selectedOutput.componentIds.join(", ")}</small>}
          {selectedOutput.sourceFiles.map(file => <small key={file}>Code · {file}</small>)}
        </div>}
        <p className="sb-element-drag-hint">Drag an unlocked element on the canvas to reposition it.</p>
        <div className="sb-inspector-footer"><button onClick={onExportShot}>Export shot PNG</button></div>
        </>}
      </>}
      {manualTools}
    </aside>
  </div>;
}
