import type {
  Clause,
  ComplementKind,
  ModifierAttachment,
  NounSlot,
  PrepPhrase,
  SentenceAnalysis,
  Token,
  VerbSlot,
} from './types'
import { tokenizeSentence } from './tokenize'
import { LINKING_VERB_LEMMAS, COORDINATING_CONJUNCTIONS, SUBORDINATING_CONJUNCTIONS, BE_FORMS } from './lexicon'

let uid = 0
function nextId(prefix: string): string {
  uid += 1
  return `${prefix}${uid}`
}

interface RawClause {
  tokens: Token[]
  kind: 'independent' | 'subordinate'
  connector: Token | null
}

/**
 * Splits a sentence's tokens into clause segments on top-level coordinating
 * and subordinating conjunctions. This is a shallow, heuristic split: it
 * does not attempt to resolve deeply nested or embedded clauses.
 */
function splitClauses(tokens: Token[]): RawClause[] {
  const segments: RawClause[] = []
  let current: Token[] = []
  let pendingConnector: Token | null = null
  let pendingKind: 'independent' | 'subordinate' = 'independent'

  const flush = () => {
    const trimmed = current.filter((t) => t.pos !== 'other' || /[a-zA-Z]/.test(t.text))
    if (trimmed.length > 0) {
      segments.push({ tokens: trimmed, kind: pendingKind, connector: pendingConnector })
    }
    current = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const word = t.text.toLowerCase().replace(/[.,;:!?]$/, '')

    const isSentenceStart = current.length === 0
    const remaining = tokens.slice(i + 1)
    const restHasVerb = remaining.some((r) => r.pos === 'verb' || r.pos === 'auxiliary')

    if (SUBORDINATING_CONJUNCTIONS.has(word) && (isSentenceStart || restHasVerb) && restHasVerb) {
      flush()
      pendingConnector = t
      pendingKind = 'subordinate'
      continue
    }

    if (
      t.pos === 'conjunction' &&
      COORDINATING_CONJUNCTIONS.has(word) &&
      current.length > 2 &&
      restHasVerb &&
      current.some((c) => c.pos === 'verb' || c.pos === 'auxiliary')
    ) {
      flush()
      pendingConnector = t
      pendingKind = 'independent'
      continue
    }

    current.push(t)

    // a comma closing a leading subordinate clause marks a clause boundary
    if (t.commaAfter && pendingKind === 'subordinate' && current.some((c) => c.pos === 'verb' || c.pos === 'auxiliary')) {
      flush()
      pendingConnector = null
      pendingKind = 'independent'
    }
  }
  flush()

  return segments.length > 0 ? segments : [{ tokens, kind: 'independent', connector: null }]
}

function isNounHead(t: Token): boolean {
  return t.pos === 'noun' || t.pos === 'pronoun'
}

/** Greedily extracts a noun phrase (determiners/adjectives + one or more
 * conjunction-joined heads) starting at index i. Returns null if no head found. */
function extractNounPhrase(
  tokens: Token[],
  start: number,
  consumed: Set<number>
): { slot: NounSlot; end: number } | null {
  let i = start
  const modifiersByHead: Record<string, ModifierAttachment[]> = {}
  const heads: Token[] = []
  let conjunction: Token | undefined

  while (i < tokens.length) {
    const pendingIdx: number[] = []
    const pending: Token[] = []
    while (i < tokens.length && (tokens[i].pos === 'article' || tokens[i].pos === 'adjective' || tokens[i].pos === 'adverb')) {
      if (consumed.has(i)) break
      pendingIdx.push(i)
      pending.push(tokens[i])
      i++
    }
    if (i >= tokens.length || !isNounHead(tokens[i]) || consumed.has(i)) {
      i -= pending.length // back out, this wasn't leading into a head
      break
    }
    const head = tokens[i]
    heads.push(head)
    consumed.add(i)
    pendingIdx.forEach((idx) => consumed.add(idx))
    i++

    const mods = buildModifierChain(pending)
    modifiersByHead[head.id] = mods

    if (i < tokens.length && tokens[i].pos === 'conjunction' && ['and', 'or'].includes(tokens[i].text.toLowerCase())) {
      const next = tokens[i + 1]
      if (next && (next.pos === 'article' || next.pos === 'adjective' || isNounHead(next))) {
        conjunction = tokens[i]
        consumed.add(i)
        i++
        continue
      }
    }
    break
  }

  if (heads.length === 0) return null
  return {
    slot: { heads, conjunction, modifiers: modifiersByHead, prepPhrases: [] },
    end: i,
  }
}

