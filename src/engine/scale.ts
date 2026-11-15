/** Returns a function mapping [d0, d1] to [r0, r1]. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0
  if (span === 0) return () => (r0 + r1) / 2
  return (v) => r0 + ((v - d0) / span) * (r1 - r0)
}

export interface Ticks {
  ticks: number[]
  min: number
  max: number
}

/**
 * "Nice" tick values covering [min, max]: the smallest step of the form 1/2/5 × 10^k
 * that needs at most `count + 2` ticks. The returned min/max are the expanded domain.
 */
export function niceTicks(min: number, max: number, count = 5): Ticks {
  if (min === max) {
    if (min === 0) max = 1
    else {
      const pad = Math.abs(min) * 0.1
      min -= pad
      max += pad
    }
  }
  const maxTicks = count + 2
  const exp = Math.floor(Math.log10((max - min) / (maxTicks - 1))) - 1
  let step = 0
  let start = 0
  let end = 0
  for (let e = exp; ; e++) {
    for (const m of [1, 2, 5]) {
      step = m * 10 ** e
      start = Math.floor(min / step) * step
      end = Math.ceil(max / step) * step
      if (Math.round((end - start) / step) + 1 <= maxTicks) break
    }
    if (Math.round((end - start) / step) + 1 <= maxTicks) break
  }
  const ticks: number[] = []
  for (let i = 0, n = Math.round((end - start) / step); i <= n; i++) {
    ticks.push(parseFloat((start + i * step).toPrecision(12)) + 0)
  }
  return { ticks, min: ticks[0]!, max: ticks[ticks.length - 1]! }
}

export function formatNumber(v: number): string {
  return String(parseFloat(v.toPrecision(10)))
}
