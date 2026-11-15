import type { ChartConfig } from '../types.ts'
import { Batch } from './batch.ts'
import {
  bboxOf,
  paintFor,
  paletteFill,
  pick,
  representative,
  solid,
  toFill,
  type Fill,
  type Paint,
  type RGBA,
} from './colors.ts'
import { interpolate } from './geometry/curve.ts'
import { pushPath, pushCircle, type Point } from './geometry/line.ts'
import { pushSector, pushSectorOutline } from './geometry/pie.ts'
import { pushFan, pushRect, pushRing, roundedRectPath, type Radii } from './geometry/rect.ts'
import { cartesianPlotArea, pieArea, type Rect } from './layout.ts'
import { formatNumber, linearScale, niceTicks } from './scale.ts'

/** Triangle list in CSS pixels (x, y pairs). */
export interface Mesh {
  vertices: Float32Array
  paint: Paint
  /** Clip drawing to the plot area (used for scrollable series). */
  clip?: boolean
}

export interface Tick {
  pos: number
  label: string
}

export interface LegendItem {
  label: string
  fill: Fill
}

interface ShapeBase {
  datasetIndex: number
  index: number
  label: string
  datasetLabel?: string
  value: number
  /** Representative solid color (tooltip swatch, highlight dot). */
  color: RGBA
  /** Pie only. */
  percent?: number
}

export type Shape =
  | (ShapeBase & { kind: 'rect'; x: number; y: number; w: number; h: number; radii: Radii })
  | (ShapeBase & { kind: 'point'; x: number; y: number })
  | (ShapeBase & { kind: 'sector'; fill: Fill; cx: number; cy: number; r: number; start: number; end: number })

export interface Scene {
  meshes: Mesh[]
  /** Interactive elements, used for hit testing, highlighting and tooltips. */
  shapes: Shape[]
  plot: Rect
  xTicks: Tick[]
  yTicks: Tick[]
  /** Size in px per category along `categoryAxis`, used by the overlay to thin out labels. */
  band: number
  /** Current (clamped) scroll in px along `categoryAxis`. */
  offset: number
  /** Axis along which categories (and scrolling) run on screen. */
  categoryAxis: 'x' | 'y'
  /** Maximum scroll in px along `categoryAxis`; 0 when everything fits. */
  maxOffset: number
  legend: LegendItem[]
  xAxisName?: string
  yAxisName?: string
}

export interface View {
  offset: number
}

const GRID: RGBA = [0, 0, 0, 0.08]
const AXIS: RGBA = [0, 0, 0, 0.45]
const DEFAULT_LINE_WIDTH = 2.5
const CORNER_SEGMENTS = 6
const MIN_BAND = 36
const MIN_BAND_HORIZONTAL = 28

function mesh(vertices: number[], color: RGBA, clip = false): Mesh {
  return { vertices: new Float32Array(vertices), paint: { kind: 'solid', color }, clip }
}

/** Fills the region between a path and the baseline (a horizontal line, or vertical if `horizontal`). */
function pushArea(out: number[], path: Point[], baseline: number, horizontal: boolean): void {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!
    const b = path[i + 1]!
    if (horizontal) out.push(a.x, a.y, b.x, b.y, baseline, b.y, a.x, a.y, baseline, b.y, baseline, a.y)
    else out.push(a.x, a.y, b.x, b.y, b.x, baseline, a.x, a.y, b.x, baseline, a.x, baseline)
  }
}

const transpose = (pts: Point[]): Point[] => pts.map((p) => ({ x: p.y, y: p.x }))

function pushBar(
  fills: Batch,
  borders: Batch,
  fill: Fill,
  border: Fill,
  r: Rect,
  radii: Radii,
  borderWidth: number,
): void {
  const seg = Math.max(...radii) > 0 ? CORNER_SEGMENTS : 0
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const outer = roundedRectPath(r.x, r.y, r.width, r.height, radii, seg)
  const out: number[] = []
  if (borderWidth <= 0 || borderWidth * 2 >= Math.min(r.width, r.height)) {
    pushFan(out, outer, cx, cy)
    ;(borderWidth > 0 ? borders : fills).add(borderWidth > 0 ? border : fill, out)
    return
  }
  const bw = borderWidth
  const innerRadii = radii.map((v) => Math.max(0, v - bw)) as Radii
  const inner = roundedRectPath(r.x + bw, r.y + bw, r.width - bw * 2, r.height - bw * 2, innerRadii, seg)
  pushRing(out, outer, inner)
  borders.add(border, out)
  const inside: number[] = []
  pushFan(inside, inner, cx, cy)
  fills.add(fill, inside)
}

export function buildScene(config: ChartConfig, width: number, height: number, view: View): Scene {
  return config.type === 'pie' ? buildPie(config, width, height) : buildCartesian(config, width, height, view)
}