/** Nests trailing adverbs onto the adjective/article they immediately precede. */
function buildModifierChain(mods: Token[]): ModifierAttachment[] {
  const result: ModifierAttachment[] = []
  let i = 0
  while (i < mods.length) {
    const t = mods[i]
    if (t.pos === 'adverb') {
      // an adverb modifies the next adjective in this run, if any
      const next = mods[i + 1]
      if (next && next.pos === 'adjective') {
        i++
        continue // will be attached as subModifier when we hit the adjective below
      }
      result.push({ word: t, explanation: describeModifier(t) })
      i++
      continue
    }
    const subMods: ModifierAttachment[] = []
    if (i > 0 && mods[i - 1].pos === 'adverb') {
      subMods.push({ word: mods[i - 1], explanation: describeModifier(mods[i - 1]) })
    }
    result.push({ word: t, explanation: describeModifier(t), subModifiers: subMods.length ? subMods : undefined })
    i++
  }
  return result
}

function describeModifier(t: Token): string {
  if (t.pos === 'article') return `"${t.text}" introduces the noun.`
  if (t.pos === 'adjective') return `"${t.text}" describes the noun.`
  if (t.pos === 'adverb') return `"${t.text}" modifies the word it points to.`
  return ''
}

function extractPrepPhrases(tokens: Token[], consumed: Set<number>): PrepPhrase[] {
  const phrases: PrepPhrase[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i) || tokens[i].pos !== 'preposition') continue
    const prep = tokens[i]
    consumed.add(i)
    const npStart = i + 1
    const np = extractNounPhrase(tokens, npStart, consumed)
    if (!np || np.slot.heads.length === 0) continue

    // determine what it modifies: an immediately preceding noun (adjectival),
    // otherwise the clause's verb (adverbial) — e.g. a verb, adjective, or adverb before it
    let modifies = ''
    let role: 'adjectival' | 'adverbial' = 'adverbial'
    const prev = tokens[i - 1]
    if (prev && isNounHead(prev)) {
      modifies = prev.id
      role = 'adjectival'
    }
    phrases.push({
      id: nextId('pp'),
      preposition: prep,
      objectHead: np.slot.heads[0],
      objectModifiers: np.slot.modifiers[np.slot.heads[0].id] ?? [],
      modifies,
      role,
    })
  }
  return phrases
}

