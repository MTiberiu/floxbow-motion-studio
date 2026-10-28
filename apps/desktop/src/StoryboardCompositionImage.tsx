import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import { imagePointToComposition, type Representation, type Storyboard, type StorySet } from "@motion/project-loader/storyboard";
import { StandaloneImageLayer } from "@motion/sdk/editor";
import type { TimelineClip } from "@motion/sdk/timeline";
import { representationPng } from "./storyboard-export";
import { storyboardLayerToImageClip } from "./storyboard-timeline";

function RasterLayer({ representation, manifest, images }: {
  representation: Representation; manifest: ProjectManifest; images: Record<string, HTMLImageElement>;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    let objectUrl = "";
    void representationPng(representation, { name: manifest.name, width: manifest.width, height: manifest.height, fps: manifest.fps }, images)
      .then(bytes => {
        if (!live) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        setUrl(objectUrl);
      })
      .catch(() => setUrl(""));
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [images, manifest.fps, manifest.height, manifest.name, manifest.width, representation]);
  return url ? <img src={url} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} /> : null;
}

function AnnotationOverlay({ doc, set, images }: { doc: Storyboard; set: StorySet; images: Record<string, HTMLImageElement> }) {
  const annotations = doc.annotations.filter(annotation => annotation.setId === set.id);
  if (!annotations.length) return null;
  return <svg className="sb-composition-annotations" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Storyboard annotations">
    {annotations.map(annotation => {
      const target = set.representations.find(representation => representation.id === annotation.targetRepresentationId && representation.visible);
      const image = target ? images[target.referenceId ?? ""] : undefined;
      if (!target || !image) return null;
      const centerX = target.x + target.width / 2, centerY = target.y + target.height / 2;
      const radians = target.rotation * Math.PI / 180;
      const points = annotation.points.map(point => {
        const [x, y] = imagePointToComposition(target, point, image.naturalWidth, image.naturalHeight, 100, 100, target.imageFit ?? "contain");
        const dx = x - centerX, dy = y - centerY;
        return [centerX + dx * Math.cos(radians) - dy * Math.sin(radians), centerY + dx * Math.sin(radians) + dy * Math.cos(radians)] as const;
      });
      const path = points.length ? `M ${points[0][0]} ${points[0][1]} ${points.slice(1).map(point => `L ${point[0]} ${point[1]}`).join(" ")}${annotation.kind === "polygon" ? " Z" : ""}` : "";
      const first = points[0];
      return <g key={annotation.id} clipPath={`url(#sb-annotation-clip-${annotation.id})`} fill="none" stroke={annotation.color} strokeWidth="0.35" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={`sb-annotation-clip-${annotation.id}`}><rect x={target.x} y={target.y} width={target.width} height={target.height} transform={`rotate(${target.rotation} ${centerX} ${centerY})`} /></clipPath></defs>
        {annotation.kind === "point" && first ? <g><path d={`M ${first[0]} ${first[1] + 1.2} C ${first[0] - .1} ${first[1] + .9}, ${first[0] - .7} ${first[1] + .15}, ${first[0] - .7} ${first[1] - .25} A .7 .7 0 1 1 ${first[0] + .7} ${first[1] - .25} C ${first[0] + .7} ${first[1] + .15}, ${first[0] + .1} ${first[1] + .9}, ${first[0]} ${first[1] + 1.2} Z`} fill={annotation.color} /><circle cx={first[0]} cy={first[1] - .25} r=".2" fill="#17191e" /></g>
          : annotation.kind === "rectangle" && points.length > 1 ? <rect x={Math.min(points[0][0], points[1][0])} y={Math.min(points[0][1], points[1][1])} width={Math.abs(points[1][0] - points[0][0])} height={Math.abs(points[1][1] - points[0][1])} />
          : <path d={path} />}
        {annotation.label && first && <text x={first[0]} y={first[1] - .7} fill={annotation.color} stroke="#17130c" strokeWidth=".12" paintOrder="stroke" fontSize="1.3">{annotation.label}</text>}
      </g>;
    })}
  </svg>;
}

