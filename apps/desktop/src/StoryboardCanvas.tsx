import { useEffect, useRef, useState, type PointerEvent } from "react";
import type {
  Representation,
  StorySet,
} from "@motion/project-loader/storyboard";
import { paintRepresentation } from "./storyboard-export";
export const storyId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function StoryboardCanvas({
  set,
  width,
  height,
  selected,
  select,
  change,
  tracingUrl,
  images,
}: {
  set: StorySet;
  width: number;
  height: number;
  selected: string;
  select: (id: string) => void;
  change: (reps: Representation[]) => void;
  tracingUrl?: string;
  images: Record<string, HTMLImageElement>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState("pencil"),
    [color, setColor] = useState("#24334b"),
    [thickness, setThickness] = useState(5),
    [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<Representation[]>();
  const [fitWidth, setFitWidth] = useState(300);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setFitWidth(
        Math.max(
          100,
          Math.min(
            element.clientWidth - 28,
            ((element.clientHeight - 28) * width) / height,
          ),
        ),
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);
  const [annotation, setAnnotation] = useState("Note");
  const gesture = useRef<
    | {
        x: number;
        y: number;
        reps: Representation[];
        id: string;
        points: [number, number][];
        pan?: [number, number];
      }
    | undefined
  >(undefined);
  const reps = draft ?? set.representations;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    reps.forEach((r) => paintRepresentation(ctx, r, images));
    const r = reps.find((r) => r.id === selected);
    if (r) {
      ctx.save();
      ctx.translate(
        ((r.x + r.width / 2) * width) / 100,
        ((r.y + r.height / 2) * height) / 100,
      );
      ctx.rotate((r.rotation * Math.PI) / 180);
      ctx.strokeStyle = "#568aff";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(
        (-r.width * width) / 200 - 5,
        (-r.height * height) / 200 - 5,
        (r.width * width) / 100 + 10,
        (r.height * height) / 100 + 10,
      );
      ctx.restore();
    }
  }, [reps, selected, width, height, images]);
  useEffect(() => {
    setDraft(undefined);
    gesture.current = undefined;
  }, [set.id]);
  function point(e: PointerEvent<HTMLCanvasElement>): [number, number] {
    const bounds = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - bounds.left) * 100) / bounds.width,
      ((e.clientY - bounds.top) * 100) / bounds.height,
    ];
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    if (tool === "pan") {
      gesture.current = {
        x: e.clientX,
        y: e.clientY,
        reps,
        id: "",
        points: [],
        pan: [viewport.current!.scrollLeft, viewport.current!.scrollTop],
      };
      return;
    }
    const hit = [...reps].reverse().find((r) => {
      if (!r.visible || r.locked) return false;
      const dx = ((x - r.x - r.width / 2) * width) / 100,
        dy = ((y - r.y - r.height / 2) * height) / 100,
        angle = (-r.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(angle) - dy * Math.sin(angle),
        ly = dx * Math.sin(angle) + dy * Math.cos(angle);
      return (
        Math.abs(lx) <= (r.width * width) / 200 + 8 &&
        Math.abs(ly) <= (r.height * height) / 200 + 8
      );
    });
    if (tool === "eraser") {
      if (hit) change(reps.filter((r) => r.id !== hit.id));
      return;
    }
    if (tool === "select" || tool === "resize") {
      select(hit?.id ?? "");
      if (hit)
        gesture.current = {
          x,
          y,
          reps: structuredClone(reps),
          id: hit.id,
          points: [],
        };
      return;
    }
    const text = tool === "text" ? annotation : "";
    const r: Representation = {
      id: storyId("rep"),
      objectId: null,
      setId: set.id,
      coordinateSpace: "composition-percent",
      anchor: "top-left",
      rotation: 0,
      zOrder: reps.length,
      spatialNote: "",
      referenceId: null,
      kind: tool as Representation["kind"],
      x,
      y,
      width: tool === "text" ? 25 : 0.1,
      height: tool === "text" ? 4 : 0.1,
      points: [[0, 0]],
      color,
      thickness,
      text,
      visible: true,
      opacity: 1,
      locked: false,
      pose: "",
      instructions: "",
      motion: "",
    };
    const next = [...reps, r];
    select(r.id);
    setDraft(next);
    gesture.current = { x, y, reps: next, id: r.id, points: [[x, y]] };
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g) return;
    if (g.pan) {
      viewport.current!.scrollLeft = g.pan[0] - (e.clientX - g.x);
      viewport.current!.scrollTop = g.pan[1] - (e.clientY - g.y);
      return;
    }
    const [x, y] = point(e);
    const next = structuredClone(g.reps),
      r = next.find((r) => r.id === g.id)!;
    if (tool === "select") {
      r.x += x - g.x;
      r.y += y - g.y;
    } else if (tool === "resize") {
      r.width = Math.max(1, r.width + x - g.x);
      r.height = Math.max(1, r.height + y - g.y);
    } else if (tool === "pencil") {
      if (g.points.length >= 10000) return;
      g.points.push([x, y]);
      const xs = g.points.map((p) => p[0]),
        ys = g.points.map((p) => p[1]);
      r.x = Math.min(...xs);
      r.y = Math.min(...ys);
      r.width = Math.max(1, Math.max(...xs) - r.x);
      r.height = Math.max(1, Math.max(...ys) - r.y);
      r.points = g.points.map(([px, py]) => [
        (px - r.x) / r.width,
        (py - r.y) / r.height,
      ]);
    } else if (tool !== "text") {
      r.x = Math.min(g.x, x);
      r.y = Math.min(g.y, y);
      r.width = Math.max(1, Math.abs(x - g.x));
      r.height = Math.max(1, Math.abs(y - g.y));
    }
    setDraft(next);
  }
  function up() {
    if (gesture.current && !gesture.current.pan && draft) change(draft);
    gesture.current = undefined;
    setDraft(undefined);
  }
  return (
    <div className="sb-canvas-area">
      <div className="sb-tools">
        {tool === "text" && (
          <input
            aria-label="Text annotation"
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
          />
        )}
        {[
          "pencil",
          "eraser",
          "select",
          "resize",
          "pan",
          "rectangle",
          "ellipse",
          "line",
          "text",
        ].map((t) => (
          <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)}>
            {t}
          </button>
        ))}
        <input
          aria-label="Drawing color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <input
          aria-label="Brush thickness"
          type="range"
          min="1"
          max="40"
          value={thickness}
          onChange={(e) => setThickness(+e.target.value)}
        />
        <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
          −
        </button>
        <button onClick={() => setZoom(1)}>Fit</button>
        <button onClick={() => setZoom((z) => Math.min(5, z * 1.25))}>+</button>
      </div>
      <div ref={viewport} className="sb-canvas-viewport">
        <div
          className="sb-paper"
          style={{
            width: `${zoom * fitWidth}px`,
            aspectRatio: `${width}/${height}`,
          }}
        >
          {tracingUrl && (
            <img
              alt="Locked tracing aid"
              src={tracingUrl}
              style={{ opacity: set.tracing?.opacity }}
            />
          )}
          <canvas
            aria-label="Storyboard sketch canvas"
            ref={canvas}
            width={width}
            height={height}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              gesture.current = undefined;
              setDraft(undefined);
            }}
          />
        </div>
      </div>
      <small>
        Rough sketches communicate intent. Eraser removes a stroke or shape.
        Resize: drag a selected element. Tracing is locked and editor-only.
      </small>
    </div>
  );
}
