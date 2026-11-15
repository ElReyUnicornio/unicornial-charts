import { bboxOf, paintFor, type Fill } from './colors.ts'
import type { Mesh } from './scene.ts'

/**
 * Collects geometry into as few meshes as possible: solid fills sharing a color are
 * merged into one draw call; gradients get their own mesh (bounds = the added geometry).
 */
export class Batch {
  private solids = new Map<string, { color: [number, number, number, number]; verts: number[] }>()
  private gradients: Mesh[] = []
  private clip: boolean

  constructor(clip: boolean) {
    this.clip = clip
  }

  add(fill: Fill, verts: number[]): void {
    if (verts.length === 0) return
    if (fill.kind === 'solid') {
      const key = fill.color.join(',')
      let entry = this.solids.get(key)
      if (!entry) this.solids.set(key, (entry = { color: fill.color, verts: [] }))
      for (let i = 0; i < verts.length; i++) entry.verts.push(verts[i]!)
    } else {
      this.gradients.push({
        vertices: new Float32Array(verts),
        paint: paintFor(fill, bboxOf(verts)),
        clip: this.clip,
      })
    }
  }

  meshes(): Mesh[] {
    const solids: Mesh[] = [...this.solids.values()].map((e) => ({
      vertices: new Float32Array(e.verts),
      paint: { kind: 'solid', color: e.color },
      clip: this.clip,
    }))
    return [...solids, ...this.gradients]
  }
}
