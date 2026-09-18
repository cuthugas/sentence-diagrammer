import nlp from 'compromise'
import type { Token } from './types'
import { categorize } from './pos'

interface RawTerm {
  text: string
  normal: string
  tags: string[]
  post: string
}

function looksVerbish(tags: string[]): boolean {
  return tags.some((t) => ['Verb', 'Infinitive', 'Gerund', 'PastTense', 'PresentTense'].includes(t))
}

export function tokenizeSentence(sentence: string): Token[] {
  const doc = nlp(sentence)
  const json = doc.json({ terms: { text: true, normal: true, tags: true, whitespace: true } }) as unknown as Array<{
    terms: RawTerm[]
  }>
  const rawTerms: RawTerm[] = json.flatMap((s) => s.terms)

  const cleaned = rawTerms.filter((t) => /[a-zA-Z]/.test(t.text))

  return cleaned.map((term, i) => {
    const next = cleaned[i + 1]
    const nextIsVerbish = next ? looksVerbish(next.tags) : false
    const pos = categorize(term.normal, term.tags, nextIsVerbish)
    return {
      id: `w${i}-${term.normal}`,
      text: term.text,
      pos,
      tags: term.tags,
      index: i,
      commaAfter: term.post.includes(','),
    }
  })
}
