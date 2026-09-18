let ctx: CanvasRenderingContext2D | null = null

function getCtx(): CanvasRenderingContext2D {
  if (!ctx) {
    const canvas = document.createElement('canvas')
    ctx = canvas.getContext('2d')!
  }
  return ctx
}

export function measureText(text: string, fontSize: number, weight: number | string = 500): number {
  const c = getCtx()
  c.font = `${weight} ${fontSize}px "Source Serif 4", Georgia, serif`
  return c.measureText(text).width
}
