import type { Clause, SentenceAnalysis } from '../nlp/types'
import { POS_COLORS } from '../nlp/pos'
import { layoutClause } from './layout'
import type { DiagramGroup, DiagramLine, DiagramText } from './types'

const CLAUSE_GAP = 56
const SUB_INDENT = 46

function translate(group: DiagramGroup, dx: number, dy: number): DiagramGroup {
  return {
    ...group,
    lines: group.lines.map((l) => ({ ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy })),
    texts: group.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
    anchors: {
      baselineStartX: group.anchors.baselineStartX + dx,
      baselineEndX: group.anchors.baselineEndX + dx,
      baselineY: group.anchors.baselineY + dy,
      verbX: group.anchors.verbX + dx,
    },
  }
}

let ck = 0
function ckey(p: string) {
  ck += 1
  return `${p}-${ck}`
}

export function composeDiagram(analysis: SentenceAnalysis): { lines: DiagramLine[]; texts: DiagramText[]; width: number; height: number } {
  const lines: DiagramLine[] = []
  const texts: DiagramText[] = []
  let width = 200
  let cursorY = 0

  const independents = analysis.clauses.filter((c) => c.kind === 'independent')
  const byAttach = new Map<string, Clause[]>()
  analysis.clauses
    .filter((c) => c.kind === 'subordinate')
    .forEach((c) => {
      const k = c.attachesToClauseId ?? '__none__'
      if (!byAttach.has(k)) byAttach.set(k, [])
      byAttach.get(k)!.push(c)
    })

  const placedByClauseId = new Map<string, DiagramGroup>()
  let prevIndependent: { clause: Clause; group: DiagramGroup } | null = null

  const clauseList = independents.length > 0 ? independents : analysis.clauses.slice(0, 1)

  clauseList.forEach((clause) => {
    const raw = layoutClause(clause)
    const placed = translate(raw, 0, cursorY)
    lines.push(...placed.lines)
    texts.push(...placed.texts)
    width = Math.max(width, placed.width)
    placedByClauseId.set(clause.id, placed)

    if (prevIndependent && clause.connector) {
      const fromX = prevIndependent.group.anchors.verbX
      const fromY = prevIndependent.group.anchors.baselineY
      const toX = placed.anchors.verbX
      const toY = placed.anchors.baselineY
      const midY = fromY + (toY - fromY) / 2
      lines.push({ key: ckey('step'), x1: fromX, y1: fromY, x2: fromX, y2: midY, dashed: true })
      lines.push({ key: ckey('step'), x1: fromX, y1: midY, x2: toX, y2: midY, dashed: true })
      lines.push({ key: ckey('step'), x1: toX, y1: midY, x2: toX, y2: toY, dashed: true })
      texts.push({
        key: ckey('stepword'),
        x: (fromX + toX) / 2,
        y: midY - 6,
        text: clause.connector.text,
        color: POS_COLORS.conjunction,
        fontStyle: 'italic',
        anchor: 'middle',
        tokenId: clause.connector.id,
        explanation: `"${clause.connector.text}" joins these two independent clauses.`,
      })
    }

    cursorY += placed.height + CLAUSE_GAP
    prevIndependent = { clause, group: placed }

    const subs = byAttach.get(clause.id) ?? []
    subs.forEach((sub) => {
      const rawSub = layoutClause(sub)
      const placedSub = translate(rawSub, SUB_INDENT, cursorY)
      lines.push(...placedSub.lines)
      texts.push(...placedSub.texts)
      width = Math.max(width, placedSub.width + SUB_INDENT)

      // dashed connector from subordinate clause's verb up to the main clause's verb
      const fromX = placedSub.anchors.verbX
      const fromY = placedSub.anchors.baselineY
      const toX = placed.anchors.verbX
      const toY = placed.anchors.baselineY
      lines.push({ key: ckey('subconn'), x1: fromX, y1: fromY, x2: toX, y2: toY, dashed: true })
      if (sub.connector) {
        texts.push({
          key: ckey('subword'),
          x: (fromX + toX) / 2 + 8,
          y: (fromY + toY) / 2 - 4,
          text: sub.connector.text,
          color: POS_COLORS.conjunction,
          fontStyle: 'italic',
          fontSize: 13,
          anchor: 'middle',
          tokenId: sub.connector.id,
          explanation: `"${sub.connector.text}" introduces this subordinate clause and links it to the main clause.`,
        })
      }

      cursorY += placedSub.height + CLAUSE_GAP
    })
  })

  // orphaned subordinate clauses (no independent clause found) get appended at the end
  const orphanKey = '__none__'
  const orphans = byAttach.get(orphanKey) ?? []
  orphans.forEach((sub) => {
    const rawSub = layoutClause(sub)
    const placedSub = translate(rawSub, 0, cursorY)
    lines.push(...placedSub.lines)
    texts.push(...placedSub.texts)
    width = Math.max(width, placedSub.width)
    cursorY += placedSub.height + CLAUSE_GAP
  })

  return { lines, texts, width, height: Math.max(cursorY, 160) }
}
