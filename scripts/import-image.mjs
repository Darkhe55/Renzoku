/**
 * 连续（Renzoku）题面图片导入（全自动识图版）
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--size N] [--name 名称] [--series 识图]
 *                                  [--append] [--verify] [--json out.json]
 *                                  [--map "x,y=数字,..."] [--edge "x,y=h|v;..."] [--no-edge ...]
 *                                  [--ink-drop N] [--crop "x,y,w,h"] [--dry]
 *
 * 流程：
 *   1. Playwright + Edge 打开图片到 canvas，取灰度像素；
 *   2. 用「格子底色比背景/格线亮」这一特征做行/列投影，找等距边界序列自动判定 n×n；
 *   3. 每格中心裁切 + 自适应二值化 + 多字体模板匹配识别预填数字（可区分给定格的圆环）；
 *   4. 逐个内部边中点采样黑点（深色圆点）得到「连续/不连续」关系；
 *   5. 预览识别结果；--verify 调项目 solver 检查唯一解并给出参考解（超时只告警）；
 *   6. --append 写入 src/game/imported-puzzles.ts（不会被 npm run gen 覆盖）。
 *
 * --map：人工修正某格数字，坐标 0 基（列,行），0 = 清空，例如 --map "2,3=5,0,0=0"。
 * --edge / --no-edge：人工修正某条边的黑点，h = 同一行左右相邻，v = 同一列上下相邻，
 *                     例如 --edge "2,3=h;4,1=v" 表示这些边「有黑点」。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { countSolutions, solvePuzzle } from '../src/game/solver.ts'
import {
  edgeCount,
  encodeBoard,
  encodeCells,
  horizontalEdgeCount,
  horizontalEdgeIndex,
  verticalEdgeIndex,
} from '../src/game/types.ts'

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function edgePath() {
  for (const c of EDGE_CANDIDATES) {
    if (c && existsSync(c)) return c
  }
  throw new Error('找不到 Edge 可执行文件，请用 EDGE_PATH 指定')
}

const args = process.argv.slice(2)
function has(flag) {
  return args.includes(flag)
}
function arg(flag, fallback = '') {
  const i = args.indexOf(flag)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const VALUE_FLAGS = [
  '--size',
  '--name',
  '--series',
  '--json',
  '--map',
  '--edge',
  '--no-edge',
  '--ink-drop',
  '--crop',
  '--timeout',
]
const imageArg = args.find((a, i) => {
  if (a.startsWith('--')) return false
  const prev = args[i - 1]
  return !(prev && VALUE_FLAGS.includes(prev))
})
if (!imageArg) {
  console.error(
    '用法：node scripts/import-image.mjs <图片路径> [--size N] [--name 名称] [--series 识图] [--append] [--verify] [--json out.json] [--map "x,y=数字,..."] [--edge "x,y=h|v"] [--no-edge ...] [--ink-drop N] [--crop "x,y,w,h"] [--dry] [--timeout 秒]',
  )
  process.exit(1)
}
const IMAGE = path.resolve(imageArg)
if (!existsSync(IMAGE)) {
  console.error('找不到图片:', IMAGE)
  process.exit(1)
}

const sizeOpt = Number(arg('--size', '0')) || 0
const nameOpt = arg('--name')
const series = arg('--series', '识图')
const jsonOut = arg('--json')
const inkDrop = Number(arg('--ink-drop', '95')) || 95
const timeoutSec = Number(arg('--timeout', '0')) || 0
const append = has('--append')
const verify = has('--verify')
const dry = has('--dry')
const cropArg = arg('--crop')
let crop = null
if (cropArg) {
  const v = cropArg.split(/[,xX]/).map((s) => Number(s.trim()))
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n) || n < 0)) {
    console.error(`--crop 格式错误：${cropArg}（应为 "x,y,w,h"）`)
    process.exit(1)
  }
  crop = v
}

// --map "x,y=数字,..."
const manualCells = new Map()
const mapArg = arg('--map')
if (mapArg) {
  const re = /(\d+)\s*,\s*(\d+)\s*=\s*(\d+)/g
  let matched = 0
  let m
  while ((m = re.exec(mapArg)) !== null) {
    manualCells.set(Number(m[2]) * 10000 + Number(m[1]), Number(m[3]))
    matched++
  }
  const residue = mapArg.replace(re, '').replace(/[\s,;]+/g, '')
  if (!matched || residue) {
    console.error(`--map 格式错误：${mapArg}（应为 x,y=数字）`)
    process.exit(1)
  }
}
// --edge "x,y=h|v;..." 与 --no-edge 同理
function parseEdgeSpec(spec) {
  const out = []
  if (!spec) return out
  for (const part of spec.split(/[;\s]+/).filter(Boolean)) {
    const m = /^(\d+)\s*,\s*(\d+)\s*=\s*([hv])$/.exec(part)
    if (!m) {
      console.error(`--edge/--no-edge 格式错误：${part}（应为 x,y=h 或 x,y=v）`)
      process.exit(1)
    }
    out.push({ x: Number(m[1]), y: Number(m[2]), dir: m[3] })
  }
  return out
}
const manualEdges1 = parseEdgeSpec(arg('--edge'))
const manualEdges0 = parseEdgeSpec(arg('--no-edge'))

// ───────────────────────── 浏览器端识图 ─────────────────────────
const dataUrl = `data:image/png;base64,${readFileSync(IMAGE).toString('base64')}`
const browser = await chromium.launch({ headless: true, executablePath: edgePath() })
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

const analysis = await page.evaluate(
  async ({ dataUrl, sizeOpt, inkDrop, crop }) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const W = img.naturalWidth
    const H = img.naturalHeight
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, W, H).data
    const grayAt = (x, y) => {
      const i = (y * W + x) * 4
      return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    }

    // 1) 页面底色（四角中位数）与题板包围盒
    const cornerVals = []
    for (const [cx, cy] of [
      [5, 5],
      [W - 6, 5],
      [5, H - 6],
      [W - 6, H - 6],
    ]) {
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = Math.max(0, Math.min(W - 1, cx + dx))
          const y = Math.max(0, Math.min(H - 1, cy + dy))
          cornerVals.push(grayAt(x, y))
        }
    }
    cornerVals.sort((a, b) => a - b)
    const pageBg = cornerVals[Math.floor(cornerVals.length / 2)]
    let bx0 = crop ? crop[0] : W
    let by0 = crop ? crop[1] : H
    let bx1 = crop ? crop[0] + crop[2] - 1 : -1
    let by1 = crop ? crop[1] + crop[3] - 1 : -1
    if (!crop) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (Math.abs(grayAt(x, y) - pageBg) <= 8) continue
          if (x < bx0) bx0 = x
          if (x > bx1) bx1 = x
          if (y < by0) by0 = y
          if (y > by1) by1 = y
        }
      }
    }
    if (bx1 < bx0 || by1 < by0) throw new Error('图片里没有找到题板')
    const bw = bx1 - bx0 + 1
    const bh = by1 - by0 + 1

    // 2) 格子底色众数 + 亮像素投影
    const hist = new Int32Array(256)
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) hist[Math.round(grayAt(x, y)) | 0]++
    }
    let mode = 0
    let modeCount = -1
    for (let v = 0; v < 256; v++) {
      if (hist[v] > modeCount) {
        modeCount = hist[v]
        mode = v
      }
    }
    const isBright = new Uint8Array(bw * bh)
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        isBright[y * bw + x] = grayAt(bx0 + x, by0 + y) >= mode - 8 ? 1 : 0
      }
    }
    const colCount = new Int32Array(bw)
    const rowCount = new Int32Array(bh)
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (!isBright[y * bw + x]) continue
        colCount[x]++
        rowCount[y]++
      }
    }
    const medianOf = (arr) => {
      const s = Array.from(arr).sort((a, b) => a - b)
      return s[Math.floor(s.length / 2)]
    }
    /** 连续棋盘：格子是亮色圆角块、格间是深色缝隙（或格线），用「亮块游程」定位每个格子。
     *  亮度投影里的连续高值段 = 一列/一行格子，两条亮块之间的中点 = 格缝中心（黑点也画在这里）。 */
    const axisOf = (profile) => {
      const med = medianOf(profile)
      let maxp = 0
      for (const v of profile) if (v > maxp) maxp = v
      const thr = Math.max(3, Math.min(med * 0.35, maxp * 0.5))
      const runs = []
      let start = -1
      for (let i = 0; i < profile.length; i++) {
        const on = profile[i] > thr
        if (on && start < 0) start = i
        if (!on && start >= 0) {
          runs.push({ start, end: i - 1 })
          start = -1
        }
      }
      if (start >= 0) runs.push({ start, end: profile.length - 1 })
      if (runs.length < 2) throw new Error('没有检测到足够的格子')
      const widths = runs.map((r) => r.end - r.start + 1)
      const medW = medianOf(widths)
      const kept = runs.filter((r) => r.end - r.start + 1 >= medW * 0.35)
      if (kept.length < 2) throw new Error('没有检测到足够的格子')
      const gaps = []
      for (let k = 0; k + 1 < kept.length; k++) gaps.push(kept[k + 1].start - kept[k].end - 1)
      const gap = gaps.length ? medianOf(gaps) : Math.max(1, Math.round(medW * 0.04))
      const half = Math.max(0.5, gap / 2)
      const lines = [kept[0].start - half]
      for (let k = 0; k + 1 < kept.length; k++) {
        lines.push((kept[k].end + kept[k + 1].start + 1) / 2)
      }
      lines.push(kept[kept.length - 1].end + 1 + half)
      const step = (lines[lines.length - 1] - lines[0]) / (lines.length - 1)
      return { lines, step, count: kept.length, candidates: runs.length }
    }
    const xAxis = axisOf(colCount)
    const yAxis = axisOf(rowCount)
    // 投影坐标是「题板包围盒内」的局部坐标，转成图片绝对坐标
    let xs = xAxis.lines.map((v) => v + bx0)
    let ys = yAxis.lines.map((v) => v + by0)
    let n = xs.length - 1
    let rows = ys.length - 1
    if (sizeOpt >= 2 && (n !== sizeOpt || rows !== sizeOpt)) {
      throw new Error(`网格不匹配：识别到 ${n}×${rows}，--size ${sizeOpt}`)
    }
    if (rows !== n) throw new Error(`非正方形网格 ${n}×${rows}，本项目只支持 n×n`)
    if (n < 2) throw new Error(`识别到的网格太小：${n}×${n}`)
    const cell = (xs[n] - xs[0]) / n

    // 3) 数字模板（多字体多字重，归一化 24×24）
    const NS = 24
    const SRC = 40
    const DIGITS = '123456789'.slice(0, n)
    const normBit = (raw, T) => {
      let x0 = SRC
      let y0 = SRC
      let x1 = -1
      let y1 = -1
      let ink = 0
      const m = new Uint8Array(SRC * SRC)
      for (let j = 0; j < SRC; j++) {
        for (let i = 0; i < SRC; i++) {
          if (raw[j * SRC + i] >= T) continue
          m[j * SRC + i] = 1
          ink++
          if (i < x0) x0 = i
          if (i > x1) x1 = i
          if (j < y0) y0 = j
          if (j > y1) y1 = j
        }
      }
      if (!ink) return null
      const bwid = x1 - x0 + 1
      const bhei = y1 - y0 + 1
      const out = new Uint8Array(NS * NS)
      for (let j = 0; j < NS; j++) {
        for (let i = 0; i < NS; i++) {
          out[j * NS + i] = m[(y0 + Math.floor((bhei * j) / NS)) * SRC + (x0 + Math.floor((bwid * i) / NS))] ? 1 : 0
        }
      }
      return { m: out, ink, bw: bwid, bh: bhei }
    }
    const holesOf = (m) => {
      const seen = new Uint8Array(NS * NS)
      let holes = 0
      for (let j = 0; j < NS; j++) {
        for (let i = 0; i < NS; i++) {
          if (m[j * NS + i] || seen[j * NS + i]) continue
          let touches = false
          const st = [[i, j]]
          seen[j * NS + i] = 1
          while (st.length) {
            const [x, y] = st.pop()
            if (x === 0 || y === 0 || x === NS - 1 || y === NS - 1) touches = true
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx
              const ny = y + dy
              if (nx < 0 || ny < 0 || nx >= NS || ny >= NS) continue
              if (seen[ny * NS + nx] || m[ny * NS + nx]) continue
              seen[ny * NS + nx] = 1
              st.push([nx, ny])
            }
          }
          if (!touches) holes++
        }
      }
      return holes
    }
    const tc = document.createElement('canvas')
    tc.width = 120
    tc.height = 120
    const tg = tc.getContext('2d', { willReadFrequently: true })
    const FONTS = [
      '700 84px Arial',
      '400 84px Arial',
      '700 84px "Segoe UI"',
      '400 84px "Segoe UI"',
      '700 84px Verdana',
      '700 84px Tahoma',
      '700 84px Consolas',
      '400 84px Consolas',
      '600 84px "Cascadia Code"',
      '400 84px "Cascadia Code"',
      '400 84px "Microsoft YaHei"',
      '700 84px "Microsoft YaHei"',
      '700 84px "Trebuchet MS"',
    ]
    const templates = {}
    for (const ch of DIGITS) templates[ch] = []
    for (const font of FONTS) {
      for (const ch of DIGITS) {
        tg.fillStyle = '#fff'
        tg.fillRect(0, 0, 120, 120)
        tg.fillStyle = '#000'
        tg.font = font
        tg.textAlign = 'center'
        tg.textBaseline = 'middle'
        tg.fillText(ch, 60, 60)
        const data = tg.getImageData(0, 0, 120, 120).data
        const raw = new Float32Array(SRC * SRC)
        for (let j = 0; j < SRC; j++) {
          for (let i = 0; i < SRC; i++) {
            const sx = Math.floor((i * 120) / SRC)
            const sy = Math.floor((j * 120) / SRC)
            raw[j * SRC + i] = data[(sy * 120 + sx) * 4]
          }
        }
        const gl = normBit(raw, 128)
        if (gl) templates[ch].push({ m: gl.m, holes: holesOf(gl.m) })
      }
    }
    const simShift = (a, b) => {
      let best = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          let inter = 0
          let union = 0
          for (let j = 0; j < NS; j++) {
            const bj = j + dy
            for (let i = 0; i < NS; i++) {
              const av = a[j * NS + i]
              const bi = i + dx
              const bv = bj >= 0 && bj < NS && bi >= 0 && bi < NS ? b[bj * NS + bi] : 0
              if (av && bv) inter++
              if (av || bv) union++
            }
          }
          const s = union ? inter / union : 0
          if (s > best) best = s
        }
      }
      return best
    }
    const patchMedian = (cx, cy, half) => {
      const vals = []
      for (let dy = -half; dy <= half; dy++)
        for (let dx = -half; dx <= half; dx++)
          vals.push(grayAt(Math.max(0, Math.min(W - 1, Math.round(cx + dx))), Math.max(0, Math.min(H - 1, Math.round(cy + dy)))))
      vals.sort((a, b) => a - b)
      return vals[Math.floor(vals.length / 2)]
    }

    // 4) 每格数字 + 中间黑点
    const cells = []
    const warnings = []
    const inset = cell * 0.2
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x0 = xs[c] + inset
        const x1 = xs[c + 1] - inset
        const y0 = ys[r] + inset
        const y1 = ys[r + 1] - inset
        // 四角底色（给定格的圆环/数字在格心，四角干净）
        const cornerHalf = Math.max(1, Math.round(cell * 0.05))
        const cpad = 0.2
        const corners = [
          patchMedian(x0 + (x1 - x0) * cpad, y0 + (y1 - y0) * cpad, cornerHalf),
          patchMedian(x1 - (x1 - x0) * cpad, y0 + (y1 - y0) * cpad, cornerHalf),
          patchMedian(x0 + (x1 - x0) * cpad, y1 - (y1 - y0) * cpad, cornerHalf),
          patchMedian(x1 - (x1 - x0) * cpad, y1 - (y1 - y0) * cpad, cornerHalf),
        ]
        corners.sort((a, b) => a - b)
        const bg = corners[Math.floor(corners.length / 2)]
        // 中心 62% 裁切：连续给定格的圆环（浅色描边）用阈值排除
        const mx = x0 + (x1 - x0) * 0.19
        const my = y0 + (y1 - y0) * 0.19
        const mw = (x1 - x0) * 0.62
        const mh = (y1 - y0) * 0.62
        const raw = new Float32Array(SRC * SRC)
        for (let j = 0; j < SRC; j++) {
          for (let i = 0; i < SRC; i++) {
            raw[j * SRC + i] = grayAt(
              Math.max(0, Math.min(W - 1, Math.round(mx + (mw * i) / (SRC - 1)))),
              Math.max(0, Math.min(H - 1, Math.round(my + (mh * j) / (SRC - 1)))),
            )
          }
        }
        let gl = normBit(raw, bg - inkDrop)
        if (!gl || gl.ink < 8) gl = normBit(raw, bg - Math.max(30, inkDrop * 0.6))
        let value = 0
        let score = 0
        let margin = 0
        if (gl && gl.ink >= 8 && gl.bw <= SRC * 0.95 && gl.bh <= SRC * 0.95 && gl.ink <= SRC * SRC * 0.65) {
          const holes = holesOf(gl.m)
          const ranked = []
          for (const d of DIGITS) {
            let best = 0
            for (const t of templates[d]) {
              let s = simShift(gl.m, t.m)
              if (t.holes === holes) s += 0.1
              else if (Math.abs(t.holes - holes) >= 2) s -= 0.12
              if (s > best) best = s
            }
            ranked.push({ d, score: Number(best.toFixed(4)) })
          }
          ranked.sort((a, b) => b.score - a.score)
          value = Number(ranked[0].d)
          score = ranked[0].score
          margin = ranked[0].score - (ranked[1]?.score ?? 0)
          if (score < 0.45) warnings.push(`格 (${c},${r}) 数字置信度低：${value} ${score.toFixed(2)}（可 --map 修正）`)
        }
        cells.push({ c, r, value, score, margin, bg, ink: gl ? gl.ink : 0, bw: gl ? gl.bw : 0, bh: gl ? gl.bh : 0 })
      }
    }
    const valueAt = (c, r) => cells[r * n + c].value
    // 黑点：内部边中点。用「中心小方块里的深色占比」区分黑点与穿过该点的格线：
    // 黑点直径约 0.18 格，中心 0.14 格小方块几乎被填满；格线只占一条窄带。
    const dotAt = (cx, cy) => {
      const half = Math.max(2, Math.round(cell * 0.07))
      let dark = 0
      let total = 0
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const x = Math.round(cx + dx)
          const y = Math.round(cy + dy)
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          total++
          if (grayAt(x, y) < pageBg - 100) dark++
        }
      }
      return total ? dark / total : 0
    }
    const relH = new Array(n * (n - 1)).fill(0) // 水平边：y*(n-1)+x
    const relV = new Array((n - 1) * n).fill(0) // 垂直边：y*n+x
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n - 1; c++) {
        const cx = xs[c + 1]
        const cy = (ys[r] + ys[r + 1]) / 2
        const ratio = dotAt(cx, cy)
        relH[r * (n - 1) + c] = ratio >= 0.5 ? 1 : 0
        if (ratio > 0.2 && ratio < 0.5) warnings.push(`黑点置信度低：水平 (${c},${r}) 占比 ${ratio.toFixed(3)}`)
      }
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n; c++) {
        const cx = (xs[c] + xs[c + 1]) / 2
        const cy = ys[r + 1]
        const ratio = dotAt(cx, cy)
        relV[r * n + c] = ratio >= 0.5 ? 1 : 0
        if (ratio > 0.2 && ratio < 0.5) warnings.push(`黑点置信度低：垂直 (${c},${r}) 占比 ${ratio.toFixed(3)}`)
      }
    }
    return {
      imageW: W,
      imageH: H,
      board: { x: bx0, y: by0, w: bw, h: bh },
      n,
      cell: Number(cell.toFixed(2)),
      mode,
      xs: xs.map((v) => Number(v.toFixed(1))),
      ys: ys.map((v) => Number(v.toFixed(1))),
      cells,
      relH,
      relV,
      warnings,
    }
  },
  { dataUrl, sizeOpt, inkDrop, crop },
)

