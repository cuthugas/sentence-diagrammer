import type { Clause, ModifierAttachment, NounSlot, PrepPhrase, Token } from '../nlp/types'
import { POS_COLORS } from '../nlp/pos'
import { measureText } from './measure'
import type { DiagramGroup, DiagramLine, DiagramText } from './types'

const FONT_SIZE = 16
const PADDING = 24
const DIVIDER_GAP = 10
const WORD_GAP = 14
const LEVEL_HEIGHT = 30
const ANGLE_DEG = 36
const ANGLE = (ANGLE_DEG * Math.PI) / 180
const COMPOUND_OFFSET = 13

let keyCounter = 0
function key(prefix: string): string {
  keyCounter += 1
  return `${prefix}-${keyCounter}`
}

interface HeadPlacement {
  token: Token
  x: number
  y: number
}

/** Result of laying out one baseline "slot" (a compound-capable head group). */
interface SlotResult {
  startX: number
  endX: number
  rightExtent: number
  bottomExtent: number
  heads: HeadPlacement[]
}

function wordWidth(text: string, weight = 600): number {
  return measureText(text, FONT_SIZE, weight)
}

/**
 * Draws a diagonal modifier line starting at (x, y) going down-right, sized
 * to fit `text` along it, with the text rotated to match the line's angle.
 * Returns the endpoint and the line's horizontal reach, for stacking/width bookkeeping.
 */
function drawDiagonal(
  lines: DiagramLine[],
  texts: DiagramText[],
  x: number,
  y: number,
  token: Token,
  explanation: string,
  fontSize = FONT_SIZE - 2
): { endX: number; endY: number } {
  const w = measureText(token.text, fontSize, 500)
  const len = w / Math.cos(ANGLE) + 10
  const dx = len * Math.cos(ANGLE)
  const dy = len * Math.sin(ANGLE)
  const x2 = x + dx
  const y2 = y + dy
  lines.push({ key: key('dl'), x1: x, y1: y, x2, y2 })
  const midX = x + dx * 0.52
  const midY = y + dy * 0.52
  texts.push({
    key: key('dt'),
    x: midX,
    y: midY - 5,
    text: token.text,
    angle: ANGLE_DEG,
    color: POS_COLORS[token.pos],
    fontSize,
    anchor: 'middle',
    tokenId: token.id,
    explanation,
  })
  return { endX: x2, endY: y2 }
}

/** Lays out a stack of modifiers (and their sub-modifiers) below a head point. */
function layoutModifierStack(
  lines: DiagramLine[],
  texts: DiagramText[],
  headX: number,
  baseY: number,
  modifiers: ModifierAttachment[]
): { rightExtent: number; bottomExtent: number } {
  let rightExtent = headX
  let bottomExtent = baseY
  modifiers.forEach((mod, i) => {
    const y = baseY + LEVEL_HEIGHT * (i + 1) - LEVEL_HEIGHT + 6
    const { endX, endY } = drawDiagonal(lines, texts, headX, y, mod.word, mod.explanation)
    rightExtent = Math.max(rightExtent, endX)
    bottomExtent = Math.max(bottomExtent, endY)
    if (mod.subModifiers && mod.subModifiers.length) {
      mod.subModifiers.forEach((sub) => {
        const branchX = headX + (endX - headX) * 0.35
        const branchY = y + (endY - y) * 0.35
        const r = drawDiagonal(lines, texts, branchX, branchY, sub.word, sub.explanation, FONT_SIZE - 4)
        rightExtent = Math.max(rightExtent, r.endX)
        bottomExtent = Math.max(bottomExtent, r.endY)
      })
    }
  })
  return { rightExtent, bottomExtent }
}

/** Lays out prepositional-phrase "flags" hanging below a head, continuing the stack. */
function layoutPrepPhrases(
  lines: DiagramLine[],
  texts: DiagramText[],
  headX: number,
  baseY: number,
  startLevel: number,
  phrases: PrepPhrase[]
): { rightExtent: number; bottomExtent: number } {
  let rightExtent = headX
  let bottomExtent = baseY
  phrases.forEach((pp, i) => {
    const y = baseY + LEVEL_HEIGHT * (startLevel + i) + 6
    const { endX, endY } = drawDiagonal(lines, texts, headX, y, pp.preposition, `"${pp.preposition.text}" shows the relationship to what follows.`)
    // shelf: horizontal baseline for the object of the preposition
    const shelfY = endY + 8
    const shelfStartX = endX - 6
    let cx = shelfStartX
    const objW = wordWidth(pp.objectHead.text)
    lines.push({ key: key('shelf'), x1: shelfStartX, y1: shelfY, x2: shelfStartX + objW + 60, y2: shelfY })
    texts.push({
      key: key('obj'),
      x: cx + 4,
      y: shelfY - 6,
      text: pp.objectHead.text,
      color: POS_COLORS[pp.objectHead.pos],
      fontWeight: 600,
      anchor: 'start',
      tokenId: pp.objectHead.id,
      explanation: `Object of the preposition "${pp.preposition.text}."`,
    })
    cx += objW + 8
    const mods = layoutModifierStack(lines, texts, cx - objW / 2, shelfY, pp.objectModifiers)
    rightExtent = Math.max(rightExtent, endX, mods.rightExtent, cx)
    bottomExtent = Math.max(bottomExtent, mods.bottomExtent, shelfY + LEVEL_HEIGHT)
  })
  return { rightExtent, bottomExtent }
}

