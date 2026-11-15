/**
 * 不等式 —— 规则引擎
 */

import { edgeCells, edgeCount } from './types.ts'

export type RuleKind = 'latin' | 'relation'

export type SetCallback = (index: number, value: number, rule: RuleKind) => void

export function initialGrid(givens: ArrayLike<number>, size: number): number[] {
  const grid = new Array<number>(size).fill(0)
  for (let i = 0; i < size; i++) {
    const v = givens[i] ?? 0
    if (v >= 1) grid[i] = v
  }
  return grid
}

export function propagate(
  cells: number[],
  relations: ArrayLike<number>,
  n: number,
  onSet?: SetCallback,
): boolean {
  const size = n * n
  let changed = true

  const set = (i: number, value: number, kind: RuleKind): boolean => {
    if (cells[i] === value) return true
    if (cells[i] !== 0) return false
    cells[i] = value
    onSet?.(i, value, kind)
    changed = true
    return true
  }

  while (changed) {
    changed = false

    // 行列重复
    for (let y = 0; y < n; y++) {
      const seen = new Set<number>()
      for (let x = 0; x < n; x++) {
        const v = cells[y * n + x]!
        if (v === 0) continue
        if (seen.has(v)) return false
        seen.add(v)
      }
    }
    for (let x = 0; x < n; x++) {
      const seen = new Set<number>()
      for (let y = 0; y < n; y++) {
        const v = cells[y * n + x]!
        if (v === 0) continue
        if (seen.has(v)) return false
        seen.add(v)
      }
    }

    const latin = new Array<number[]>(size)
    for (let i = 0; i < size; i++) {
      if (cells[i] !== 0) {
        latin[i] = []
        continue
      }
      const x = i % n
      const y = (i / n) | 0
      const used = new Set<number>()
      for (let k = 0; k < n; k++) {
        if (cells[y * n + k] !== 0) used.add(cells[y * n + k]!)
        if (cells[k * n + x] !== 0) used.add(cells[k * n + x]!)
      }
      const cands: number[] = []
      for (let v = 1; v <= n; v++) if (!used.has(v)) cands.push(v)
      latin[i] = cands
    }

    // 连续/不连续过滤（每条边都有约束：1 = 连续，0 = 不连续）
    const cands = latin.map((list) => list.slice())
    const count = edgeCount(n)
    for (let e = 0; e < count; e++) {
      const rel = relations[e] ?? 0
      const pair = edgeCells(e, n)
      if (!pair) continue
      const { a, b } = pair
      if (cells[a] !== 0 && cells[b] !== 0) {
        const consec = Math.abs(cells[a]! - cells[b]!) === 1
        if (consec !== (rel === 1)) return false
        continue
      }
      const canA = (v: number): boolean => {
        if (cells[b] !== 0) return (Math.abs(v - cells[b]!) === 1) === (rel === 1)
        const other = cands[b]!
        if (!other.length) return false
        return other.some((u) => (Math.abs(v - u) === 1) === (rel === 1))
      }
      const canB = (u: number): boolean => {
        if (cells[a] !== 0) return (Math.abs(cells[a]! - u) === 1) === (rel === 1)
        const other = cands[a]!
        if (!other.length) return false
        return other.some((v) => (Math.abs(v - u) === 1) === (rel === 1))
      }
      if (cells[a] === 0) cands[a] = cands[a]!.filter(canA)
      if (cells[b] === 0) cands[b] = cands[b]!.filter(canB)
    }

    // 唯一候选
    for (let i = 0; i < size; i++) {
      if (cells[i] !== 0) continue
      const list = cands[i]!
      if (list.length === 0) return false
      if (list.length === 1 && !set(i, list[0]!, 'latin')) return false
    }

    // 行/列隐藏单值
    for (let y = 0; y < n; y++) {
      const has = new Set<number>()
      for (let x = 0; x < n; x++) if (cells[y * n + x] !== 0) has.add(cells[y * n + x]!)
      for (let v = 1; v <= n; v++) {
        if (has.has(v)) continue
        const spots: number[] = []
        for (let x = 0; x < n; x++) {
          const i = y * n + x
          if (cells[i] === 0 && cands[i]!.includes(v)) spots.push(i)
        }
        if (spots.length === 0) return false
        if (spots.length === 1 && !set(spots[0]!, v, 'latin')) return false
      }
    }
    for (let x = 0; x < n; x++) {
      const has = new Set<number>()
      for (let y = 0; y < n; y++) if (cells[y * n + x] !== 0) has.add(cells[y * n + x]!)
      for (let v = 1; v <= n; v++) {
        if (has.has(v)) continue
        const spots: number[] = []
        for (let y = 0; y < n; y++) {
          const i = y * n + x
          if (cells[i] === 0 && cands[i]!.includes(v)) spots.push(i)
        }
        if (spots.length === 0) return false
        if (spots.length === 1 && !set(spots[0]!, v, 'latin')) return false
      }
    }
  }

  return true
}

export function isValidSolution(
  cells: ArrayLike<number>,
  relations: ArrayLike<number>,
  n: number,
): boolean {
  const size = n * n
  for (let i = 0; i < size; i++) {
    if (cells[i]! < 1 || cells[i]! > n) return false
  }
  for (let y = 0; y < n; y++) {
    const seen = new Set<number>()
    for (let x = 0; x < n; x++) {
      const v = cells[y * n + x]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  for (let x = 0; x < n; x++) {
    const seen = new Set<number>()
    for (let y = 0; y < n; y++) {
      const v = cells[y * n + x]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  const count = edgeCount(n)
  for (let e = 0; e < count; e++) {
    const rel = relations[e] ?? 0
    const pair = edgeCells(e, n)
    if (!pair) continue
    const { a, b } = pair
    const consec = Math.abs(cells[a]! - cells[b]!) === 1
    if (consec !== (rel === 1)) return false
  }
  return true
}

export interface RuleSolveResult {
  ok: boolean
  solution: number[] | null
  contradiction: boolean
  saturated: boolean
  usedProbing: boolean
}

export function solveByRules(
  givens: ArrayLike<number>,
  relations: ArrayLike<number>,
  n: number,
  probing = true,
  maxRounds = 400,
): RuleSolveResult {
  const size = n * n
  const grid = initialGrid(givens, size)
  let usedProbing = false
  for (let round = 0; round < maxRounds; round++) {
    if (!propagate(grid, relations, n)) {
      return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
    }
    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === 0) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      const solution = Array.from(grid)
      const ok = isValidSolution(solution, relations, n)
      return { ok, solution: ok ? solution : null, contradiction: false, saturated: ok, usedProbing }
    }
    if (!probing) {
      return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
    }
    usedProbing = true
    const forced: Array<{ index: number; value: number }> = []
    for (let i = 0; i < size; i++) {
      if (grid[i] !== 0) continue
      const feasible: number[] = []
      for (let v = 1; v <= n; v++) {
        const trial = grid.slice()
        trial[i] = v
        if (propagate(trial, relations, n)) feasible.push(v)
      }
      if (feasible.length === 0) {
        return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
      }
      if (feasible.length === 1) forced.push({ index: i, value: feasible[0]! })
    }
    if (!forced.length) {
      return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
    }
    for (const { index, value } of forced) {
      if (grid[index] === 0) grid[index] = value
    }
    if (!propagate(grid, relations, n)) {
      return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
    }
  }
  return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
}
