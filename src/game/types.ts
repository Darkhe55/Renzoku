/**
 * 连续（Renzoku）—— 游戏专用类型
 *
 * 规则：在 n×n 中填入 1..n，每行每列不重复；相邻格有黑点表示数字连续，
 * 没有黑点表示数字不连续。
 *
 * 状态：0 = 未填，1..n = 数字。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export interface FutoPuzzle extends Puzzle {
  givens: number[]
  /** 关系：1 = 相邻连续，0 = 相邻不连续；先水平边（逐行），再竖直边（逐行） */
  relations: number[]
  solution?: number[]
}

export interface FutoState extends GameState {
  cells: number[]
  givens: number[]
}

export interface DuplicateIssue {
  orientation: 'row' | 'col'
  index: number
  value: number
  cells: number[]
}

export interface RelationIssue {
  a: number
  b: number
  relation: number
}

export interface FutoResult extends ValidationResult {
  empty: number
  complete: boolean
  duplicateIssues: DuplicateIssue[]
  relationIssues: RelationIssue[]
  changedGivens: number[]
  badCells: number[]
}

export function asFutoPuzzle(p: Puzzle): FutoPuzzle {
  return p as FutoPuzzle
}

export function asFutoState(s: GameState): FutoState {
  return s as FutoState
}

export function horizontalEdgeCount(n: number): number {
  return n > 1 ? n * (n - 1) : 0
}

export function verticalEdgeCount(n: number): number {
  return n > 1 ? (n - 1) * n : 0
}

export function edgeCount(n: number): number {
  return horizontalEdgeCount(n) + verticalEdgeCount(n)
}

export function horizontalEdgeIndex(n: number, x: number, y: number): number {
  return y * (n - 1) + x
}

export function verticalEdgeIndex(n: number, x: number, y: number): number {
  return horizontalEdgeCount(n) + y * n + x
}

export function edgeCells(edge: number, n: number): { a: number; b: number } | null {
  const hCount = horizontalEdgeCount(n)
  if (edge < 0) return null
  if (edge < hCount) {
    const y = Math.floor(edge / (n - 1))
    const x = edge % (n - 1)
    const a = y * n + x
    return { a, b: a + 1 }
  }
  const v = edge - hCount
  if (v >= verticalEdgeCount(n)) return null
  const y = Math.floor(v / n)
  const x = v % n
  const a = y * n + x
  return { a, b: a + n }
}

export function encodeBoard(givens: ArrayLike<number>, relations: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < givens.length; i++) out += String(givens[i]! | 0)
  out += '|'
  for (let i = 0; i < relations.length; i++) out += String(relations[i]! | 0)
  return out
}

export function decodeBoard(
  text: string,
  n: number,
): { givens: number[]; relations: number[] } | null {
  if (typeof text !== 'string') return null
  const parts = text.split('|')
  if (parts.length !== 2) return null
  const givensText = parts[0]!
  if (givensText.length !== n * n) return null
  const givens = new Array<number>(n * n).fill(0)
  for (let i = 0; i < n * n; i++) {
    const v = givensText.charCodeAt(i) - 48
    if (v < 0 || v > n) return null
    givens[i] = v
  }
  const relationText = parts[1]!
  if (relationText.length !== edgeCount(n)) return null
  const relations = new Array<number>(relationText.length).fill(0)
  for (let i = 0; i < relationText.length; i++) {
    const v = relationText.charCodeAt(i) - 48
    if (v < 0 || v > 2) return null
    relations[i] = v
  }
  return { givens, relations }
}

export function encodeCells(cells: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < cells.length; i++) out += String(cells[i]! | 0)
  return out
}

export function decodeCells(text: string, expected: number, n: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected)
  for (let i = 0; i < expected; i++) {
    const v = text.charCodeAt(i) - 48
    if (v < 0 || v > n) return null
    out[i] = v
  }
  return out
}
