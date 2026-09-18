import type { Clause, ModifierAttachment, NounSlot, SentenceAnalysis } from './types'

function joinHeads(slot: NounSlot | null | undefined): string {
  if (!slot || slot.heads.length === 0) return ''
  if (slot.heads.length === 1) return `"${slot.heads[0].text}"`
  const words = slot.heads.map((h) => `"${h.text}"`)
  const joiner = slot.conjunction ? ` ${slot.conjunction.text} ` : ' and '
  return words.slice(0, -1).join(', ') + joiner + words[words.length - 1]
}

function describeModifiers(mods: ModifierAttachment[], noun: string): string[] {
  if (!mods.length) return []
  const list = mods.map((m) => `"${m.word.text}"`).join(', ')
  return [`${list} modif${mods.length > 1 ? 'y' : 'ies'} ${noun}.`]
}

function explainClause(clause: Clause): string[] {
  const lines: string[] = []
  if (!clause.subject || !clause.verb) {
    lines.push("This part of the sentence couldn't be broken down with confidence — try rewriting it as a simple, complete sentence.")
    return lines
  }

  const subjText = joinHeads(clause.subject)
  const verbText = clause.verb.conjunction
    ? clause.verb.heads.map((h) => `"${h.text}"`).join(` ${clause.verb.conjunction.text} `)
    : `"${clause.verb.heads.map((h) => h.text).join(' ')}"`

  lines.push(`The complete subject is ${subjText}, and the complete predicate centers on the verb ${verbText}.`)

  clause.subject.heads.forEach((h) => {
    lines.push(...describeModifiers(clause.subject!.modifiers[h.id] ?? [], `"${h.text}"`))
  })
  clause.subject.prepPhrases.forEach((pp) => {
    lines.push(`The prepositional phrase "${pp.preposition.text} ${pp.objectHead.text}" describes "${clause.subject!.heads.find((h) => h.id === pp.modifies)?.text ?? 'the noun'}."`)
  })

  if (clause.verb.isLinking) {
    lines.push(`"${clause.verb.heads[clause.verb.heads.length - 1].text}" is a linking verb — it connects the subject to a word that renames or describes it, rather than showing an action.`)
  }

  if (clause.indirectObject) {
    lines.push(`${joinHeads(clause.indirectObject)} is the indirect object — it tells to/for whom or what the action of the verb was done.`)
  }

  if (clause.complementKind === 'directObject' && clause.complement) {
    lines.push(`${joinHeads(clause.complement)} is the direct object — it receives the action of the verb.`)
    clause.complement.heads.forEach((h) => {
      lines.push(...describeModifiers(clause.complement!.modifiers[h.id] ?? [], `"${h.text}"`))
    })
  } else if (clause.complementKind === 'predicateNominative' && clause.complement) {
    lines.push(`${joinHeads(clause.complement)} is a predicate nominative — it follows the linking verb and renames the subject.`)
  } else if (clause.complementKind === 'predicateAdjective' && clause.predicateAdjective) {
    const words = clause.predicateAdjective.heads.map((h) => `"${h.text}"`).join(' and ')
    lines.push(`${words} ${clause.predicateAdjective.heads.length > 1 ? 'are' : 'is'} a predicate adjective — it follows the linking verb and describes the subject.`)
  } else if (clause.complementKind === 'none') {
    lines.push(`"${clause.verb.heads[clause.verb.heads.length - 1].text}" is intransitive here — it doesn't act on an object.`)
  }

  clause.verb.prepPhrases.forEach((pp) => {
    lines.push(`The prepositional phrase "${pp.preposition.text} ${pp.objectHead.text}" modifies the verb, acting as an adverb (telling how, when, or where).`)
  })

  if (clause.leftoverWords.length) {
    lines.push(`Not diagrammed: ${clause.leftoverWords.map((w) => `"${w.text}"`).join(', ')}.`)
  }

  return lines
}

export function explainSentence(analysis: SentenceAnalysis): { clauseId: string; kind: string; lines: string[] }[] {
  return analysis.clauses.map((c) => ({
    clauseId: c.id,
    kind: c.kind === 'independent' ? 'Independent clause' : 'Subordinate clause',
    lines: explainClause(c),
  }))
}
