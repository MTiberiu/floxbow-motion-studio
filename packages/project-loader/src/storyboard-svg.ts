import { imageBoundsInComposition, imagePointToComposition, storyboardSchema, type Storyboard, type StorySet } from "./storyboard";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
/** Read-only vector rendering for agents; reference URLs resolve only through the registered media route. */
export function renderStoryboardSvg(input: Storyboard, requestedSet: StorySet) {
  const doc = storyboardSchema.parse(input),
    { width, height } = doc.composition;
  const set = doc.scenes.flatMap(scene => scene.sets).find(set => set.id === requestedSet.id);
  if (!set) throw new Error("Unknown sketch Set");
  const layers = set.representations
    .filter((r) => r.visible)
    .map((r) => {
      const x = (r.x * width) / 100,
        y = (r.y * height) / 100,
        w = (r.width * width) / 100,
        h = (r.height * height) / 100;
      let body = "";
      if (r.kind === "rectangle") body = `<rect width="${w}" height="${h}"/>`;
      if (r.kind === "ellipse")
        body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
      if (r.kind === "line") body = `<line x1="0" y1="0" x2="${w}" y2="${h}"/>`;
      if (r.kind === "pencil")
        body = `<polyline points="${r.points.map(([px, py]) => `${px * w},${py * h}`).join(" ")}"/>`;
      if (r.kind === "text")
        body = `<text y="${h}" font-family="sans-serif" font-size="${h}" fill="${r.color}" stroke="none">${escape(r.text)}</text>`;
      let frameClip = "";
      if (r.kind === "reference") {
        const ref = doc.references.find((ref) => ref.id === r.referenceId)!;
        const fitMode = r.imageFit ?? "contain";
        const bounds = imageBoundsInComposition(r, ref.width ?? w, ref.height ?? h, width, height, fitMode);
        const imageX = (bounds.x - r.x) * width / 100;
        const imageY = (bounds.y - r.y) * height / 100;
        const imageWidth = bounds.width * width / 100;
        const imageHeight = bounds.height * height / 100;
        frameClip = `<clipPath id="${r.id}-frame-local"><rect width="${w}" height="${h}"/></clipPath><clipPath id="${r.id}-frame"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
        body = `<g clip-path="url(#${r.id}-frame-local)"><image href="/api/storyboard/${doc.projectId}/media/${ref.id}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="none"/></g>`;
      }
      return `${frameClip ? `<defs>${frameClip}</defs>` : ""}<g id="${r.id}" transform="translate(${x + w / 2} ${y + h / 2}) rotate(${r.rotation}) translate(${-w / 2} ${-h / 2})" opacity="${r.opacity}" stroke="${r.color}" stroke-width="${r.thickness}" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}</g>`;
    });
  const annotations = doc.annotations
    .filter((annotation) => annotation.setId === set.id)
    .flatMap((annotation) => {
      const target = set.representations.find(
        (representation) => representation.id === annotation.targetRepresentationId && representation.visible,
      );
      if (!target) return [];
      const x = (target.x * width) / 100,
        y = (target.y * height) / 100,
        w = (target.width * width) / 100,
        h = (target.height * height) / 100,
        source = doc.references.find(reference => reference.id === target.referenceId),
        bounds = source
          ? imageBoundsInComposition(target, source.width ?? w, source.height ?? h, width, height, target.imageFit ?? "contain")
          : { x: target.x, y: target.y, width: target.width, height: target.height },
        points = annotation.points.map((point) => {
          const [px, py] = source
            ? imagePointToComposition(target, point, source.width ?? w, source.height ?? h, width, height, target.imageFit ?? "contain")
            : [bounds.x + point[0] * bounds.width / 100, bounds.y + point[1] * bounds.height / 100];
          return [px * width / 100, py * height / 100] as const;
        }),
        [firstX, firstY] = points[0],
        strokeWidth = (annotation.strokeWidth ?? 4) * Math.max(1, Math.max(width, height) / 1920),
        marker = Math.max(5, Math.max(width, height) * 0.006);
      let shape = "";
      if (annotation.kind === "point") shape = `<path d="M${firstX} ${firstY + marker * 1.8} C${firstX - marker * .1} ${firstY + marker * 1.45} ${firstX - marker} ${firstY + marker * .25} ${firstX - marker} ${firstY - marker * .45} A${marker} ${marker} 0 1 1 ${firstX + marker} ${firstY - marker * .45} C${firstX + marker} ${firstY + marker * .25} ${firstX + marker * .1} ${firstY + marker * 1.45} ${firstX} ${firstY + marker * 1.8} Z"/><circle cx="${firstX}" cy="${firstY - marker * .45}" r="${marker * .3}" fill="#17191e"/>`;
      else if (annotation.kind === "rectangle") {
        const [secondX, secondY] = points[1];
        shape = `<rect x="${Math.min(firstX, secondX)}" y="${Math.min(firstY, secondY)}" width="${Math.abs(secondX - firstX)}" height="${Math.abs(secondY - firstY)}"/>`;
      } else {
        let path = points.length ? `M${points[0][0]} ${points[0][1]}` : "";
        if (points.length === 2) path += ` L${points[1][0]} ${points[1][1]}`;
        else for (let index = 1; index < points.length - 1; index++) {
          const [px, py] = points[index], [nextX, nextY] = points[index + 1];
          path += ` Q${px} ${py} ${(px + nextX) / 2} ${(py + nextY) / 2}`;
        }
        if (points.length > 2) path += ` L${points.at(-1)![0]} ${points.at(-1)![1]}`;
        shape = `<path d="${path}${annotation.kind === "polygon" ? " Z" : ""}"/>`;
      }
      const centerX = x + w / 2,
        centerY = y + h / 2,
        fontSize = Math.max(12, Math.max(width, height) * 0.016);
      return [`<g id="${annotation.id}" clip-path="url(#${target.id}-frame)" transform="translate(${centerX} ${centerY}) rotate(${target.rotation}) translate(${-centerX} ${-centerY})" fill="none" stroke="${annotation.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><title>${escape(`${annotation.label}: ${annotation.instruction}`)}</title>${shape}<text x="${firstX}" y="${firstY - marker}" fill="${annotation.color}" stroke="none" font-family="sans-serif" font-size="${fontSize}">${escape(annotation.label)}</text></g>`];
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escape(set.name)}</title><rect width="100%" height="100%" fill="white"/>${layers.join("")}${annotations.join("")}</svg>`;
}
