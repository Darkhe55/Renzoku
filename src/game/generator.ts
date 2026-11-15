/**
 * 连续题库生成器
 *
 * 1. 随机拉丁方终盘；
 * 2. 相邻连续的两格之间标记黑点，其余边标记不连续；
 * 3. 随机顺序揭示预填数字，二分查找最小唯一解前缀。
 */

import type { Difficulty } from '../core/types'
import {
  edgeCount,
  encodeBoard,
  encodeCells,
  horizontalEdgeIndex,
  verticalEdgeIndex,
} from './types.ts'
import { solveByRules } from './rules.ts'
import { countSolutions } from './solver.ts'

export interface RawPuzzleOut {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

interface GenSpec {
  n: number
  density: number
  seed: number
  difficulty: Difficulty
  name: string
  series: string
  attempts: number
  maxNodes: number
  requireLogic: boolean
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = list[i]!
    list[i] = list[j]!
    list[j] = tmp
  }
  return list
}

function makeLatin(n: number, rng: () => number): number[] {
  const rowOrder = shuffle(Array.from({ length: n }, (_, i) => i), rng)
  const colOrder = shuffle(Array.from({ length: n }, (_, i) => i), rng)
  const symbols = shuffle(Array.from({ length: n }, (_, i) => i + 1), rng)
  const cells = new Array<number>(n * n).fill(0)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const raw = (colOrder[x]! + rowOrder[y]!) % n
      cells[y * n + x] = symbols[raw]!
    }
  }
  return cells
}

interface AttemptStats {
  notUnique: number
  timeout: number
}

function attemptPuzzle(
  spec: GenSpec,
  rng: () => number,
  stats: AttemptStats,
): { givens: number[]; relations: number[]; solution: number[] } | null {
  const n = spec.n
  const solution = makeLatin(n, rng)

  const relations = new Array<number>(edgeCount(n)).fill(0)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x + 1 < n; x++) {
      const a = solution[y * n + x]!
      const b = solution[y * n + x + 1]!
      relations[horizontalEdgeIndex(n, x, y)] = Math.abs(a - b) === 1 ? 1 : 0
    }
  }
  for (let y = 0; y + 1 < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = solution[y * n + x]!
      const b = solution[(y + 1) * n + x]!
      relations[verticalEdgeIndex(n, x, y)] = Math.abs(a - b) === 1 ? 1 : 0
    }
  }

  const order = shuffle(
    Array.from({ length: n * n }, (_, i) => i),
    rng,
  )
  const applyPrefix = (count: number): number[] => {
    const givens = new Array<number>(n * n).fill(0)
    for (let i = 0; i < count; i++) {
      const idx = order[i]!
      givens[idx] = solution[idx]!
    }
    return givens
  }
  const isUnique = (givens: number[]): boolean | null => {
    const out = countSolutions(givens, relations, n, 2, spec.maxNodes)
    if (out.timedOut) return null
    return out.count === 1
  }

  let lo = 0
  let hi = n * n
  const fullUnique = isUnique(applyPrefix(hi))
  if (fullUnique === null) {
    stats.timeout++
    return null
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const unique = isUnique(applyPrefix(mid))
    if (unique === null) {
      stats.timeout++
      return null
    }
    if (unique) hi = mid
    else lo = mid + 1
  }
  const givens = applyPrefix(lo)

  if (spec.requireLogic) {
    solveByRules(givens, relations, n, true, 240)
  }

  return { givens, relations, solution }
}

const SPECS: GenSpec[] = [
  {
    n: 4,
    density: 0.5,
    seed: 0x46555401,
    difficulty: 'easy',
    name: '初识连续',
    series: '入门',
    attempts: 300,
    maxNodes: 60_000,
    requireLogic: true,
  },
  {
    n: 5,
    density: 0.5,
    seed: 0x46555402,
    difficulty: 'easy',
    name: '五阶连续',
    series: '入门',
    attempts: 400,
    maxNodes: 100_000,
    requireLogic: true,
  },
  {
    n: 5,
    density: 0.6,
    seed: 0x46555403,
    difficulty: 'medium',
    name: '相邻回廊',
    series: '进阶',
    attempts: 500,
    maxNodes: 120_000,
    requireLogic: true,
  },
  {
    n: 6,
    density: 0.5,
    seed: 0x46555404,
    difficulty: 'medium',
    name: '六阶连续',
    series: '进阶',
    attempts: 600,
    maxNodes: 150_000,
    requireLogic: false,
  },
  {
    n: 6,
    density: 0.6,
    seed: 0x46555405,
    difficulty: 'hard',
    name: '连续之墙',
    series: '挑战',
    attempts: 700,
    maxNodes: 180_000,
    requireLogic: false,
  },
  {
    n: 6,
    density: 0.7,
    seed: 0x46555406,
    difficulty: 'hard',
    name: '连续终局',
    series: '挑战',
    attempts: 800,
    maxNodes: 200_000,
    requireLogic: false,
  },
]

export function generatePuzzles(): RawPuzzleOut[] {
  const out: RawPuzzleOut[] = []
  for (const spec of SPECS) {
    const rng = mulberry32(spec.seed)
    const stats: AttemptStats = { notUnique: 0, timeout: 0 }
    let made: { givens: number[]; relations: number[]; solution: number[] } | null = null
    const t0 = Date.now()
    for (let attempt = 0; attempt < spec.attempts; attempt++) {
      made = attemptPuzzle(spec, rng, stats)
      if (made) break
    }
    if (!made) {
      console.error(`[连续 gen] ${spec.name} 失败统计：`, stats)
      throw new Error(`[连续 gen] ${spec.name} 在 ${spec.attempts} 次尝试内没有生成合法题`)
    }
    const givenCount = made.givens.filter((v) => v !== 0).length
    const relCount = made.relations.filter((v) => v !== 0).length
    console.log(
      `[连续 gen] ${spec.name} ${spec.n}×${spec.n}：预填 ${givenCount}，黑点 ${relCount}，${Date.now() - t0}ms`,
    )
    out.push({
      id: `renzoku-${spec.n}x${spec.n}-${spec.seed.toString(36)}`,
      name: spec.name,
      width: spec.n,
      height: spec.n,
      difficulty: spec.difficulty,
      series: spec.series,
      board: encodeBoard(made.givens, made.relations),
      solution: encodeCells(made.solution),
    })
  }
  return out
}
