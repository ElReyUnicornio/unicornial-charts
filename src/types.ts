export type ChartType = 'line' | 'bar' | 'pie'

export type Orientation = 'vertical' | 'horizontal'

export interface GradientStop {
  /** Position along the gradient, 0..1. */
  offset: number
  /** #rgb, #rrggbb, #rrggbbaa, rgb() or rgba(). */
  color: string
}

export interface LinearGradient {
  type: 'linear'
  /**
   * CSS-style angle in degrees: 0 = bottom→top, 90 = left→right, 180 = top→bottom.
   * The gradient spans the bounding box of each element (each bar / pie slice)
   * or of the area under the curve (line). Default: 180 (90 when orientation is 'horizontal').
   */
  angle?: number
  /** Up to 8 stops are used. */
  stops: GradientStop[]
}

/** A solid CSS color or a linear gradient. */
export type ChartColor = string | LinearGradient

export type Interpolation = 'linear' | 'smooth' | 'step'

export interface Dataset {
  label?: string
  values: number[]
  /**
   * Fill color. An array assigns one color per data point (bar) or per slice (pie);
   * a line uses the first entry. Defaults to the built-in palette.
   *
   * Line: the stroke is always the first color (or first gradient stop); a gradient
   * additionally fills the area between the curve and the zero baseline.
   */
  color?: ChartColor | ChartColor[]
  /** Border color (bar, pie). Array = per data point. */
  borderColor?: ChartColor | ChartColor[]
  /** Border width in px (bar, pie). Default 0, or 1 if borderColor is set. */
  borderWidth?: number
  /** Corner radius in px (bar). Only the end away from the zero baseline is rounded. */
  borderRadius?: number
  /** Stroke width of the line in px (line). Default 2.5. */
  lineWidth?: number
  /** How points are connected (line). Default 'linear'. */
  interpolation?: Interpolation
}

export interface ChartData {
  labels: string[]
  datasets: Dataset[]
}

export interface ChartClickEvent {
  datasetIndex: number
  /** Index of the data point inside the dataset (pie: slice index). */
  index: number
  label: string
  datasetLabel?: string
  value: number
  nativeEvent: PointerEvent
}

export interface ChartConfig {
  type: ChartType
  data: ChartData
  xAxisName?: string
  yAxisName?: string
  /**
   * Line and bar only. 'vertical' (default) puts categories on the horizontal axis;
   * 'horizontal' puts them on the vertical axis, first category at the top.
   * `xAxisName` / `yAxisName` always refer to the horizontal / vertical axis on screen.
   */
  orientation?: Orientation
  /** Called when a data point (bar, line point or pie slice) is clicked or tapped. */
  onClick?: (event: ChartClickEvent) => void
}