/** Lays out a noun-phrase slot (subject, object, etc.) starting at startX on the baseline. */
function layoutNounSlot(
  lines: DiagramLine[],
  texts: DiagramText[],
  startX: number,
  baselineY: number,
  slot: NounSlot
): SlotResult {
  const heads: HeadPlacement[] = []
  let cx = startX
  let rightExtent = startX
  let bottomExtent = baselineY
  const isCompound = slot.heads.length > 1 && !!slot.conjunction

  slot.heads.forEach((h, i) => {
    const y = isCompound ? baselineY + (i % 2 === 0 ? -COMPOUND_OFFSET : COMPOUND_OFFSET) : baselineY
    const w = wordWidth(h.text)
    if (isCompound && i > 0) {
      lines.push({ key: key('cjoin'), x1: cx - 4, y1: baselineY - COMPOUND_OFFSET, x2: cx - 4, y2: baselineY + COMPOUND_OFFSET, dashed: true })
      if (slot.conjunction) {
        texts.push({
          key: key('cword'),
          x: cx + 4,
          y: baselineY + 4,
          text: slot.conjunction.text,
          color: POS_COLORS.conjunction,
          fontStyle: 'italic',
          fontSize: FONT_SIZE - 3,
          anchor: 'start',
          tokenId: slot.conjunction.id,
          explanation: `"${slot.conjunction.text}" connects the compound parts.`,
        })
      }
      cx += 26
    }
    texts.push({
      key: key('head'),
      x: cx,
      y: y - 6,
      text: h.text,
      color: POS_COLORS[h.pos],
      fontWeight: 700,
      anchor: 'start',
      tokenId: h.id,
      explanation: undefined,
    })
    heads.push({ token: h, x: cx + w / 2, y })
    const mods = layoutModifierStack(lines, texts, cx, y, slot.modifiers[h.id] ?? [])
    rightExtent = Math.max(rightExtent, cx + w, mods.rightExtent)
    bottomExtent = Math.max(bottomExtent, mods.bottomExtent)
    cx += w + WORD_GAP
  })

  if (slot.prepPhrases.length) {
    const last = heads[heads.length - 1]
    const startLevel = Math.max(1, Math.round((bottomExtent - baselineY) / LEVEL_HEIGHT) + 1)
    const pp = layoutPrepPhrases(lines, texts, last.x - wordWidth(last.token.text) / 2, baselineY, startLevel, slot.prepPhrases)
    rightExtent = Math.max(rightExtent, pp.rightExtent)
    bottomExtent = Math.max(bottomExtent, pp.bottomExtent)
  }

  return { startX, endX: cx - WORD_GAP, rightExtent, bottomExtent, heads }
}