await browser.close()

const n = analysis.n
const width = n
const height = n

// ───────────────────────── 组装 givens / relations ─────────────────────────
const givens = new Array(n * n).fill(0)
for (const c of analysis.cells) givens[c.r * n + c.c] = c.value
const relations = new Array(edgeCount(n)).fill(0)
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n - 1; x++) {
    relations[horizontalEdgeIndex(n, x, y)] = analysis.relH[y * (n - 1) + x]
  }
}
for (let y = 0; y < n - 1; y++) {
  for (let x = 0; x < n; x++) {
    relations[verticalEdgeIndex(n, x, y)] = analysis.relV[y * n + x]
  }
}
// 人工修正
for (const [key, value] of manualCells) {
  const x = key % 10000
  const y = Math.floor(key / 10000)
  if (x >= n || y >= n) {
    console.error(`--map 坐标越界：${x},${y}（网格 ${n}×${n}）`)
    process.exit(1)
  }
  givens[y * n + x] = value
  console.log(`[import] 人工修正格 (${x},${y}) = ${value}`)
}
for (const e of manualEdges1) {
  const idx = e.dir === 'h' ? horizontalEdgeIndex(n, e.x, e.y) : verticalEdgeIndex(n, e.x, e.y)
  relations[idx] = 1
  console.log(`[import] 人工修正边 ${e.dir} (${e.x},${e.y}) = 有黑点`)
}
for (const e of manualEdges0) {
  const idx = e.dir === 'h' ? horizontalEdgeIndex(n, e.x, e.y) : verticalEdgeIndex(n, e.x, e.y)
  relations[idx] = 0
  console.log(`[import] 人工修正边 ${e.dir} (${e.x},${e.y}) = 无黑点`)
}

