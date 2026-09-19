export type PosCategory =
  | 'noun'
  | 'pronoun'
  | 'verb'
  | 'auxiliary'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'article'
  | 'interjection'
  | 'other'

export interface Token {
  id: string
  text: string
  pos: PosCategory
  tags: string[]
  index: number
  commaAfter: boolean
}

export interface ModifierAttachment {
  word: Token
  explanation: string
  subModifiers?: ModifierAttachment[]
  /** a coordinating conjunction ("and"/"or"/etc) joining this modifier to the
   * next one in the same list, e.g. "slowly and steadily" or "big and brown" */
  joinerAfter?: Token
}

export interface PrepPhrase {
  id: string
  preposition: Token
  /** the object of the preposition -- a full noun-phrase slot so it can be a
   * compound / Oxford-comma list, e.g. "except snakes, darkness, and bugs" */
  object: NounSlot
  /** id of the token this phrase modifies */
  modifies: string
  /** whether it modifies a noun (adjectival) or a verb/adjective (adverbial) */
  role: 'adjectival' | 'adverbial'
}

export interface NounSlot {
  heads: Token[] // compound nouns/pronouns joined by and/or
  conjunction?: Token // the and/or joining compound heads
  modifiers: Record<string, ModifierAttachment[]> // keyed by head token id
  prepPhrases: PrepPhrase[] // phrases modifying this slot's heads
  /** How many consecutive `heads` belong to each coordinate branch, e.g. [2, 2]
   * for a compound verb like "will not lose but might not win" -- "will" and
   * "lose" together are one branch. Omitted means each head is its own
   * branch (the common case, e.g. simple "boys and girls"). */
  clusterSizes?: number[]
}

export interface VerbSlot {
  heads: Token[] // compound verbs joined by and/or
  conjunction?: Token
  modifiers: Record<string, ModifierAttachment[]> // adverbs, keyed by head token id
  prepPhrases: PrepPhrase[] // adverbial phrases modifying the verb
  isLinking: boolean
  /** see NounSlot.clusterSizes */
  clusterSizes?: number[]
}

export type ComplementKind = 'directObject' | 'predicateNominative' | 'predicateAdjective' | 'none'

export interface Clause {
  id: string
  text: string
  kind: 'independent' | 'subordinate'
  /** the conjunction that introduces this clause and links it to a prior clause (FANBOYS for independent, a subordinator for subordinate) */
  connector: Token | null
  /** for a subordinate clause, the id of the independent clause it attaches to */
  attachesToClauseId: string | null
  subject: NounSlot | null
  verb: VerbSlot | null
  indirectObject: NounSlot | null
  complementKind: ComplementKind
  complement: NounSlot | null // direct object or predicate nominative
  predicateAdjective: { heads: Token[]; conjunction?: Token; modifiers: Record<string, ModifierAttachment[]> } | null
  leftoverWords: Token[] // words we could not confidently place
}

export interface SentenceAnalysis {
  raw: string
  clauses: Clause[]
  notes: string[]
}
