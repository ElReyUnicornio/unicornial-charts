import { pushCircle, pushSegment } from './line.ts'

/** Appends a circular sector (angles in radians, clockwise on screen) as triangles. */
export function pushSector(out: number[], cx: number, cy: number, r: number, start: number, end: number): void {
  const sweep = end - start
  if (sweep <= 0) return
  const steps = Math.max(1, Math.ceil((sweep / (Math.PI * 2)) * 128))
  for (let i = 0; i < steps; i++) {
    const a0 = start + (sweep * i) / steps
    const a1 = start + (sweep * (i + 1)) / steps
    out.push(cx, cy, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r)
  }
}

/** Appends a stroke centered on the sector outline (arc + both radial edges). */
export function pushSectorOutline(
  out: number[],
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
  halfWidth: number,
): void {
  const steps = Math.max(2, Math.ceil(((end - start) / (Math.PI * 2)) * 128))
  const at = (a: number) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  let prev = at(start)
  for (let i = 1; i <= steps; i++) {
    const p = at(start + ((end - start) * i) / steps)
    pushSegment(out, prev.x, prev.y, p.x, p.y, halfWidth)
    prev = p
  }
  const a = at(start)
  const b = at(end)
  pushSegment(out, cx, cy, a.x, a.y, halfWidth)
  pushSegment(out, cx, cy, b.x, b.y, halfWidth)
  for (const p of [a, b, { x: cx, y: cy }]) pushCircle(out, p.x, p.y, halfWidth, 12)
}