export function layoutClause(clause: Clause): DiagramGroup {
  const lines: DiagramLine[] = []
  const texts: DiagramText[] = []
  const baselineY = 60
  let cx = PADDING
  let maxBottom = baselineY

  if (!clause.subject || !clause.verb) {
    // fallback: just lay out the raw words left to right, unstyled-structure
    clause.leftoverWords.forEach((w) => {
      const width = wordWidth(w.text)
      texts.push({ key: key('raw'), x: cx, y: baselineY - 6, text: w.text, color: POS_COLORS[w.pos], anchor: 'start', tokenId: w.id })
      lines.push({ key: key('base'), x1: cx, y1: baselineY, x2: cx + width, y2: baselineY })
      cx += width + WORD_GAP
    })
    return {
      lines,
      texts,
      width: Math.max(cx + PADDING, 200),
      height: baselineY + 40,
      anchors: { baselineStartX: PADDING, baselineEndX: cx, baselineY, verbX: cx / 2 },
    }
  }

  // subject
  const subj = layoutNounSlot(lines, texts, cx, baselineY, clause.subject)
  maxBottom = Math.max(maxBottom, subj.bottomExtent)
  cx = subj.rightExtent + DIVIDER_GAP

  // divider: subject | verb (crosses baseline)
  const subjVerbDividerX = cx
  lines.push({ key: key('div'), x1: subjVerbDividerX, y1: baselineY - 16, x2: subjVerbDividerX, y2: baselineY + 8 })
  cx += DIVIDER_GAP

  // verb
  const verbSlotAsNoun: NounSlot = {
    heads: clause.verb.heads,
    conjunction: clause.verb.conjunction,
    modifiers: clause.verb.modifiers,
    prepPhrases: clause.verb.prepPhrases,
  }
  const verbRes = layoutNounSlot(lines, texts, cx, baselineY, verbSlotAsNoun)
  maxBottom = Math.max(maxBottom, verbRes.bottomExtent)
  const verbAnchorX = (verbRes.startX + verbRes.endX) / 2
  cx = verbRes.rightExtent + DIVIDER_GAP

  // indirect object: hangs below the verb like a phrase (implied "to/for")
  if (clause.indirectObject) {
    const ioHeadX = verbRes.heads[verbRes.heads.length - 1]?.x ?? verbAnchorX
    const y = baselineY + 8
    const w = wordWidth(clause.indirectObject.heads[0].text)
    const dx = 34
    const dy = 26
    lines.push({ key: key('io-diag'), x1: ioHeadX, y1: y, x2: ioHeadX + dx, y2: y + dy })
    const shelfY = y + dy + 8
    lines.push({ key: key('io-shelf'), x1: ioHeadX + dx - 6, y1: shelfY, x2: ioHeadX + dx - 6 + w + 30, y2: shelfY })
    texts.push({
      key: key('io-word'),
      x: ioHeadX + dx,
      y: shelfY - 6,
      text: clause.indirectObject.heads[0].text,
      color: POS_COLORS[clause.indirectObject.heads[0].pos],
      fontWeight: 600,
      anchor: 'start',
      tokenId: clause.indirectObject.heads[0].id,
      explanation: 'Indirect object — tells to/for whom or what the action was done.',
    })
    const modRes = layoutModifierStack(lines, texts, ioHeadX + dx, shelfY, clause.indirectObject.modifiers[clause.indirectObject.heads[0].id] ?? [])
    maxBottom = Math.max(maxBottom, modRes.bottomExtent, shelfY + LEVEL_HEIGHT)
  }

  // complement: direct object / predicate nominative / predicate adjective
  if (clause.complementKind === 'directObject' && clause.complement) {
    lines.push({ key: key('div2'), x1: cx, y1: baselineY - 16, x2: cx, y2: baselineY })
    cx += DIVIDER_GAP
    const res = layoutNounSlot(lines, texts, cx, baselineY, clause.complement)
    maxBottom = Math.max(maxBottom, res.bottomExtent)
    cx = res.rightExtent
  } else if (clause.complementKind === 'predicateNominative' && clause.complement) {
    lines.push({ key: key('div3'), x1: cx, y1: baselineY - 16, x2: cx + 10, y2: baselineY })
    cx += 14
    const res = layoutNounSlot(lines, texts, cx, baselineY, clause.complement)
    maxBottom = Math.max(maxBottom, res.bottomExtent)
    cx = res.rightExtent
  } else if (clause.complementKind === 'predicateAdjective' && clause.predicateAdjective) {
    lines.push({ key: key('div4'), x1: cx, y1: baselineY - 16, x2: cx + 10, y2: baselineY })
    cx += 14
    const pa = clause.predicateAdjective
    let px = cx
    pa.heads.forEach((h) => {
      const w = wordWidth(h.text)
      texts.push({ key: key('pahead'), x: px, y: baselineY - 6, text: h.text, color: POS_COLORS[h.pos], fontWeight: 700, anchor: 'start', tokenId: h.id })
      const mods = layoutModifierStack(lines, texts, px, baselineY, pa.modifiers[h.id] ?? [])
      maxBottom = Math.max(maxBottom, mods.bottomExtent)
      px += w + WORD_GAP
    })
    cx = px - WORD_GAP
  }

  // main baseline
  lines.push({ key: key('baseline'), x1: PADDING, y1: baselineY, x2: cx, y2: baselineY })

  const width = Math.max(cx + PADDING, 220)
  const height = maxBottom + PADDING

  return {
    lines,
    texts,
    width,
    height,
    anchors: { baselineStartX: PADDING, baselineEndX: cx, baselineY, verbX: verbAnchorX },
  }
}
