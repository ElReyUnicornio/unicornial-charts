import { highlightMeshes, hitTest, sameShape, tooltipOf } from './engine/hit.ts'
import { buildScene, type Scene, type Shape } from './engine/scene.ts'
import { Overlay } from './renderer/Overlay.ts'
import { Renderer } from './renderer/Renderer.ts'
import type { ChartConfig } from './types.ts'

const TYPES = ['line', 'bar', 'pie']
/** Pointer travel (px) after which a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4

function validate(config: ChartConfig): void {
  if (!config || !TYPES.includes(config.type)) {
    throw new Error(`Invalid chart type. Expected one of: ${TYPES.join(', ')}`)
  }
  if (!config.data || !Array.isArray(config.data.labels) || !Array.isArray(config.data.datasets)) {
    throw new Error('config.data must be { labels: string[], datasets: { values: number[] }[] }')
  }
}

interface Drag {
  pointerId: number
  start: number
  startOffset: number
  moved: boolean
}

/**
 * WebGL chart. The canvas must be attached to the DOM and sized with CSS
 * (e.g. `display: block; width: 100%; height: 300px`).
 *
 * Interaction: hover shows a tooltip and highlights the element, click calls
 * `config.onClick`, and dragging pans horizontally when the data overflows.
 */
export class Chart {
  private canvas: HTMLCanvasElement
  private config: ChartConfig
  private renderer: Renderer
  private overlay: Overlay
  private observer: ResizeObserver
  private frame = 0
  private width = 0
  private height = 0
  private destroyed = false

  private scene: Scene | null = null
  private offset = 0
  private hover: Shape | null = null
  private drag: Drag | null = null
  private prevStyle: { cursor: string; touchAction: string }

  constructor(canvas: HTMLCanvasElement, config: ChartConfig) {
    validate(config)
    this.canvas = canvas
    this.config = config
    this.renderer = new Renderer(canvas)
    this.overlay = new Overlay(canvas)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)

    this.prevStyle = { cursor: canvas.style.cursor, touchAction: canvas.style.touchAction }
    this.applyTouchAction()
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('pointerleave', this.onPointerLeave)

    this.resize()
  }

  /** Merges a partial config and re-renders. */
  update(patch: Partial<ChartConfig>): void {
    const next = { ...this.config, ...patch }
    validate(next)
    this.config = next
    this.scene = null
    this.applyTouchAction()
    this.schedule()
  }

  /** Re-reads the canvas CSS size and redraws. Called automatically on resize. */
  resize(): void {
    if (this.destroyed) return
    this.width = this.canvas.clientWidth
    this.height = this.canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    this.renderer.resize(this.width, this.height, dpr)
    this.overlay.resize(this.width, this.height, dpr)
    this.scene = null
    this.schedule()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onPointerDown)
    c.removeEventListener('pointermove', this.onPointerMove)
    c.removeEventListener('pointerup', this.onPointerUp)
    c.removeEventListener('pointercancel', this.onPointerCancel)
    c.removeEventListener('pointerleave', this.onPointerLeave)
    c.style.cursor = this.prevStyle.cursor
    c.style.touchAction = this.prevStyle.touchAction
    this.overlay.dispose()
    this.renderer.dispose()
  }

  // --- Interaction -------------------------------------------------------

  /** Let the browser keep page scrolling along the axis the chart does not pan on. */
  private applyTouchAction(): void {
    this.canvas.style.touchAction = this.config.orientation === 'horizontal' && this.config.type !== 'pie' ? 'pan-x' : 'pan-y'
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private hitAt(p: { x: number; y: number }): Shape | null {
    return hitTest(this.ensureScene(), p.x, p.y)
  }

  private setHover(shape: Shape | null): void {
    if (!sameShape(this.hover, shape)) {
      this.hover = shape
      this.schedule()
    }
    this.updateCursor()
  }

  private setOffset(value: number): void {
    const clamped = Math.min(Math.max(value, 0), this.ensureScene().maxOffset)
    if (clamped === this.offset) return
    this.offset = clamped
    this.scene = null
    this.schedule()
  }

  private updateCursor(): void {
    const scrollable = this.ensureScene().maxOffset > 0
    this.canvas.style.cursor = this.drag?.moved
      ? 'grabbing'
      : this.hover
        ? 'pointer'
        : scrollable
          ? 'grab'
          : this.prevStyle.cursor
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this.drag = { pointerId: e.pointerId, start: this.local(e)[this.ensureScene().categoryAxis], startOffset: this.offset, moved: false }
    this.canvas.setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.local(e)
    const drag = this.drag
    if (drag && drag.pointerId === e.pointerId) {
      const dx = p[this.ensureScene().categoryAxis] - drag.start
      if (!drag.moved && Math.abs(dx) > DRAG_THRESHOLD && this.ensureScene().maxOffset > 0) {
        drag.moved = true
        this.setHover(null)
      }
      if (drag.moved) {
        this.setOffset(drag.startOffset - dx)
        this.updateCursor()
        return
      }
    }
    this.setHover(this.hitAt(p))
  }

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag
    if (!drag || drag.pointerId !== e.pointerId) return
    this.drag = null
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)

    const hit = this.hitAt(this.local(e))
    if (!drag.moved && hit) {
      this.config.onClick?.({
        datasetIndex: hit.datasetIndex,
        index: hit.index,
        label: hit.label,
        datasetLabel: hit.datasetLabel,
        value: hit.value,
        nativeEvent: e,
      })
    }
    this.setHover(e.pointerType === 'mouse' || !drag.moved ? hit : null)
  }

  private onPointerCancel = (): void => {
    this.drag = null
    this.setHover(null)
  }

  private onPointerLeave = (): void => {
    if (!this.drag) this.setHover(null)
  }

  // --- Rendering ---------------------------------------------------------

  private ensureScene(): Scene {
    if (!this.scene) {
      this.scene = buildScene(this.config, this.width, this.height, { offset: this.offset })
      this.offset = this.scene.offset
    }
    return this.scene
  }

  private schedule(): void {
    if (this.frame || this.destroyed) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private render(): void {
    if (this.destroyed || this.width === 0 || this.height === 0) return
    const dpr = window.devicePixelRatio || 1
    const scene = this.ensureScene()
    // Shapes are rebuilt with the scene; re-resolve the hovered one.
    const hover = this.hover
      ? (scene.shapes.find((s) => sameShape(s, this.hover)) ?? null)
      : null
    this.hover = hover
    const meshes = hover ? [...scene.meshes, ...highlightMeshes(hover)] : scene.meshes
    this.renderer.draw(meshes, this.width, this.height, scene.plot)
    this.overlay.draw(scene, this.width, this.height, dpr, hover ? tooltipOf(hover) : null)
  }
}