function parseClauseTokens(tokens: Token[], kind: 'independent' | 'subordinate', connector: Token | null): Clause {
  const text = tokens.map((t) => t.text).join(' ')
  const consumed = new Set<number>()

  // locate main verb cluster among unconsumed tokens (before prepositional
  // phrases are extracted, so PP role-detection below sees settled verb tags)
  let verbStart = -1
  let verbEnd = -1
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].pos === 'verb' || tokens[i].pos === 'auxiliary') {
      if (verbStart === -1) verbStart = i
      verbEnd = i
      continue
    }
    if (verbStart !== -1) break
  }

  const verbHeads: Token[] = []
  let verbConjunction: Token | undefined
  if (verbStart !== -1) {
    for (let i = verbStart; i <= verbEnd; i++) {
      verbHeads.push(tokens[i])
      consumed.add(i)
    }
    // compound verb: VERB and VERB
    let j = verbEnd + 1
    if (tokens[j] && tokens[j].pos === 'conjunction' && ['and', 'or'].includes(tokens[j].text.toLowerCase())) {
      let k = j + 1
      const secondStart = k
      while (tokens[k] && (tokens[k].pos === 'verb' || tokens[k].pos === 'auxiliary')) k++
      if (k > secondStart) {
        verbConjunction = tokens[j]
        consumed.add(j)
        for (let m = secondStart; m < k; m++) {
          verbHeads.push(tokens[m])
          consumed.add(m)
        }
        verbEnd = k - 1
      }
    }
  }

  // subject = first unconsumed noun phrase before the verb
  const subjectSearchEnd = verbStart === -1 ? tokens.length : verbStart
  let subject: NounSlot | null = null
  let subjectEnd = 0
  for (let i = 0; i < subjectSearchEnd; i++) {
    if (consumed.has(i)) continue
    const np = extractNounPhrase(tokens, i, consumed)
    if (np) {
      subject = np.slot
      subjectEnd = np.end
      break
    }
  }

  // fallback: no verb/auxiliary tag was found anywhere (common for base-form
  // verbs that are also common nouns, e.g. "sleep", "walk", "dance" — the
  // statistical tagger sometimes guesses noun). If a subject was found,
  // assume the next unclaimed word is the verb. Mutate it in place so every
  // later step (prepositional-phrase role detection included) sees it as a verb.
  if (verbStart === -1 && subject) {
    for (let i = subjectEnd; i < tokens.length; i++) {
      if (consumed.has(i)) continue
      const t = tokens[i]
      if (t.pos === 'conjunction' || t.pos === 'preposition' || t.pos === 'article') break
      tokens[i] = { ...t, pos: 'verb' }
      verbHeads.push(tokens[i])
      verbStart = i
      verbEnd = i
      consumed.add(i)
      break
    }
  }

  const lastVerbText = verbHeads.length ? verbHeads[verbHeads.length - 1].text.toLowerCase() : ''
  const isLinking = BE_FORMS.has(lastVerbText) || LINKING_VERB_LEMMAS.has(lastVerbText)

  // now that the verb boundary is settled, extract prepositional phrases —
  // their adjectival-vs-adverbial role depends on whether the preceding word is a noun or the verb
  const prepPhrases = extractPrepPhrases(tokens, consumed)
  const verbPrepPhrases = prepPhrases.filter((p) => p.role === 'adverbial')
  const adjPrepPhrases = prepPhrases.filter((p) => p.role === 'adjectival')

  if (subject) {
    for (const h of subject.heads) {
      const attached = adjPrepPhrases.filter((p) => p.modifies === h.id)
      if (attached.length) subject.prepPhrases.push(...attached)
    }
  }

  // adverbs directly adjacent to the verb (not already part of a noun phrase) modify it
  const verbModifiers: Record<string, ModifierAttachment[]> = {}
  if (verbHeads.length) {
    const lastHead = verbHeads[verbHeads.length - 1]
    const adverbMods: ModifierAttachment[] = []
    // an adverb right before the verb (e.g. "quickly ran") modifies it
    if (verbStart > 0 && tokens[verbStart - 1]?.pos === 'adverb' && !consumed.has(verbStart - 1)) {
      const t = tokens[verbStart - 1]
      adverbMods.push({ word: t, explanation: describeModifier(t) })
      consumed.add(verbStart - 1)
    }
    // an adverb right after the verb modifies it UNLESS it's followed by an
    // adjective, in which case it more likely modifies that adjective
    // (e.g. "is [very] nice" -> "very" modifies "nice", not "is")
    const afterIdx = verbEnd + 1
    if (
      afterIdx < tokens.length &&
      !consumed.has(afterIdx) &&
      tokens[afterIdx].pos === 'adverb' &&
      tokens[afterIdx + 1]?.pos !== 'adjective'
    ) {
      const t = tokens[afterIdx]
      adverbMods.push({ word: t, explanation: describeModifier(t) })
      consumed.add(afterIdx)
    }
    if (adverbMods.length) verbModifiers[lastHead.id] = adverbMods
  }

  // predicate: everything after the verb
  let indirectObject: NounSlot | null = null
  let complementKind: ComplementKind = 'none'
  let complement: NounSlot | null = null
  let predicateAdjective: Clause['predicateAdjective'] = null

  if (verbEnd !== -1) {
    if (isLinking) {
      // look for predicate adjective first, then predicate nominative
      let i = verbEnd + 1
      const adjRun: Token[] = []
      while (
        i < tokens.length &&
        !consumed.has(i) &&
        (tokens[i].pos === 'adjective' || (tokens[i].pos === 'adverb' && tokens[i + 1]?.pos === 'adjective'))
      ) {
        adjRun.push(tokens[i])
        consumed.add(i)
        i++
      }
      if (adjRun.some((t) => t.pos === 'adjective')) {
        const heads = adjRun.filter((t) => t.pos === 'adjective')
        const modifiersByHead: Record<string, ModifierAttachment[]> = {}
        heads.forEach((h) => {
          const idx = adjRun.indexOf(h)
          const prev = adjRun[idx - 1]
          modifiersByHead[h.id] = prev && prev.pos === 'adverb' ? [{ word: prev, explanation: describeModifier(prev) }] : []
        })
        predicateAdjective = { heads, modifiers: modifiersByHead }
        complementKind = 'predicateAdjective'
      } else {
        const np = extractNounPhrase(tokens, verbEnd + 1, consumed)
        if (np) {
          complement = np.slot
          complementKind = 'predicateNominative'
        }
      }
    } else {
      const first = extractNounPhrase(tokens, verbEnd + 1, consumed)
      if (first) {
        const second = extractNounPhrase(tokens, first.end, consumed)
        if (second) {
          indirectObject = first.slot
          complement = second.slot
        } else {
          complement = first.slot
        }
        complementKind = 'directObject'
      }
    }
  }

  if (complement) {
    for (const h of complement.heads) {
      const attached = adjPrepPhrases.filter((p) => p.modifies === h.id)
      if (attached.length) complement.prepPhrases.push(...attached)
    }
  }
  if (indirectObject) {
    for (const h of indirectObject.heads) {
      const attached = adjPrepPhrases.filter((p) => p.modifies === h.id)
      if (attached.length) indirectObject.prepPhrases.push(...attached)
    }
  }

  const leftoverWords = tokens.filter((t, i) => !consumed.has(i) && t.pos !== 'conjunction' && /[a-zA-Z]/.test(t.text))

  const verb: VerbSlot | null = verbHeads.length
    ? { heads: verbHeads, conjunction: verbConjunction, modifiers: verbModifiers, prepPhrases: verbPrepPhrases, isLinking }
    : null

  return {
    id: nextId('clause'),
    text,
    kind,
    connector,
    attachesToClauseId: null,
    subject,
    verb,
    indirectObject,
    complementKind,
    complement,
    predicateAdjective,
    leftoverWords,
  }
}

