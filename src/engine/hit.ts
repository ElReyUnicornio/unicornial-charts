import { bboxOf, paintFor, type Paint, type RGBA } from './colors.ts'
import { pushCircle } from './geometry/line.ts'
import { pushSector, pushSectorOutline } from './geometry/pie.ts'
import { pushFan, roundedRectPath } from './geometry/rect.ts'
import { formatNumber } from './scale.ts'
import type { Mesh, Scene, Shape } from './scene.ts'

const POINT_RADIUS = 16
const GROW = 8
const BORDER = 1.75

export function sameShape(a: Shape | null, b: Shape | null): boolean {
  return a === b || (!!a && !!b && a.datasetIndex === b.datasetIndex && a.index === b.index)
}

/** Finds the shape under the pointer (CSS px relative to the canvas). */
export function hitTest(scene: Scene, x: number, y: number): Shape | null {
  const { plot } = scene
  const inPlot = x >= plot.x && x <= plot.x + plot.width && y >= plot.y && y <= plot.y + plot.height
  let best: Shape | null = null
  let bestDist = Infinity

  for (const s of scene.shapes) {
    if (s.kind === 'sector') {
      const dx = x - s.cx
      const dy = y - s.cy
      if (Math.hypot(dx, dy) > s.r) continue
      let a = Math.atan2(dy, dx)
      if (a < -Math.PI / 2) a += Math.PI * 2
      if (a >= s.start && a < s.end) return s
      continue
    }
    if (!inPlot) continue
    if (s.kind === 'rect') {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s
    } else {
      const d = Math.hypot(x - s.x, y - s.y)
      if (d <= POINT_RADIUS && d < bestDist) {
        best = s
        bestDist = d
      }
    }
  }
  return best
}

function mesh(vertices: number[], paint: Paint, clip: boolean): Mesh {
  return { vertices: new Float32Array(vertices), paint, clip }
}

const solidPaint = (color: RGBA): Paint => ({ kind: 'solid', color })

/** Extra meshes drawn on top of the chart to emphasize the hovered shape. */
export function highlightMeshes(shape: Shape): Mesh[] {
  if (shape.kind === 'rect') {
    const out: number[] = []
    const seg = Math.max(...shape.radii) > 0 ? 6 : 0
    pushFan(
      out,
      roundedRectPath(shape.x, shape.y, shape.w, shape.h, shape.radii, seg),
      shape.x + shape.w / 2,
      shape.y + shape.h / 2,
    )
    return [mesh(out, solidPaint([1, 1, 1, 0.3]), true)]
  }
  if (shape.kind === 'point') {
    const ring: number[] = []
    const dot: number[] = []
    pushCircle(ring, shape.x, shape.y, 6.5, 24)
    pushCircle(dot, shape.x, shape.y, 4.5, 24)
    return [mesh(ring, solidPaint([1, 1, 1, 1]), true), mesh(dot, solidPaint(shape.color), true)]
  }

  // Pie slice: soft shadow, enlarged fill and a white border (arc + both radial edges).
  const { cx, cy, start, end } = shape
  const r = shape.r + GROW
  const shadow: number[] = []
  const fill: number[] = []
  const border: number[] = []
  pushSector(shadow, cx, cy, r + 5, start, end)
  pushSector(fill, cx, cy, r, start, end)
  pushSectorOutline(border, cx, cy, r, start, end, BORDER)

  return [
    mesh(shadow, solidPaint([0, 0, 0, 0.14]), false),
    mesh(fill, paintFor(shape.fill, bboxOf(fill)), false),
    mesh(border, solidPaint([1, 1, 1, 1]), false),
  ]
}

export interface Tooltip {
  /** Anchor point in CSS px. */
  x: number
  y: number
  title: string
  color: RGBA
  text: string
}

export function tooltipOf(shape: Shape): Tooltip {
  let x: number
  let y: number
  if (shape.kind === 'rect') {
    x = shape.x + shape.w / 2
    y = shape.y
  } else if (shape.kind === 'point') {
    x = shape.x
    y = shape.y
  } else {
    const mid = (shape.start + shape.end) / 2
    x = shape.cx + Math.cos(mid) * shape.r * 0.6
    y = shape.cy + Math.sin(mid) * shape.r * 0.6
  }
  const value = formatNumber(shape.value)
  const text =
    shape.kind === 'sector'
      ? `${value} (${shape.percent!.toFixed(1)}%)`
      : `${shape.datasetLabel ?? `Series ${shape.datasetIndex + 1}`}: ${value}`
  return { x, y, title: shape.label, color: shape.color, text }
}