const givenCount = givens.filter((v) => v !== 0).length
const dotCount = relations.filter((v) => v === 1).length
if (has('--debug')) {
  console.log('[import] 每格诊断（c,r / 底色 / 墨迹 / 归一化宽高 / 识别 / 分数）：')
  for (const c of analysis.cells) {
    if (!c.ink && !c.value) continue
    console.log(
      `  (${c.c},${c.r}) bg=${c.bg} ink=${c.ink} bw=${c.bw} bh=${c.bh} -> ${c.value || '.'} ${c.score} margin=${c.margin}`,
    )
  }
}
console.log(
  `[import] ${path.basename(IMAGE)}：${analysis.imageW}×${analysis.imageH}px，题板 ${analysis.board.w}×${analysis.board.h}，` +
    `识别网格 ${n}×${n}，格距 ${analysis.cell}px，底色 ${analysis.mode}`,
)
console.log(`[import] 预填 ${givenCount}/${n * n} 格，黑点 ${dotCount}/${edgeCount(n)} 条边`)
// 预览：数字 + 黑点（═ 表示水平黑点，║ 表示垂直黑点）
const hHas = (x, y) => relations[horizontalEdgeIndex(n, x, y)] === 1
const vHas = (x, y) => relations[verticalEdgeIndex(n, x, y)] === 1
let head = '     '
for (let x = 0; x < n; x++) head += String(x).padStart(2) + (x + 1 < n ? (hHas(x, 0) ? '=' : ' ') : '')
console.log('[import] 识别结果（= / | 表示黑点）：')
for (let y = 0; y < n; y++) {
  let line = String(y).padStart(2) + '   '
  for (let x = 0; x < n; x++) {
    const v = givens[y * n + x]
    line += (v === 0 ? '·' : String(v)).padStart(2)
    if (x + 1 < n) line += hHas(x, y) ? '=' : ' '
  }
  console.log(line)
  if (y + 1 < n) {
    let dline = '     '
    for (let x = 0; x < n; x++) {
      dline += vHas(x, y) ? '| ' : '  '
      if (x + 1 < n) dline += ' '
    }
    console.log(dline)
  }
}
if (analysis.warnings.length) {
  console.log(`[import] 注意 ${analysis.warnings.length} 条：`)
  for (const w of analysis.warnings.slice(0, 25)) console.log('  - ' + w)
  if (analysis.warnings.length > 25) console.log(`  … 其余 ${analysis.warnings.length - 25} 条略`)
}

