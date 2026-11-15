import type { Point } from './line.ts'

/** Appends two triangles (6 vertices) covering the rectangle. Accepts negative width/height. */
export function pushRect(out: number[], x: number, y: number, w: number, h: number): void {
  if (w < 0) {
    x += w
    w = -w
  }
  if (h < 0) {
    y += h
    h = -h
  }
  const x1 = x + w
  const y1 = y + h
  out.push(x, y, x1, y, x, y1, x, y1, x1, y, x1, y1)
}

/** Corner radii in the order top-left, top-right, bottom-right, bottom-left. */
export type Radii = [number, number, number, number]

/**
 * Outline of a rounded rectangle (clockwise on screen) with `segments` points per
 * corner arc (segments >= 1), or a plain 4-point rectangle when segments is 0.
 * Each radius is clamped to half the width and to the height.
 */
export function roundedRectPath(x: number, y: number, w: number, h: number, radii: Radii, segments: number): Point[] {
  if (segments === 0) return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, w / 2, h))) as Radii
  const corners: [number, number, number, number][] = [
    [x + tl, y + tl, tl, Math.PI],
    [x + w - tr, y + tr, tr, Math.PI * 1.5],
    [x + w - br, y + h - br, br, 0],
    [x + bl, y + h - bl, bl, Math.PI * 0.5],
  ]
  const out: Point[] = []
  for (const [cx, cy, r, a0] of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = a0 + (i / segments) * (Math.PI / 2)
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
  }
  return out
}

/** Fills a convex outline as a triangle fan around (cx, cy). */
export function pushFan(out: number[], path: Point[], cx: number, cy: number): void {
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!
    const b = path[(i + 1) % path.length]!
    out.push(cx, cy, a.x, a.y, b.x, b.y)
  }
}

/** Fills the band between two outlines that have the same number of points. */
export function pushRing(out: number[], outer: Point[], inner: Point[]): void {
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length
    const a = outer[i]!, b = outer[j]!, c = inner[j]!, d = inner[i]!
    out.push(a.x, a.y, b.x, b.y, c.x, c.y, a.x, a.y, c.x, c.y, d.x, d.y)
  }
}
