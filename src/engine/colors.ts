import type { ChartColor } from '../types.ts'
import type { Point } from './geometry/line.ts'
import type { Rect } from './layout.ts'

export type RGBA = [number, number, number, number]

export const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
]

export const MAX_STOPS = 8

export interface Stop {
  offset: number
  color: RGBA
}

/** Resolved style of an element, independent of its position. */
export type Fill =
  | { kind: 'solid'; color: RGBA }
  | { kind: 'linear'; angle: number; stops: Stop[] }

/** Fill resolved against a bounding box, ready for the GPU. */
export type Paint =
  | { kind: 'solid'; color: RGBA }
  | { kind: 'linear'; start: Point; end: Point; stops: Stop[] }

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Returns null if invalid. */
export function parseColor(input: string | undefined): RGBA | null {
  if (!input) return null
  const s = input.trim().toLowerCase()

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  if (hex) {
    let h = hex[1]!
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1]
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(s)
  if (rgb) {
    return [
      Math.min(255, Number(rgb[1])) / 255,
      Math.min(255, Number(rgb[2])) / 255,
      Math.min(255, Number(rgb[3])) / 255,
      rgb[4] === undefined ? 1 : Math.min(1, Number(rgb[4])),
    ]
  }
  return null
}

export function paletteColor(index: number): RGBA {
  return parseColor(PALETTE[index % PALETTE.length])!
}

export function solid(color: RGBA): Fill {
  return { kind: 'solid', color }
}

export function paletteFill(index: number): Fill {
  return solid(paletteColor(index))
}

/** Picks the entry for a data point from a single value or a per-point array. */
export function pick<T>(value: T | T[] | undefined, index: number): T | undefined {
  return Array.isArray(value) ? value[index % value.length] : value
}

/** Converts a user color/gradient into a Fill, or returns `fallback` if it is missing/invalid. */
export function toFill(input: ChartColor | undefined, fallback: Fill, defaultAngle: number): Fill {
  if (input === undefined) return fallback
  if (typeof input === 'string') {
    const c = parseColor(input)
    return c ? solid(c) : fallback
  }
  if (input.type !== 'linear' || !Array.isArray(input.stops)) return fallback

  const stops: Stop[] = []
  for (const s of input.stops) {
    const color = parseColor(s.color)
    if (color && Number.isFinite(s.offset)) stops.push({ offset: Math.min(1, Math.max(0, s.offset)), color })
  }
  if (stops.length === 0) return fallback
  if (stops.length === 1) return solid(stops[0]!.color)
  stops.sort((a, b) => a.offset - b.offset)
  return { kind: 'linear', angle: input.angle ?? defaultAngle, stops: stops.slice(0, MAX_STOPS) }
}

export function bboxOf(vertices: ArrayLike<number>): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i + 1 < vertices.length; i += 2) {
    const x = vertices[i]!, y = vertices[i + 1]!
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Resolves a Fill against a box using CSS gradient-line semantics. */
export function paintFor(fill: Fill, box: Rect): Paint {
  if (fill.kind === 'solid') return { kind: 'solid', color: fill.color }
  const rad = (fill.angle * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const len = Math.abs(box.width * dx) + Math.abs(box.height * dy)
  if (len < 1e-3) return { kind: 'solid', color: fill.stops[0]!.color }
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return {
    kind: 'linear',
    start: { x: cx - (dx * len) / 2, y: cy - (dy * len) / 2 },
    end: { x: cx + (dx * len) / 2, y: cy + (dy * len) / 2 },
    stops: fill.stops,
  }
}

export function colorAt(stops: Stop[], t: number): RGBA {
  if (t <= stops[0]!.offset) return stops[0]!.color
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!, b = stops[i]!
    if (t <= b.offset) {
      const k = b.offset === a.offset ? 1 : (t - a.offset) / (b.offset - a.offset)
      return a.color.map((c, j) => c + (b.color[j]! - c) * k) as RGBA
    }
  }
  return stops[stops.length - 1]!.color
}

/** CPU evaluation of a paint at a position (mirrors the gradient shader). */
export function paintColorAt(paint: Paint, x: number, y: number): RGBA {
  if (paint.kind === 'solid') return paint.color
  const dx = paint.end.x - paint.start.x
  const dy = paint.end.y - paint.start.y
  const t = ((x - paint.start.x) * dx + (y - paint.start.y) * dy) / (dx * dx + dy * dy)
  return colorAt(paint.stops, Math.min(1, Math.max(0, t)))
}

/** A single representative color of a fill (used for swatches). */
export function representative(fill: Fill): RGBA {
  return fill.kind === 'solid' ? fill.color : colorAt(fill.stops, 0.5)
}

export function toCss([r, g, b, a]: RGBA): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
}