// ───────────────────────── 校验 / 求解 ─────────────────────────
const puzzle = {
  id: 'import-temp',
  name: nameOpt || `识图 · ${n}×${n}`,
  width: n,
  height: n,
  difficulty: 'custom',
  givens,
  relations,
}
let solution = null
let unique = null
if (verify || append) {
  const t0 = Date.now()
  const counted = countSolutions(givens, relations, n, 2, 1_200_000)
  if (counted.timedOut) {
    console.warn(`[import] 唯一性检查超时（${counted.nodes} 节点 / ${Date.now() - t0}ms），仅告警`)
  } else if (counted.count !== 1) {
    console.warn(`[import] 解不唯一：找到 ${counted.count} 个（可能是识别错误，可用 --map / --edge 修正）`)
  } else {
    unique = true
    const solved = solvePuzzle(puzzle, 1_500_000)
    if (solved.solution) {
      solution = solved.solution.cells.slice()
      console.log(`[import] 项目 solver 校验：唯一解 ✓（${Date.now() - t0}ms，${counted.nodes} 节点）`)
      for (let y = 0; y < n; y++) {
        console.log('  ' + solution.slice(y * n, y * n + n).join(' '))
      }
    } else {
      console.warn('[import] 唯一解存在但 solver 没求出解（超时），参考解留空')
    }
  }
  if (timeoutSec && counted.nodes > 0 && Date.now() - t0 > timeoutSec * 1000) {
    console.warn(`[import] 校验耗时超过 --timeout ${timeoutSec}s（仅告警）`)
  }
} else {
  console.log('[import] 未加 --verify：跳过唯一性校验。')
}

