export type ImagePoint = [number, number];
export { compositionPointToImage, imageBoundsInComposition, imagePointToComposition, type ImageFitMode } from "@motion/project-loader/storyboard";

/** Smooths hand-drawn image paths while keeping their coordinates in image-percent space. */
export function smoothImagePath(points: ImagePoint[], strength: number, closed: boolean): ImagePoint[] {
  if (points.length < 3 || strength <= 0) return points.map(point => [...point] as ImagePoint);
  const clean = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) >= 0.18);
  let result = clean.length >= 3 ? clean : points.map(point => [...point] as ImagePoint);
  for (let pass = 0; pass < Math.min(2, Math.floor(strength)); pass++) {
    const next: ImagePoint[] = [];
    const count = closed ? result.length : result.length - 1;
    if (!closed) next.push(result[0]);
    for (let i = 0; i < count; i++) {
      const a = result[i], b = result[(i + 1) % result.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) next.push(result.at(-1)!);
    result = next;
  }
  if (result.length > 500) {
    const stride = (result.length - 1) / 499;
    result = Array.from({ length: 500 }, (_, index) => result[Math.round(index * stride)]);
  }
  return result;
}

/** Returns an SVG path that rounds joins through the supplied image-space points. */
export function imagePathData(points: ImagePoint[], closed = false): string {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}`;
  if (points.length === 2 && !closed) return `M${points[0][0]} ${points[0][1]} L${points[1][0]} ${points[1][1]}`;
  if (!closed) {
    const firstMid: ImagePoint = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
    let path = `M${points[0][0]} ${points[0][1]} L${firstMid[0]} ${firstMid[1]}`;
    for (let index = 1; index < points.length - 1; index++) {
      const nextMid: ImagePoint = [(points[index][0] + points[index + 1][0]) / 2, (points[index][1] + points[index + 1][1]) / 2];
      path += ` Q${points[index][0]} ${points[index][1]} ${nextMid[0]} ${nextMid[1]}`;
    }
    const last = points.at(-1)!;
    return `${path} L${last[0]} ${last[1]}`;
  }
  let path = "";
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index + points.length - 1) % points.length];
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const midpoint: ImagePoint = [(previous[0] + point[0]) / 2, (previous[1] + point[1]) / 2];
    const nextMidpoint: ImagePoint = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
    path += `${index === 0 ? `M${midpoint[0]} ${midpoint[1]}` : ""} Q${point[0]} ${point[1]} ${nextMidpoint[0]} ${nextMidpoint[1]}`;
  }
  return `${path} Z`;
}
