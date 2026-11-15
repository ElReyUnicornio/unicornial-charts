import { MAX_STOPS } from '../engine/colors.ts'
import type { Rect } from '../engine/layout.ts'
import type { Mesh } from '../engine/scene.ts'
import { createProgram, GRADIENT_FRAGMENT_SRC, SOLID_FRAGMENT_SRC } from './shaders.ts'

export class Renderer {
  private gl: WebGLRenderingContext
  private canvas: HTMLCanvasElement
  private buffer: WebGLBuffer

  private solid: WebGLProgram
  private solidRes: WebGLUniformLocation
  private solidColor: WebGLUniformLocation

  private gradient: WebGLProgram
  private gradRes: WebGLUniformLocation
  private gradStart: WebGLUniformLocation
  private gradEnd: WebGLUniformLocation
  private gradCount: WebGLUniformLocation
  private gradColors: WebGLUniformLocation
  private gradOffsets: WebGLUniformLocation

  private colorData = new Float32Array(MAX_STOPS * 4)
  private offsetData = new Float32Array(MAX_STOPS)

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = (canvas.getContext('webgl2', { antialias: true }) ??
      canvas.getContext('webgl', { antialias: true })) as WebGLRenderingContext | null
    if (!gl) throw new Error('WebGL is not supported in this environment')
    this.gl = gl

    this.solid = createProgram(gl, SOLID_FRAGMENT_SRC)
    this.gradient = createProgram(gl, GRADIENT_FRAGMENT_SRC)
    const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name)!
    this.solidRes = u(this.solid, 'u_res')
    this.solidColor = u(this.solid, 'u_color')
    this.gradRes = u(this.gradient, 'u_res')
    this.gradStart = u(this.gradient, 'u_start')
    this.gradEnd = u(this.gradient, 'u_end')
    this.gradCount = u(this.gradient, 'u_count')
    this.gradColors = u(this.gradient, 'u_colors')
    this.gradOffsets = u(this.gradient, 'u_offsets')

    const buffer = gl.createBuffer()
    if (!buffer) throw new Error('Could not create buffer')
    this.buffer = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(0) // a_pos, bound to location 0 in both programs
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  /** Sets the drawing buffer size. width/height are CSS px. */
  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
  }

  draw(meshes: Mesh[], width: number, height: number, clip: Rect): void {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.solid)
    gl.uniform2f(this.solidRes, width, height)
    gl.useProgram(this.gradient)
    gl.uniform2f(this.gradRes, width, height)

    const sx = this.canvas.width / width
    const sy = this.canvas.height / height
    const scissor: [number, number, number, number] = [
      Math.floor(clip.x * sx),
      Math.floor((height - clip.y - clip.height) * sy),
      Math.ceil(clip.width * sx),
      Math.ceil(clip.height * sy),
    ]

    let current: WebGLProgram | null = null
    for (const m of meshes) {
      if (m.vertices.length === 0) continue
      if (m.clip) {
        gl.enable(gl.SCISSOR_TEST)
        gl.scissor(...scissor)
      } else gl.disable(gl.SCISSOR_TEST)

      const paint = m.paint
      const program = paint.kind === 'solid' ? this.solid : this.gradient
      if (program !== current) {
        gl.useProgram(program)
        current = program
      }
      if (paint.kind === 'solid') {
        gl.uniform4f(this.solidColor, ...paint.color)
      } else {
        const { stops } = paint
        for (let i = 0; i < MAX_STOPS; i++) {
          const s = stops[Math.min(i, stops.length - 1)]!
          this.colorData.set(s.color, i * 4)
          this.offsetData[i] = s.offset
        }
        gl.uniform2f(this.gradStart, paint.start.x, paint.start.y)
        gl.uniform2f(this.gradEnd, paint.end.x, paint.end.y)
        gl.uniform1i(this.gradCount, Math.min(stops.length, MAX_STOPS))
        gl.uniform4fv(this.gradColors, this.colorData)
        gl.uniform1fv(this.gradOffsets, this.offsetData)
      }
      gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.DYNAMIC_DRAW)
      gl.drawArrays(gl.TRIANGLES, 0, m.vertices.length / 2)
    }
    gl.disable(gl.SCISSOR_TEST)
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteBuffer(this.buffer)
    gl.deleteProgram(this.solid)
    gl.deleteProgram(this.gradient)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
