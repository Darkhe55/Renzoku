# 连续 Renzoku

一个基于 Web 的连续（Renzoku）谜题游戏，原生 SVG 渲染，内置逻辑解题器。

## 在线体验

```bash
npm install
npm start
```

`npm start` 会等开发服务就绪后用默认浏览器打开 **http://127.0.0.1:5194/**。

> 也可以用 `npm run dev`，但不会自动打开浏览器。

## 游戏规则

- 在 n×n 格中填入 1..n，每行每列数字不重复
- 相邻两格之间若有黑点，则数字连续，相差 1
- 若没有黑点，则数字不能连续
- 题面预填数字不能修改

## 操作

| 操作 | 说明 |
|------|------|
| 左键点格 | 选中格子 |
| 数字键 1–9 / 0 或 Backspace | 填数 / 清除 |
| 右键点格 | 清除该格 |
| 方向键 | 移动选中格 |
| 滚轮 / 中键拖拽 | 缩放 / 平移画布 |
| Z / Shift+Z / Y | 撤销 / 重做 |
| C / H / S / Esc | 检查 / 提示一格 / 显示解 / 清空 |
| R / L / P / M | 随机抽题 / 逻辑解题 / 暂停回放 / 音效开关 |
| 0 / + / - | 视图复位 / 放大 / 缩小 |

## 数据存放

运行 `npm start` / `npm run dev` 时，题库、进度和上次题目保存在项目内 `data/` 目录；静态部署时自动降级到浏览器 localStorage。

## 功能

- **题库**：内置多道题，题目均校验唯一解
- **实时校验**：冲突与违规位置即时高亮，满足的条件同步变灰
- **逻辑解题**：规则引擎逐帧回放，显示每一步理由；回放中按钮变为停止，按 `P` 暂停/继续
- **提示一格 / 显示解**：提示优先揭示所有解一致的格子，显示解直接填入可行答案
- **撤销/重做**：按手势分组，一次拖拽只需一步撤销
- **进度保存**：自动保存当前题目进度，刷新不丢失
- **音效特效**：Web Audio 合成拨弦、水滴与落子动画，无外部音频资源
- **缩放/平移**：滚轮缩放，中键或 `Shift` 拖拽平移

## 技术栈

- Vite + TypeScript
- 原生 SVG（无框架）
- Web Audio 合成音效（无外部资源）
- localStorage / 项目内 `data/` 存储进度与题库

## 项目结构

```
src/
  main.ts
  core/
    app.ts / ui.ts / view.ts      界面、交互、缩放、回放控制
    store.ts / library.ts         题库、进度、上次题目存储
    audio.ts / fx.ts              音效与落子特效
  game/
    adapter.ts                    游戏规则接入
    rules.ts                      推理规则
    logic.ts                      逻辑解题回放
    render.ts / state.ts          SVG 渲染与盘面状态
    validate.ts / solver.ts       实时校验与回溯求解
    puzzles.ts / puzzles-data.ts  题库加载与静态题库
    imported-puzzles.ts           图片导入的题目（npm run gen 不会覆盖）
scripts/
  import-image.mjs                图片识图导入题库
```

## 从图片导入题库（识图）

`scripts/import-image.mjs` 用 Playwright + Edge 全自动识别连续题面图片（题干数字 + 边中点黑点），
默认**只预览**，加 `--append` 才写入 `src/game/imported-puzzles.ts`（该文件不会被 `npm run gen` 覆盖）。

```bash
npm run import-image -- board.png                 # 预览识别结果
npm run import-image -- board.png --verify        # 预览 + 唯一解校验 + 参考解
npm run import-image -- board.png --append        # 写入题库
npm run import-image -- board.png --append --verify --name "识图 · 六阶"
```

识别流程：先按页面底色裁出题板，再用「格子底色比格缝/格线亮」的亮度投影找出一列列/一行行格子
（自动判定 n×n，支持截图与印刷风格图片）→ 每格中心裁切 + 自适应二值化 + 多字体模板匹配读预填数字
（自动排除给定格的浅色圆环）→ 每条内部边中点做小窗口采样，按深色占比区分「黑点 / 格线」。

常用参数：

| 参数 | 说明 |
|------|------|
| `--size N` | 手动指定 n（自动判定失败时） |
| `--map "x,y=数字,..."` | 人工修正某格数字，坐标 0 基（列,行），`0` = 清空 |
| `--edge "x,y=h;..."` / `--no-edge` | 人工修正某条边的黑点：`h` = 左右相邻，`v` = 上下相邻 |
| `--ink-drop N` | 数字墨迹相对格子底色的亮度差阈值（默认 95） |
| `--crop "x,y,w,h"` | 只识别图片中的这块区域（截图带页面边框时用） |
| `--json out.json` | 导出识别结果（board / solution / 是否唯一） |
| `--verify` | 调项目 solver 检查唯一解并求参考解（超时只告警） |
| `--append` | 写入 `src/game/imported-puzzles.ts`（配合 `--dry` 可只演练不写） |
| `--dry` | 不写入 |

## 命令

```bash
npm run dev       # 开发服务
npm start         # 开发服务 + 自动打开浏览器
npm run build     # tsc --noEmit + vite build
npm run gen       # 重新生成题库
npm run check     # 审计题库
npm run verify    # 参考解、逻辑回放与交互验证
npm run audit     # 逐题审计逻辑解题
npm run import-image -- <图片> [--append] [--verify]  # 图片导入题库
```
