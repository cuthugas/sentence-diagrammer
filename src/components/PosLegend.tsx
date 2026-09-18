import { POS_COLORS, POS_LABELS, POS_DESCRIPTIONS } from '../nlp/pos'
import type { PosCategory } from '../nlp/types'

const ORDER: PosCategory[] = ['noun', 'pronoun', 'verb', 'auxiliary', 'adjective', 'adverb', 'preposition', 'conjunction', 'article']

export function PosLegend() {
  return (
    <div className="legend">
      {ORDER.map((pos) => (
        <div key={pos} className="legend-item" title={POS_DESCRIPTIONS[pos]}>
          <span className="legend-swatch" style={{ background: POS_COLORS[pos] }} />
          <span>{POS_LABELS[pos]}</span>
        </div>
      ))}
    </div>
  )
}
