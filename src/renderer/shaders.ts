import { MAX_STOPS } from '../engine/colors.ts'

/** Shared vertex shader: positions in CSS px; v_pos is forwarded for gradients. */
export const VERTEX_SRC = `
attribute vec2 a_pos;
uniform vec2 u_res;
varying vec2 v_pos;
void main() {
  v_pos = a_pos;
  vec2 clip = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`

export const SOLID_FRAGMENT_SRC = `
precision mediump float;
uniform vec4 u_color;
void main() {
  gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a);
}
`

/** Linear gradient with up to MAX_STOPS stops, driven only by uniforms. */
export const GRADIENT_FRAGMENT_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define MAX_STOPS ${MAX_STOPS}
uniform vec2 u_start;
uniform vec2 u_end;
uniform int u_count;
uniform vec4 u_colors[MAX_STOPS];
uniform float u_offsets[MAX_STOPS];
varying vec2 v_pos;
void main() {
  vec2 d = u_end - u_start;
  float t = clamp(dot(v_pos - u_start, d) / dot(d, d), 0.0, 1.0);
  vec4 c = u_colors[0];
  for (int i = 1; i < MAX_STOPS; i++) {
    if (i >= u_count) break;
    float a = u_offsets[i - 1];
    float b = u_offsets[i];
    if (t >= a) c = mix(u_colors[i - 1], u_colors[i], clamp((t - a) / max(b - a, 0.00001), 0.0, 1.0));
  }
  gl_FragColor = vec4(c.rgb * c.a, c.a);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create shader')
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${log}`)
  }
  return shader
}

/** Links the shared vertex shader with a fragment shader; `a_pos` is bound to location 0. */
export function createProgram(gl: WebGLRenderingContext, fragmentSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc)
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create program')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.bindAttribLocation(program, 0, 'a_pos')
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${log}`)
  }
  return program
}