// ───────────────────────── 导出 / 写入 ─────────────────────────
const id = `renzoku-import-${Date.now().toString(36)}`
const name = nameOpt || `识图 · ${n}×${n}`
const board = encodeBoard(givens, relations)
const solutionText = solution ? encodeCells(solution) : ''
if (jsonOut) {
  const file = path.resolve(jsonOut)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    JSON.stringify(
      {
        width: n,
        height: n,
        givenCount,
        dotCount,
        board,
        solution: solutionText || null,
        unique,
        source: path.basename(IMAGE),
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`[import] 已导出 JSON：${file}`)
}

if (append) {
  if (dry) {
    console.log('[import] --dry：跳过写入')
  } else if (unique === false) {
    console.warn('[import] 未确认唯一解，仍按题面写入（参考解留空），建议先修正识别结果')
  } else {
    const entry =
      `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${n}, height: ${n}, ` +
      `difficulty: 'custom', series: ${JSON.stringify(series)}, board: ${JSON.stringify(board)}, solution: ${JSON.stringify(solutionText)} },\n`
    const dataFile = path.resolve('src/game/imported-puzzles.ts')
    if (!existsSync(dataFile)) {
      writeFileSync(
        dataFile,
        `import type { RawPuzzle } from './puzzles-data'\n\nexport const IMPORTED_PUZZLES: RawPuzzle[] = [\n${entry}]\n`,
      )
    } else {
      let text = readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n')
      if (/=\s*\[\s*\]/.test(text)) {
        text = text.replace(/=\s*\[\s*\]/, () => '= [\n' + entry + ']')
      } else {
        const marker = text.lastIndexOf('\n]')
        if (marker < 0) throw new Error('imported-puzzles.ts 格式异常：找不到结尾 ]')
        text = text.slice(0, marker + 1) + entry + text.slice(marker + 1)
      }
      writeFileSync(dataFile, text)
    }
    console.log(`[import] 已写入 ${dataFile}：${id} ${name}`)
    console.log('[import] 提示：导入题写在 imported-puzzles.ts，不会被 npm run gen 覆盖。')
  }
} else {
  console.log('[import] 预览模式（未写入）。加 --append 写入 src/game/imported-puzzles.ts。')
}
