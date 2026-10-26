import { storyboardSchema, type Storyboard, type StorySet } from "./storyboard";
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
      if (r.kind === "reference") {
        const ref = doc.references.find((ref) => ref.id === r.referenceId)!;
        body = `<image href="/api/storyboard/${doc.projectId}/media/${ref.id}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
      }
      return `<g id="${r.id}" transform="translate(${x + w / 2} ${y + h / 2}) rotate(${r.rotation}) translate(${-w / 2} ${-h / 2})" opacity="${r.opacity}" stroke="${r.color}" stroke-width="${r.thickness}" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}</g>`;
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escape(set.name)}</title><rect width="100%" height="100%" fill="white"/>${layers.join("")}</svg>`;
}
