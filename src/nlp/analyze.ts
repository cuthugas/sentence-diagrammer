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
/** True if a noun/pronoun (a plausible subject) appears before the next
 * verb/auxiliary in `tokens` -- used to tell a genuine second independent
 * clause ("...but Spanish is easier") from an elided-subject compound
 * predicate ("...but might not win"), which has no subject of its own. */
function hasSubjectBeforeVerb(tokens: Token[]): boolean {
  for (const t of tokens) {
    if (t.pos === 'noun' || t.pos === 'pronoun') return true
    if (t.pos === 'verb' || t.pos === 'auxiliary') return false
  }
  return false
}

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
      current.some((c) => c.pos === 'verb' || c.pos === 'auxiliary') &&
      hasSubjectBeforeVerb(remaining)
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
    while (i < tokens.length && !consumed.has(i)) {
      const tok = tokens[i]
      if (tok.pos === 'article' || tok.pos === 'adjective' || tok.pos === 'adverb') {
        pendingIdx.push(i)
        pending.push(tok)
        i++
        continue
      }
      // a coordinating conjunction between two modifiers of the same noun
      // (e.g. "the big and brown dog") continues the modifier run instead of
      // ending it
      if (
        pending.length > 0 &&
        tok.pos === 'conjunction' &&
        COORDINATING_CONJUNCTIONS.has(tok.text.toLowerCase()) &&
        (tokens[i + 1]?.pos === 'adjective' || tokens[i + 1]?.pos === 'adverb')
      ) {
        pendingIdx.push(i)
        pending.push(tok)
        i++
        continue
      }
      break
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

    if (i < tokens.length) {
      const tok = tokens[i]
      const isConj = tok.pos === 'conjunction' && COORDINATING_CONJUNCTIONS.has(tok.text.toLowerCase())
      if (isConj) {
        const next = tokens[i + 1]
        if (next && (next.pos === 'article' || next.pos === 'adjective' || isNounHead(next))) {
          conjunction = tok
          consumed.add(i)
          i++
          continue
        }
      } else if (head.commaAfter && (tok.pos === 'article' || tok.pos === 'adjective' || isNounHead(tok))) {
        // an Oxford-comma list ("snakes, darkness, and bugs") — the final
        // "and"/"or" (if any) is picked up as `conjunction` when we reach
        // that item above
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
    if (t.pos === 'conjunction') {
      // joins the previous modifier to the next one (e.g. "big and brown")
      if (result.length) result[result.length - 1].joinerAfter = t
      i++
      continue
    }
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

/** Collects a run of one or more adverbs starting at `start`, coordinated by
 * "and"/"or"/etc if present (e.g. "ran slowly and steadily"). Consumes and
 * returns the matched token indices along with the built modifier list. */
function collectAdverbRun(tokens: Token[], start: number, consumed: Set<number>): { mods: ModifierAttachment[]; usedIndices: number[] } {
  const usedIndices: number[] = []
  const raw: Token[] = []
  let i = start
  while (tokens[i] && !consumed.has(i) && tokens[i].pos === 'adverb') {
    raw.push(tokens[i])
    usedIndices.push(i)
    i++
    if (
      tokens[i] &&
      !consumed.has(i) &&
      tokens[i].pos === 'conjunction' &&
      COORDINATING_CONJUNCTIONS.has(tokens[i].text.toLowerCase()) &&
      tokens[i + 1]?.pos === 'adverb'
    ) {
      raw.push(tokens[i])
      usedIndices.push(i)
      i++
      continue
    }
    break
  }
  const mods: ModifierAttachment[] = []
  raw.forEach((t, k) => {
    if (t.pos === 'conjunction') return
    const mod: ModifierAttachment = { word: t, explanation: describeModifier(t) }
    if (raw[k + 1]?.pos === 'conjunction') mod.joinerAfter = raw[k + 1]
    mods.push(mod)
  })
  return { mods, usedIndices }
}

function describeModifier(t: Token): string {
  if (t.pos === 'article') return `"${t.text}" introduces the noun.`
  if (t.pos === 'adjective') return `"${t.text}" describes the noun.`
  if (t.pos === 'adverb') return `"${t.text}" modifies the word it points to.`
  return ''
}

/** Scans forward from `start` for a contiguous run of verb/auxiliary tokens.
 * A bare "not" embedded between two of them (e.g. "will not lose") stays
 * part of the same cluster instead of ending it early; it's returned keyed
 * by the id of the head it's attached to (the one right before it) so the
 * caller can diagram it as that head's modifier. */
function scanVerbCluster(tokens: Token[], start: number): { end: number; heads: Token[]; negations: Record<string, Token> } {
  const heads: Token[] = []
  const negations: Record<string, Token> = {}
  let i = start
  let end = start - 1
  while (tokens[i] && (tokens[i].pos === 'verb' || tokens[i].pos === 'auxiliary')) {
    heads.push(tokens[i])
    end = i
    i++
    if (
      tokens[i] &&
      tokens[i].text.toLowerCase() === 'not' &&
      (tokens[i + 1]?.pos === 'verb' || tokens[i + 1]?.pos === 'auxiliary')
    ) {
      negations[tokens[i - 1].id] = tokens[i]
      end = i
      i++
    }
  }
  return { end, heads, negations }
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
      object: np.slot,
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
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].pos === 'verb' || tokens[i].pos === 'auxiliary') {
      verbStart = i
      break
    }
  }

  let verbEnd = -1
  let verbHeads: Token[] = []
  let verbConjunction: Token | undefined
  let verbClusterSizes: number[] | undefined
  const verbNegations: Record<string, Token> = {}
  if (verbStart !== -1) {
    const cluster = scanVerbCluster(tokens, verbStart)
    verbEnd = cluster.end
    verbHeads = cluster.heads
    Object.assign(verbNegations, cluster.negations)
    for (let i = verbStart; i <= verbEnd; i++) consumed.add(i)

    // compound verb: VERB and/but/or/etc VERB (e.g. "will not lose but might not win")
    const conjIdx = verbEnd + 1
    if (tokens[conjIdx] && tokens[conjIdx].pos === 'conjunction' && COORDINATING_CONJUNCTIONS.has(tokens[conjIdx].text.toLowerCase())) {
      const secondCluster = scanVerbCluster(tokens, conjIdx + 1)
      if (secondCluster.heads.length > 0) {
        verbConjunction = tokens[conjIdx]
        consumed.add(conjIdx)
        for (let i = conjIdx + 1; i <= secondCluster.end; i++) consumed.add(i)
        verbClusterSizes = [cluster.heads.length, secondCluster.heads.length]
        verbHeads.push(...secondCluster.heads)
        Object.assign(verbNegations, secondCluster.negations)
        verbEnd = secondCluster.end
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

  // imperative sentence ("Give me your money!") — the verb is the very first
  // token, so no room exists before it for a subject; diagram the standard
  // implied "(you)" in subject position
  if (subject === null && verbStart === 0) {
    subject = {
      heads: [{ id: nextId('implied'), text: '(you)', pos: 'pronoun', tags: ['Imperative', 'Implied'], index: -1, commaAfter: false }],
      conjunction: undefined,
      modifiers: {},
      prepPhrases: [],
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
  Object.entries(verbNegations).forEach(([headId, notTok]) => {
    verbModifiers[headId] = [{ word: notTok, explanation: `"${notTok.text}" negates the verb.` }]
  })
  if (verbHeads.length) {
    const lastHead = verbHeads[verbHeads.length - 1]
    const adverbMods: ModifierAttachment[] = verbModifiers[lastHead.id] ? [...verbModifiers[lastHead.id]] : []
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
      const { mods, usedIndices } = collectAdverbRun(tokens, afterIdx, consumed)
      adverbMods.push(...mods)
      usedIndices.forEach((idx) => consumed.add(idx))
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
    ? { heads: verbHeads, conjunction: verbConjunction, modifiers: verbModifiers, prepPhrases: verbPrepPhrases, isLinking, clusterSizes: verbClusterSizes }
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

  if (clauses.some((c) => c.subject?.heads[0]?.tags.includes('Implied'))) {
    notes.push('This is an imperative sentence — the subject "you" is implied, not written, so it\'s shown as "(you)".')
  }
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