export function StoryboardCompositionImage({ doc, set, manifest, images, className = "", includeAnnotations = true, fit = "contain" }: {
  doc: Storyboard; set: StorySet; manifest: ProjectManifest;
  images: Record<string, HTMLImageElement>; className?: string; includeAnnotations?: boolean; fit?: "contain" | "cover";
}) {
  const referenceById = useMemo(() => new Map(doc.references.map(reference => [reference.id, reference])), [doc.references]);
  const layers = set.representations.filter(representation => representation.visible).slice().sort((a, b) => a.zOrder - b.zOrder);
  const hasVisibleReference = layers.some(layer => layer.kind === "reference" && layer.referenceId && referenceById.has(layer.referenceId));
  const keyReferenceId = set.referenceImageId
    ?? set.referenceIds.find(id => referenceById.get(id)?.role === "shot-image")
    ?? set.representations.find(layer => layer.kind === "reference" && layer.referenceId)?.referenceId
    ?? null;
  const implicitReferenceId = layers.length === 0 && !hasVisibleReference ? keyReferenceId : null;
  const isStageImage = className.split(/\s+/).includes("sb-shot-full-image");
  const compositionStyle: CSSProperties = { position: isStageImage ? "absolute" : "relative", inset: isStageImage ? 0 : undefined, width: "100%", height: "100%", overflow: "hidden", objectFit: fit };

  return <div className={`${className} sb-composition-renderer`} style={compositionStyle} data-renderer="motion-sdk-image">
    {layers.map(layer => {
      if (layer.kind !== "reference" || !layer.referenceId) {
        return <div key={layer.id} style={{ position: "absolute", inset: 0, zIndex: layer.zOrder, pointerEvents: "none" }}><RasterLayer representation={layer} manifest={manifest} images={images} /></div>;
      }
      const reference = referenceById.get(layer.referenceId);
      const sourceImage = images[layer.referenceId];
      if (!reference || !sourceImage) return <div key={layer.id} className="sb-composition-missing-layer" style={{ zIndex: layer.zOrder }}>Missing image · {layer.layerName || layer.id}</div>;
      const clip = storyboardLayerToImageClip({ layer, set, reference: { assetId: reference.assetId, name: reference.name, width: sourceImage.naturalWidth, height: sourceImage.naturalHeight }, clipId: `storyboard-${layer.id}`, trackId: "storyboard-preview", from: 0, durationInFrames: 1 });
      return <div key={layer.id} style={{ position: "absolute", inset: 0, zIndex: layer.zOrder, pointerEvents: "none" }}>
        <StandaloneImageLayer clip={clip as TimelineClip} imageSource={sourceImage.src} nativeImage />
      </div>;
    })}
    {implicitReferenceId && referenceById.has(implicitReferenceId) && images[implicitReferenceId] && (() => {
      const reference = referenceById.get(implicitReferenceId)!;
      const virtualLayer = { id: `storyboard-reference-${set.id}`, layerName: reference.name, setId: set.id, objectId: null, coordinateSpace: "composition-percent", anchor: "top-left", rotation: 0, zOrder: 0, spatialNote: "", referenceId: implicitReferenceId, imageFit: "contain", kind: "reference", x: 0, y: 0, width: 100, height: 100, points: [], color: "#ffffff", thickness: 1, text: "", visible: true, opacity: 1, locked: true, pose: "", instructions: "", motion: "" } as Representation;
      const clip = storyboardLayerToImageClip({ layer: virtualLayer, set, reference: { assetId: reference.assetId, name: reference.name, width: reference.width, height: reference.height }, clipId: `storyboard-${virtualLayer.id}`, trackId: "storyboard-preview", from: 0, durationInFrames: 1 });
      return <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}><StandaloneImageLayer clip={clip as TimelineClip} imageSource={images[implicitReferenceId]!.src} nativeImage /></div>;
    })()}
    {includeAnnotations && <AnnotationOverlay doc={doc} set={set} images={images} />}
    {!layers.length && !implicitReferenceId && <div className="sb-composition-placeholder">No composition layers</div>}
  </div>;
}
