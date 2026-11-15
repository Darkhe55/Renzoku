/**
 * 不等式 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { isValidSolution } from './rules'
import {
  asFutoPuzzle,
  asFutoState,
  edgeCells,
  edgeCount,
  type DuplicateIssue,
  type FutoResult,
  type RelationIssue,
} from './types'

export function validate(state: GameState, puzzle: Puzzle): FutoResult {
  const s = asFutoState(state)
  const p = asFutoPuzzle(puzzle)
  const n = s.width
  const size = n * n
  const cells = s.cells
  const relations = p.relations ?? []

  let empty = 0
  const changed = new Set<number>()
  for (let i = 0; i < size; i++) {
    if (cells[i] === 0) empty++
    const given = p.givens?.[i] ?? 0
    if (given !== 0 && cells[i] !== given) changed.add(i)
  }

  const bad = new Set<number>()
  for (const i of changed) bad.add(i)
  const duplicateIssues: DuplicateIssue[] = []

  for (let y = 0; y < n; y++) {
    const map = new Map<number, number[]>()
    for (let x = 0; x < n; x++) {
      const v = cells[y * n + x]!
      if (v === 0) continue
      const list = map.get(v) ?? []
      list.push(y * n + x)
      map.set(v, list)
    }
    for (const [value, list] of map) {
      if (list.length > 1) {
        duplicateIssues.push({ orientation: 'row', index: y, value, cells: list })
        for (const i of list) bad.add(i)
      }
    }
  }
  for (let x = 0; x < n; x++) {
    const map = new Map<number, number[]>()
    for (let y = 0; y < n; y++) {
      const v = cells[y * n + x]!
      if (v === 0) continue
      const list = map.get(v) ?? []
      list.push(y * n + x)
      map.set(v, list)
    }
    for (const [value, list] of map) {
      if (list.length > 1) {
        duplicateIssues.push({ orientation: 'col', index: x, value, cells: list })
        for (const i of list) bad.add(i)
      }
    }
  }

  const relationIssues: RelationIssue[] = []
  const count = edgeCount(n)
  for (let e = 0; e < count; e++) {
    const rel = relations[e] ?? 0
    const pair = edgeCells(e, n)
    if (!pair) continue
    const { a, b } = pair
    if (cells[a] === 0 || cells[b] === 0) continue
    const consec = Math.abs(cells[a]! - cells[b]!) === 1
    if (consec !== (rel === 1)) {
      relationIssues.push({ a, b, relation: rel })
      bad.add(a)
      bad.add(b)
    }
  }

  const complete = empty === 0
  const solved =
    complete &&
    duplicateIssues.length === 0 &&
    relationIssues.length === 0 &&
    changed.size === 0 &&
    isValidSolution(cells, relations, n)

  return {
    solved,
    empty,
    complete,
    duplicateIssues,
    relationIssues,
    changedGivens: Array.from(changed),
    badCells: Array.from(bad),
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as FutoResult
  if (r.solved) return ['完成']
  const bits: string[] = []
  if (typeof r.empty === 'number' && r.empty > 0) bits.push(`还需填 ${r.empty} 格`)
  if (r.duplicateIssues.length > 0) bits.push(`${r.duplicateIssues.length} 处行列重复`)
  if (r.relationIssues.length > 0) bits.push(`${r.relationIssues.length} 处大小号不满足`)
  if (r.changedGivens.length > 0) bits.push('题面预填数字被改动')
  if (bits.length === 0) bits.push('继续填空')
  return bits
}
