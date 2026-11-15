/**
 * 不等式 —— SVG 渲染与命中
 */

import type { BoardMetrics, GameState, Puzzle, ValidationResult } from '../core/types'
import { cellAtPoint, cellCenter, squareMetrics } from '../core/board'
import {
  asFutoPuzzle,
  asFutoState,
  edgeCells,
  edgeCount,
  type FutoResult,
} from './types'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  return squareMetrics(puzzle.width, puzzle.height, {
    cell: 46,
    pad: 34,
    targetKind: 'cell',
  })
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
  _colorGrid?: unknown,
): string {
  const m = metricsFor(puzzle)
  const p = asFutoPuzzle(puzzle)
  const s = asFutoState(state)
  const r = result as FutoResult
  const n = puzzle.width
  const bad = new Set<number>(r.badCells ?? [])
  const badRelations = new Set<string>()
  for (const issue of r.relationIssues ?? []) {
    badRelations.add(`${Math.min(issue.a, issue.b)},${Math.max(issue.a, issue.b)}`)
  }

  const cell = m.cell
  const ox = m.originX ?? m.pad
  const oy = m.originY ?? m.pad
  const gap = Math.max(1, cell * 0.04)
  const inner = cell - gap
  const parts: string[] = []

  parts.push(
    `<rect class="ft-board-bg" x="${ox - 10}" y="${oy - 10}" width="${n * cell + 20}" height="${n * cell + 20}" rx="${(cell * 0.18).toFixed(2)}" />`,
  )

  for (let i = 0; i < n * n; i++) {
    const x = ox + (i % n) * cell + gap / 2
    const y = oy + Math.floor(i / n) * cell + gap / 2
    const v = s.cells[i] ?? 0
    const given = (s.givens[i] ?? 0) !== 0
    let cls = 'ft-cell' + (v === 0 ? ' empty' : ' filled') + (given ? ' given' : '') + (bad.has(i) ? ' bad' : '')
    let content = `<rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${inner.toFixed(2)}" height="${inner.toFixed(2)}" rx="${(cell * 0.1).toFixed(2)}" />`
    if (given) {
      content += `<circle class="ft-given-ring" cx="${(x + inner / 2).toFixed(2)}" cy="${(y + inner / 2).toFixed(2)}" r="${(inner * 0.42).toFixed(2)}" />`
    }
    if (v !== 0) {
      content += `<text class="ft-value" x="${(x + inner / 2).toFixed(2)}" y="${(y + inner / 2 + cell * 0.02).toFixed(2)}" style="font-size:${(cell * 0.42).toFixed(2)}px">${v}</text>`
    }
    if (bad.has(i)) {
      content += `<rect class="ft-error" x="${(x + 1.1).toFixed(2)}" y="${(y + 1.1).toFixed(2)}" width="${(inner - 2.2).toFixed(2)}" height="${(inner - 2.2).toFixed(2)}" rx="${(cell * 0.1).toFixed(2)}" />`
    }
    parts.push(`<g data-index="${i}">${content}</g>`)
  }

  // 相邻连续的黑点（无点表示不连续）
  const relParts: string[] = []
  const count = edgeCount(n)
  for (let e = 0; e < count; e++) {
    const rel = p.relations?.[e] ?? 0
    if (rel !== 1) continue
    const pair = edgeCells(e, n)
    if (!pair) continue
    const a = cellCenter(m, pair.a)
    const b = cellCenter(m, pair.b)
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const issue = badRelations.has(`${Math.min(pair.a, pair.b)},${Math.max(pair.a, pair.b)}`) ? ' issue' : ''
    relParts.push(
      `<circle class="ft-dot${issue}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(cell * 0.09).toFixed(2)}" />`,
    )
  }
  parts.push(`<g class="ft-relations">${relParts.join('')}</g>`)

  for (let i = 0; i < n * n; i++) {
    const x = ox + (i % n) * cell
    const y = oy + Math.floor(i / n) * cell
    parts.push(
      `<rect class="cell-hit" data-index="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" />`,
    )
  }

  return `<svg class="board-svg ft-board" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(
  m: BoardMetrics,
  _puzzle: Puzzle,
  x: number,
  y: number,
): { index: number } | null {
  const index = cellAtPoint(m, x, y)
  return index == null ? null : { index }
}
