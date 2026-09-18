export interface DiagramLine {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  dashed?: boolean
}

export interface DiagramText {
  key: string
  x: number
  y: number
  text: string
  angle?: number
  color: string
  fontStyle?: 'normal' | 'italic'
  fontWeight?: number
  fontSize?: number
  anchor?: 'start' | 'middle' | 'end'
  tokenId?: string
  posLabel?: string
  explanation?: string
  underline?: boolean
}

export interface DiagramGroup {
  lines: DiagramLine[]
  texts: DiagramText[]
  width: number
  height: number
  /** anchor points other diagrams can connect to, in this group's local coordinates */
  anchors: {
    baselineStartX: number
    baselineEndX: number
    baselineY: number
    verbX: number
  }
  label?: string
}