function buildCartesian(config: ChartConfig, width: number, height: number, view: View): Scene {
  const { data, type, xAxisName, yAxisName } = config
  const horizontal = config.orientation === 'horizontal'
  const n = Math.max(data.labels.length, ...data.datasets.map((d) => d.values.length), 0)
  const count = Math.max(1, data.datasets.length)
  // Category labels sit left of the plot when horizontal; estimate the room they need.
  const labelWidth = horizontal
    ? Math.min(130, Math.max(24, Math.max(0, ...data.labels.map((l) => l.length)) * 6.5))
    : undefined
  const plot = cartesianPlotArea(width, height, xAxisName, yAxisName, labelWidth)

  // Category overflow: each category gets at least minBand px, the rest scrolls.
  const catStart = horizontal ? plot.y : plot.x
  const catLength = horizontal ? plot.height : plot.width
  const minBand = horizontal
    ? type === 'bar' ? Math.max(MIN_BAND_HORIZONTAL, (count * 14) / 0.8) : MIN_BAND_HORIZONTAL
    : type === 'bar' ? Math.max(MIN_BAND, (count * 14) / 0.8) : MIN_BAND
  const contentLength = Math.max(catLength, n * minBand)
  const band = n > 0 ? contentLength / n : catLength
  const maxOffset = Math.max(0, contentLength - catLength)
  const offset = Math.min(Math.max(view.offset, 0), maxOffset)
  const catCenter = (i: number) => catStart + (i + 0.5) * band - offset

  let min = Infinity
  let max = -Infinity
  // The value axis adapts to the categories currently in view (matters when scrolling).
  const first = Math.max(0, Math.floor(offset / band))
  const last = Math.min(n - 1, Math.ceil((offset + catLength) / band) - 1)
  for (const ds of data.datasets) {
    for (let i = first; i <= last; i++) {
      const v = ds.values[i]
      if (v === undefined || !Number.isFinite(v)) continue
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (min === Infinity) {
    min = 0
    max = 1
  }
  if (type === 'bar') {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  const { ticks, min: d0, max: d1 } = niceTicks(min, max, 5)

  // Value axis runs vertically (bottom→top) or horizontally (left→right).
  const valueScale = horizontal
    ? linearScale(d0, d1, plot.x, plot.x + plot.width)
    : linearScale(d0, d1, plot.y + plot.height, plot.y)
  const zero = valueScale(Math.max(d0, Math.min(d1, 0)))
  const angle = horizontal ? 90 : 180
  const pt = (cat: number, val: number): Point => (horizontal ? { x: val, y: cat } : { x: cat, y: val })

  const meshes: Mesh[] = []
  const shapes: Shape[] = []
  const legend: LegendItem[] = []

  // Grid lines (perpendicular to the value axis)
  const grid: number[] = []
  for (const t of ticks) {
    const v = Math.round(valueScale(t)) - 0.5
    if (horizontal) pushRect(grid, v, plot.y, 1, plot.height)
    else pushRect(grid, plot.x, v, plot.width, 1)
  }
  meshes.push(mesh(grid, GRID))

  const base = (di: number, i: number, v: number, color: RGBA): ShapeBase => ({
    datasetIndex: di,
    index: i,
    label: data.labels[i] ?? String(i + 1),
    datasetLabel: data.datasets[di]!.label,
    value: v,
    color,
  })
  const datasetFill = (di: number, i: number) => toFill(pick(data.datasets[di]!.color, i), paletteFill(di), angle)

  if (type === 'line') {
    data.datasets.forEach((ds, di) => {
      const fill = datasetFill(di, 0)
      // The stroke always uses the first color; a gradient only paints the area below the curve.
      const stroke = fill.kind === 'solid' ? fill.color : fill.stops[0]!.color
      legend.push({ label: ds.label ?? `Series ${di + 1}`, fill })
      const halfWidth = (ds.lineWidth ?? DEFAULT_LINE_WIDTH) / 2
      const markerRadius = Math.max(2.5, halfWidth * 2)
      const mode = ds.interpolation ?? 'linear'

      const area: number[] = []
      const out: number[] = []
      const points: { i: number; v: number; p: Point }[] = []
      let run: Point[] = []
      const flush = () => {
        if (run.length) {
          // Interpolation needs the independent variable on x, so transpose when horizontal.
          const path = horizontal ? transpose(interpolate(transpose(run), mode)) : interpolate(run, mode)
          pushPath(out, path, halfWidth)
          for (const p of run) pushCircle(out, p.x, p.y, markerRadius)
          if (fill.kind === 'linear') pushArea(area, path, zero, horizontal)
        }
        run = []
      }
      ds.values.forEach((v, i) => {
        if (Number.isFinite(v)) {
          const p = pt(catCenter(i), valueScale(v))
          run.push(p)
          points.push({ i, v, p })
        } else flush()
      })
      flush()

      if (area.length) {
        meshes.push({ vertices: new Float32Array(area), paint: paintFor(fill, bboxOf(area)), clip: true })
      }
      meshes.push(mesh(out, stroke, true))
      for (const { i, v, p } of points) shapes.push({ ...base(di, i, v, stroke), kind: 'point', x: p.x, y: p.y })
    })
  } else {
    const fills = new Batch(true)
    const borders = new Batch(true)
    const groupWidth = band * 0.8
    const barWidth = groupWidth / count
    data.datasets.forEach((ds, di) => {
      legend.push({ label: ds.label ?? `Series ${di + 1}`, fill: datasetFill(di, 0) })
      ds.values.forEach((v, i) => {
        if (!Number.isFinite(v)) return
        const cat = catStart + i * band + (band - groupWidth) / 2 + di * barWidth - offset
        const val = valueScale(v)
        const lo = Math.min(val, zero)
        const len = Math.abs(val - zero)
        const rect: Rect = horizontal
          ? { x: lo, y: cat, width: len, height: barWidth }
          : { x: cat, y: lo, width: barWidth, height: len }
        const fill = datasetFill(di, i)
        // Only the end away from the baseline is rounded; the side on the baseline stays square.
        const r = Math.max(0, Math.min(ds.borderRadius ?? 0, barWidth / 2, len))
        const positive = horizontal ? val >= zero : val <= zero
        const radii: Radii = horizontal
          ? positive ? [0, r, r, 0] : [r, 0, 0, r]
          : positive ? [r, r, 0, 0] : [0, 0, r, r]
        const borderWidth = Math.max(0, ds.borderWidth ?? (ds.borderColor ? 1 : 0))
        const border = toFill(pick(ds.borderColor, i), solid([0, 0, 0, 0.35]), angle)
        if (len > 0) pushBar(fills, borders, fill, border, rect, radii, borderWidth)
        shapes.push({
          ...base(di, i, v, representative(fill)),
          kind: 'rect',
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          radii,
        })
      })
    })
    meshes.push(...fills.meshes(), ...borders.meshes())
  }

  // Axis lines: the category axis edge plus the zero baseline
  const axes: number[] = []
  if (horizontal) {
    pushRect(axes, plot.x, plot.y + plot.height - 0.5, plot.width, 1)
    pushRect(axes, Math.round(zero) - 0.5, plot.y, 1, plot.height)
  } else {
    pushRect(axes, plot.x - 0.5, plot.y, 1, plot.height)
    pushRect(axes, plot.x, Math.round(zero) - 0.5, plot.width, 1)
  }
  meshes.push(mesh(axes, AXIS))

  const categoryTicks: Tick[] = Array.from({ length: n }, (_, i) => ({
    pos: catCenter(i),
    label: data.labels[i] ?? String(i + 1),
  }))
  const valueTicks: Tick[] = ticks.map((t) => ({ pos: valueScale(t), label: formatNumber(t) }))

  return {
    meshes,
    shapes,
    plot,
    band,
    offset,
    categoryAxis: horizontal ? 'y' : 'x',
    maxOffset,
    xTicks: horizontal ? valueTicks : categoryTicks,
    yTicks: horizontal ? categoryTicks : valueTicks,
    legend,
    xAxisName,
    yAxisName,
  }
}

function buildPie(config: ChartConfig, width: number, height: number): Scene {
  const { data } = config
  const ds = data.datasets[0]
  const area = pieArea(width, height)
  const values = (ds?.values ?? []).map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const total = values.reduce((a, b) => a + b, 0)
  const fills = values.map((_, i) => toFill(pick(ds?.color, i), paletteFill(i), 180))
  const borderWidth = Math.max(0, ds?.borderWidth ?? (ds?.borderColor ? 1 : 0))

  const meshes: Mesh[] = []
  const outlines = new Batch(false)
  const shapes: Shape[] = []
  if (total > 0) {
    const cx = area.x + area.width / 2
    const cy = area.y + area.height / 2
    const r = Math.min(area.width, area.height) / 2
    let angle = -Math.PI / 2
    values.forEach((v, i) => {
      const sweep = (v / total) * Math.PI * 2
      const out: number[] = []
      pushSector(out, cx, cy, r, angle, angle + sweep)
      if (out.length) {
        meshes.push({ vertices: new Float32Array(out), paint: paintFor(fills[i]!, bboxOf(out)), clip: false })
      }
      if (borderWidth > 0 && v > 0) {
        const stroke: number[] = []
        pushSectorOutline(stroke, cx, cy, r, angle, angle + sweep, borderWidth / 2)
        outlines.add(toFill(pick(ds?.borderColor, i), solid([1, 1, 1, 1]), 180), stroke)
      }
      if (v > 0) {
        shapes.push({
          kind: 'sector',
          datasetIndex: 0,
          index: i,
          label: data.labels[i] ?? String(i + 1),
          datasetLabel: ds?.label,
          value: v,
          percent: (v / total) * 100,
          color: representative(fills[i]!),
          fill: fills[i]!,
          cx,
          cy,
          r,
          start: angle,
          end: angle + sweep,
        })
      }
      angle += sweep
    })
  }
  meshes.push(...outlines.meshes())

  return {
    meshes,
    shapes,
    plot: area,
    band: 0,
    offset: 0,
    categoryAxis: 'x',
    maxOffset: 0,
    xTicks: [],
    yTicks: [],
    legend: values.map((v, i) => ({
      label: `${data.labels[i] ?? i + 1}${total > 0 ? ` (${Math.round((v / total) * 100)}%)` : ''}`,
      fill: fills[i]!,
    })),
  }
}
