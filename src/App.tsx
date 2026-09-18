import { useMemo, useState } from 'react'
import './App.css'
import { analyzeSentence } from './nlp/analyze'
import { DiagramSVG } from './diagram/DiagramSVG'
import { PosLegend } from './components/PosLegend'
import { ExplanationPanel } from './components/ExplanationPanel'
import { AdSlot } from './components/AdSlot'

const EXAMPLES = [
  'The quick brown fox jumps over the lazy dog.',
  'She gave Mary a book.',
  'The weather is very nice today.',
  'My dog and my cat sleep on the porch.',
  'Although it was raining, we went outside.',
  'The tired old sailor finally reached the distant shore.',
]

function App() {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState('')

  const analysis = useMemo(() => (submitted ? analyzeSentence(submitted) : null), [submitted])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(input.trim())
  }

  return (
    <div className="page">
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand">
            <span className="brand-mark">§</span>
            <span className="brand-name">SentenceDiagram.io</span>
          </div>
          <p className="tagline">Free sentence diagramming for students &amp; teachers</p>
        </div>
      </header>

      <main className="container">
        <section className="intro">
          <h1>Diagram any sentence, instantly.</h1>
          <p>
            Type a sentence below to see a traditional line diagram, with parts of speech color-coded and explained.
            Hover any word on the diagram for a quick definition, or read the full breakdown underneath.
          </p>
        </section>

        <form className="input-panel" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or paste a sentence, e.g. The quick brown fox jumps over the lazy dog."
            rows={3}
          />
          <div className="input-actions">
            <button type="submit" className="btn-primary" disabled={!input.trim()}>
              Diagram it
            </button>
            <div className="examples">
              <span>Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  className="chip"
                  onClick={() => {
                    setInput(ex)
                    setSubmitted(ex)
                  }}
                >
                  {ex.length > 34 ? ex.slice(0, 34) + '…' : ex}
                </button>
              ))}
            </div>
          </div>
        </form>

        {analysis && (
          <>
            <section className="results">
              <div className="legend-row">
                <h2 className="section-label">Parts of speech</h2>
                <PosLegend />
              </div>
              <DiagramSVG analysis={analysis} />
            </section>

            <AdSlot label="Advertisement" className="ad-inline" />

            <section className="results">
              <ExplanationPanel analysis={analysis} />
            </section>
          </>
        )}

        {!analysis && (
          <section className="empty-state">
            <p>Enter a sentence above, or try one of the examples, to see how it's built.</p>
          </section>
        )}

        <AdSlot label="Advertisement" className="ad-footer" />
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p>
            SentenceDiagram.io is a free educational tool. It uses automated grammar analysis and may occasionally
            misidentify a word or sentence part — always double-check with your teacher's guidance for graded work.
          </p>
          <p className="footer-meta">Built for classrooms everywhere. No account, no tracking of your sentences, no cost.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
