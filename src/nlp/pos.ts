import type { PosCategory } from './types'
import { AUXILIARIES, COORDINATING_CONJUNCTIONS, DETERMINERS, PREPOSITIONS, PRONOUNS, SUBORDINATING_CONJUNCTIONS } from './lexicon'

/**
 * Maps a compromise.js tag set (plus our own closed-class word lists) to a
 * simplified POS category used for coloring and diagram placement.
 * `nextIsVerbish` tells us whether the following word looks like a verb,
 * which disambiguates auxiliary-vs-main-verb usage of words like "is"/"has".
 */
export function categorize(normal: string, tags: string[], nextIsVerbish: boolean): PosCategory {
  const has = (t: string) => tags.includes(t)
  const word = normal.toLowerCase()

  if (COORDINATING_CONJUNCTIONS.has(word) || SUBORDINATING_CONJUNCTIONS.has(word)) return 'conjunction'
  if (DETERMINERS.has(word) || has('Determiner')) return 'article'
  // "to" is a preposition ("to school") unless it precedes a verb, where it's
  // an infinitive marker (compromise tags both as Conjunction)
  if (PREPOSITIONS.has(word) && !has('Verb') && !(word === 'to' && nextIsVerbish)) return 'preposition'
  if (has('Conjunction')) return 'conjunction'
  if (word === 'not' || word === "n't") return 'adverb' // negation (compromise tags it as its own class, not Adverb)
  if (has('Particle')) return 'adverb' // phrasal-verb particles ("ran away") diagram as adverbs
  if (has('Date')) return 'adverb' // "today"/"tomorrow" etc. used adverbially
  if (AUXILIARIES.has(word)) return nextIsVerbish ? 'auxiliary' : 'verb'
  if (has('Modal')) return 'auxiliary'
  if (has('Verb') || has('Infinitive') || has('Gerund') || has('PastTense') || has('PresentTense')) return 'verb'
  if (has('Adverb')) return 'adverb'
  if (has('Adjective') || has('Comparative') || has('Superlative')) return 'adjective'
  if (PRONOUNS.has(word) || has('Pronoun')) return 'pronoun'
  if (has('Noun') || has('Singular') || has('Plural') || has('ProperNoun')) return 'noun'
  if (has('Expression') || has('Interjection')) return 'interjection'
  return 'other'
}

export const POS_LABELS: Record<PosCategory, string> = {
  noun: 'Noun',
  pronoun: 'Pronoun',
  verb: 'Verb',
  auxiliary: 'Helping Verb',
  adjective: 'Adjective',
  adverb: 'Adverb',
  preposition: 'Preposition',
  conjunction: 'Conjunction',
  article: 'Article / Determiner',
  interjection: 'Interjection',
  other: 'Other',
}

export const POS_COLORS: Record<PosCategory, string> = {
  noun: '#2563eb', // blue
  pronoun: '#0891b2', // cyan
  verb: '#dc2626', // red
  auxiliary: '#ea580c', // orange
  adjective: '#16a34a', // green
  adverb: '#9333ea', // purple
  preposition: '#ca8a04', // amber
  conjunction: '#64748b', // slate
  article: '#0d9488', // teal
  interjection: '#db2777', // pink
  other: '#6b7280', // gray
}

export const POS_DESCRIPTIONS: Record<PosCategory, string> = {
  noun: 'Names a person, place, thing, or idea.',
  pronoun: 'Stands in for a noun (he, she, it, they, this...).',
  verb: 'Shows an action or a state of being.',
  auxiliary: 'A "helping" verb that pairs with the main verb (has, will, is, must...).',
  adjective: 'Describes or modifies a noun or pronoun.',
  adverb: 'Describes or modifies a verb, adjective, or another adverb — often answers how, when, where, or to what degree.',
  preposition: 'Shows the relationship between a noun/pronoun and another word (in, on, under, after...).',
  conjunction: 'Connects words, phrases, or clauses (and, but, or...).',
  article: 'Introduces a noun and signals whether it is specific or general (a, an, the).',
  interjection: 'An exclamation expressing emotion, set off from the rest of the sentence.',
  other: 'Does not fit cleanly into a single traditional part-of-speech category.',
}
