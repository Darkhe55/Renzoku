/**
 * 不等式 —— 题库加载
 */

import { RAW_PUZZLES } from './puzzles-data'
import {
  asFutoPuzzle,
  decodeBoard,
  decodeCells,
  type FutoPuzzle,
  type FutoState,
} from './types'

export const builtinPuzzles: FutoPuzzle[] = []
const solutions = new Map<string, number[]>()

for (const raw of RAW_PUZZLES) {
  if (raw.width !== raw.height) continue
  const n = raw.width
  const decoded = decodeBoard(raw.board, n)
  if (!decoded) {
    console.warn(`[不等式] 题面解码失败：${raw.id}`)
    continue
  }
  const puzzle: FutoPuzzle = {
    id: raw.id,
    name: raw.name,
    width: n,
    height: n,
    difficulty: raw.difficulty,
    givens: decoded.givens,
    relations: decoded.relations,
  }
  builtinPuzzles.push(puzzle)
  if (raw.solution) {
    const solution = decodeCells(raw.solution, n * n, n)
    if (solution) {
      puzzle.solution = solution
      solutions.set(raw.id, solution)
    }
  }
}

export function getReferenceSolution(id: string): FutoState | null {
  const cells = solutions.get(id)
  if (!cells) return null
  const puzzle = builtinPuzzles.find((p) => p.id === id)
  if (!puzzle) return null
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    cells: cells.slice(),
    givens: puzzle.givens.slice(),
  }
}

export function puzzleById(id: string): FutoPuzzle | undefined {
  return builtinPuzzles.find((p) => p.id === id)
}

export function referenceFor(puzzle: FutoPuzzle): number[] | null {
  return asFutoPuzzle(puzzle).solution ?? solutions.get(puzzle.id) ?? null
}
