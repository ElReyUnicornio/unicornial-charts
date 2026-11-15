import type { Interpolation } from '../../types.ts'
import type { Point } from './line.ts'

/** Turns data points (x strictly increasing) into the polyline that gets drawn. */
export function interpolate(points: Point[], mode: Interpolation): Point[] {
  if (points.length < 2) return points
  if (mode === 'step') return stepAfter(points)
  if (mode === 'smooth') return monotoneCubic(points)
  return points
}

function stepAfter(points: Point[]): Point[] {
  const out: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    out.push({ x: points[i]!.x, y: points[i - 1]!.y }, points[i]!)
  }
  return out
}

/** Monotone cubic Hermite (Fritsch–Carlson): smooth, never overshoots the data. */
function monotoneCubic(p: Point[]): Point[] {
  const n = p.length
  if (n < 3) return p
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const d = p[i + 1]!.x - p[i]!.x
    if (d <= 0) return p
    dx.push(d)
    m.push((p[i + 1]!.y - p[i]!.y) / d)
  }

  const t: number[] = new Array(n)
  t[0] = m[0]!
  t[n - 1] = m[n - 2]!
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i]! / m[i]!
    const b = t[i + 1]! / m[i]!
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      t[i] = tau * a * m[i]!
      t[i + 1] = tau * b * m[i]!
    }
  }

  const out: Point[] = [p[0]!]
  for (let i = 0; i < n - 1; i++) {
    const { x: x0, y: y0 } = p[i]!
    const y1 = p[i + 1]!.y
    const d = dx[i]!
    const steps = Math.min(40, Math.max(4, Math.ceil(d / 5)))
    for (let k = 1; k <= steps; k++) {
      const u = k / steps
      const u2 = u * u
      const u3 = u2 * u
      out.push({
        x: x0 + u * d,
        y:
          (2 * u3 - 3 * u2 + 1) * y0 +
          (u3 - 2 * u2 + u) * d * t[i]! +
          (-2 * u3 + 3 * u2) * y1 +
          (u3 - u2) * d * t[i + 1]!,
      })
    }
  }
  return out
}
