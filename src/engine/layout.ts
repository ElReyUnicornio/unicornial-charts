export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const LEGEND_HEIGHT = 28

/** `yLabelWidth`: room reserved for the labels left of the plot (px). */
export function cartesianPlotArea(
  width: number,
  height: number,
  xAxisName?: string,
  yAxisName?: string,
  yLabelWidth = 36,
): Rect {
  const left = yLabelWidth + 16 + (yAxisName ? 18 : 0)
  const bottom = 28 + (xAxisName ? 20 : 0)
  const top = LEGEND_HEIGHT + 6
  const right = 16
  return {
    x: left,
    y: top,
    width: Math.max(0, width - left - right),
    height: Math.max(0, height - top - bottom),
  }
}

export function pieArea(width: number, height: number): Rect {
  const pad = 16
  const top = LEGEND_HEIGHT + pad
  return {
    x: pad,
    y: top,
    width: Math.max(0, width - pad * 2),
    height: Math.max(0, height - top - pad),
  }
}
