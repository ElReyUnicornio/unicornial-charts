import { paintFor, toCss, type Fill } from '../engine/colors.ts'
import type { Tooltip } from '../engine/hit.ts'
import type { Scene } from '../engine/scene.ts'

const TEXT = '#333'
const FONT = '12px system-ui, sans-serif'

/** 2D canvas stacked on top of the WebGL canvas, used for all text. */
export class Overlay {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private restoreParentPosition: (() => void) | null = null

  private target: HTMLCanvasElement

  constructor(target: HTMLCanvasElement) {
    this.target = target
    this.canvas = document.createElement('canvas')
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas is not supported in this environment')
    this.ctx = ctx

    const parent = target.parentElement
    if (!parent) throw new Error('The chart canvas must be attached to the DOM')
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative'
      this.restoreParentPosition = () => (parent.style.position = '')
    }
    Object.assign(this.canvas.style, { position: 'absolute', pointerEvents: 'none' })
    target.insertAdjacentElement('afterend', this.canvas)
  }

  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    Object.assign(this.canvas.style, {
      left: `${this.target.offsetLeft}px`,
      top: `${this.target.offsetTop}px`,
      width: `${width}px`,
      height: `${height}px`,
    })
  }

  draw(scene: Scene, width: number, height: number, dpr: number, tooltip: Tooltip | null): void {
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.font = FONT
    ctx.fillStyle = TEXT

    const { plot } = scene

    const byX = scene.categoryAxis === 'x'

    // Y labels: categories (thinned and clipped) when horizontal, values otherwise
    ctx.save()
    if (!byX) {
      ctx.beginPath()
      ctx.rect(0, plot.y, plot.x, plot.height)
      ctx.clip()
    }
    const yStep = byX ? 1 : Math.max(1, Math.ceil(16 / Math.max(1, scene.band)))
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    scene.yTicks.forEach((t, i) => {
      if (i % yStep === 0) ctx.fillText(t.label, plot.x - 8, t.pos)
    })
    ctx.restore()

    // X labels: categories (thinned and clipped) when vertical, values otherwise
    if (scene.xTicks.length) {
      const widest = Math.max(...scene.xTicks.map((t) => ctx.measureText(t.label).width))
      const step = byX ? Math.max(1, Math.ceil((widest + 8) / Math.max(1, scene.band))) : 1
      ctx.save()
      if (byX) {
        ctx.beginPath()
        ctx.rect(plot.x, plot.y + plot.height, plot.width, height - plot.y - plot.height)
        ctx.clip()
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      scene.xTicks.forEach((t, i) => {
        if (i % step === 0) ctx.fillText(t.label, t.pos, plot.y + plot.height + 8)
      })
      ctx.restore()
    }

    // Axis names
    if (scene.xAxisName) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(scene.xAxisName, plot.x + plot.width / 2, height - 4)
    }
    if (scene.yAxisName) {
      ctx.save()
      ctx.translate(14, plot.y + plot.height / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(scene.yAxisName, 0, 0)
      ctx.restore()
    }

    // Legend
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let x = plot.x
    for (const item of scene.legend) {
      ctx.fillStyle = this.fillStyle(item.fill, x, 8, 10, 10)
      ctx.fillRect(x, 8, 10, 10)
      ctx.fillStyle = TEXT
      ctx.fillText(item.label, x + 14, 13)
      x += 14 + ctx.measureText(item.label).width + 16
    }

    if (tooltip) this.drawTooltip(tooltip, width, height)
  }

  /** Canvas style for a fill (solid color or gradient) over a box. */
  private fillStyle(fill: Fill, x: number, y: number, w: number, h: number): string | CanvasGradient {
    const paint = paintFor(fill, { x, y, width: w, height: h })
    if (paint.kind === 'solid') return toCss(paint.color)
    return toCss(paint.stops[0]!.color);
  }

  private drawTooltip(t: Tooltip, width: number, height: number): void {
    const ctx = this.ctx
    const pad = 8
    const lineH = 16
    ctx.font = `bold ${FONT}`
    const titleW = ctx.measureText(t.title).width
    ctx.font = FONT
    const textW = ctx.measureText(t.text).width + 14
    const w = Math.max(titleW, textW) + pad * 2
    const h = lineH * 2 + pad * 2 - 4

    let x = t.x - w / 2
    let y = t.y - h - 10
    if (y < 0) y = t.y + 14
    x = Math.min(Math.max(x, 2), Math.max(2, width - w - 2))
    y = Math.min(Math.max(y, 2), Math.max(2, height - h - 2))

    ctx.fillStyle = 'rgba(20, 20, 24, 0.92)'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.fill()

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${FONT}`
    ctx.fillText(t.title, x + pad, y + pad + 6)
    ctx.font = FONT
    ctx.fillStyle = toCss(t.color)
    ctx.fillRect(x + pad, y + pad + lineH + 1, 8, 8)
    ctx.fillStyle = '#fff'
    ctx.fillText(t.text, x + pad + 14, y + pad + lineH + 5)
  }

  dispose(): void {
    this.canvas.remove()
    this.restoreParentPosition?.()
  }
}
