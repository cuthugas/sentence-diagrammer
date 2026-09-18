import type { SentenceAnalysis } from '../nlp/types'
import { explainSentence } from '../nlp/explain'

interface Props {
  analysis: SentenceAnalysis
}

export function ExplanationPanel({ analysis }: Props) {
  if (analysis.clauses.length === 0) return null
  const blocks = explainSentence(analysis)

  return (
    <div className="explanation">
      <h2>What's happening in this sentence</h2>
      {analysis.notes.length > 0 && (
        <ul className="explanation-notes">
          {analysis.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {blocks.map((b) => (
        <div key={b.clauseId} className="explanation-block">
          {blocks.length > 1 && <h3>{b.kind}</h3>}
          <ul>
            {b.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
