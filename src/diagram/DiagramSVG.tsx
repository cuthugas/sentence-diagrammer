import { useMemo, useState } from 'react'
import type { SentenceAnalysis } from '../nlp/types'
import { POS_LABELS, POS_DESCRIPTIONS } from '../nlp/pos'
import type { PosCategory } from '../nlp/types'
import { composeDiagram } from './compose'
import type { DiagramText } from './types'
import './diagram.css'

interface Props {
  analysis: SentenceAnalysis
}

interface TooltipState {
  x: number
  y: number
  word: string
  pos: PosCategory
  explanation?: string
}

export function DiagramSVG({ analysis }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const diagram = useMemo(() => composeDiagram(analysis), [analysis])

  const findTokenPos = (tokenId?: string): PosCategory | null => {
    if (!tokenId) return null
    for (const c of analysis.clauses) {
      const all = [
        ...(c.subject?.heads ?? []),
        ...(c.verb?.heads ?? []),
        ...(c.indirectObject?.heads ?? []),
        ...(c.complement?.heads ?? []),
        ...(c.predicateAdjective?.heads ?? []),
        ...c.leftoverWords,
      ]
      const found = all.find((t) => t.id === tokenId)
      if (found) return found.pos
      for (const modList of Object.values(c.subject?.modifiers ?? {})) {
        const m = findInMods(modList, tokenId)
        if (m) return m
      }
      for (const modList of Object.values(c.complement?.modifiers ?? {})) {
        const m = findInMods(modList, tokenId)
        if (m) return m
      }
      for (const modList of Object.values(c.verb?.modifiers ?? {})) {
        const m = findInMods(modList, tokenId)
        if (m) return m
      }
    }
    return null
  }

  function findInMods(mods: { word: { id: string; pos: PosCategory }; subModifiers?: unknown[] }[], id: string): PosCategory | null {
    for (const m of mods) {
      if (m.word.id === id) return m.word.pos
      if (m.subModifiers) {
        const sub = findInMods(m.subModifiers as typeof mods, id)
        if (sub) return sub
      }
    }
    return null
  }

  const handleEnter = (t: DiagramText, evt: React.MouseEvent) => {
    if (!t.tokenId) return
    const pos = findTokenPos(t.tokenId) ?? 'other'
    const rect = (evt.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect()
    setTooltip({
      x: rect ? evt.clientX - rect.left : t.x,
      y: rect ? evt.clientY - rect.top : t.y,
      word: t.text,
      pos,
      explanation: t.explanation,
    })
  }

  if (analysis.clauses.length === 0) {
    return <div className="diagram-empty">Enter a sentence above to see its diagram.</div>
  }

  return (
    <div className="diagram-wrap">
      <svg
        viewBox={`0 0 ${diagram.width} ${diagram.height}`}
        width={diagram.width}
        height={diagram.height}
        className="diagram-svg"
        onMouseLeave={() => setTooltip(null)}
      >
        {diagram.lines.map((l) => (
          <line
            key={l.key}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="var(--diagram-line)"
            strokeWidth={1.6}
            strokeDasharray={l.dashed ? '5 4' : undefined}
          />
        ))}
        {diagram.texts.map((t) => (
          <text
            key={t.key}
            x={t.x}
            y={t.y}
            fill={t.color}
            fontSize={t.fontSize ?? 16}
            fontWeight={t.fontWeight ?? 500}
            fontStyle={t.fontStyle ?? 'normal'}
            textAnchor={t.anchor ?? 'start'}
            transform={t.angle ? `rotate(${t.angle} ${t.x} ${t.y})` : undefined}
            className={t.tokenId ? 'diagram-word' : undefined}
            onMouseEnter={t.tokenId ? (e) => handleEnter(t, e) : undefined}
          >
            {t.text}
          </text>
        ))}
      </svg>
      {tooltip && (
        <div className="diagram-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="diagram-tooltip-word">{tooltip.word}</div>
          <div className="diagram-tooltip-pos">{POS_LABELS[tooltip.pos]}</div>
          <div className="diagram-tooltip-desc">{tooltip.explanation ?? POS_DESCRIPTIONS[tooltip.pos]}</div>
        </div>
      )}
    </div>
  )
}