export function analyzeSentence(raw: string): SentenceAnalysis {
  const trimmed = raw.trim()
  const notes: string[] = []
  if (!trimmed) {
    return { raw, clauses: [], notes: ['Enter a sentence to see its diagram.'] }
  }

  const tokens = tokenizeSentence(trimmed)
  const rawClauses = splitClauses(tokens)

  const clauses: Clause[] = []
  let lastIndependentId: string | null = null
  for (const rc of rawClauses) {
    const clause = parseClauseTokens(rc.tokens, rc.kind, rc.connector)
    if (clause.kind === 'subordinate') {
      clause.attachesToClauseId = lastIndependentId
    } else {
      lastIndependentId = clause.id
    }
    clauses.push(clause)
  }
  // a subordinate clause with nothing preceding it (e.g. "Although X, Y")
  // attaches forward to the next independent clause instead
  const firstIndependentId = clauses.find((c) => c.kind === 'independent')?.id ?? null
  clauses.forEach((c) => {
    if (c.kind === 'subordinate' && c.attachesToClauseId === null) {
      c.attachesToClauseId = firstIndependentId
    }
  })

  if (clauses.some((c) => c.kind === 'subordinate')) {
    notes.push('This sentence includes a subordinate clause, shown as a smaller diagram beneath the main clause it modifies.')
  }
  if (clauses.length > 1 && clauses.every((c) => c.kind === 'independent')) {
    notes.push('This is a compound sentence: two independent clauses joined by a conjunction.')
  }
  if (clauses.some((c) => c.leftoverWords.length > 0)) {
    notes.push('A few words in this sentence were too ambiguous for this tool to place with confidence; they are listed but not diagrammed.')
  }
  if (clauses.every((c) => !c.subject || !c.verb)) {
    notes.push("This tool couldn't confidently identify a subject and verb. Try a simpler, complete sentence.")
  }

  return { raw, clauses, notes }
}
