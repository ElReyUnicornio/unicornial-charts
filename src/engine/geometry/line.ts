/** Appends a thick segment as two triangles. */
export function pushSegment(out: number[], x0: number, y0: number, x1: number, y1: number, halfWidth: number): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  if (len === 0) return
  const nx = (-dy / len) * halfWidth
  const ny = (dx / len) * halfWidth
  const ax = x0 + nx, ay = y0 + ny
  const bx = x0 - nx, by = y0 - ny
  const cx = x1 + nx, cy = y1 + ny
  const dx2 = x1 - nx, dy2 = y1 - ny
  out.push(ax, ay, bx, by, cx, cy, bx, by, dx2, dy2, cx, cy)
}

/** Appends a filled circle as a triangle list. */
export function pushCircle(out: number[], cx: number, cy: number, r: number, segments = 16): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    out.push(cx, cy, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r)
  }
}

export interface Point {
  x: number
  y: number
}

/** Stroked path with round joins and caps. */
export function pushPath(out: number[], points: Point[], halfWidth: number): void {
  for (let i = 0; i < points.length - 1; i++) {
    pushSegment(out, points[i]!.x, points[i]!.y, points[i + 1]!.x, points[i + 1]!.y, halfWidth)
  }
  for (const p of points) pushCircle(out, p.x, p.y, halfWidth, 8)
}
