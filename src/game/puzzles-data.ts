/* 自动生成，勿手改。运行 npm run gen 重新生成。 */
export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */
  board: string
  /** 参考解编码串（没有则留空） */
  solution?: string
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "renzoku-4x4-jijfnl", name: "初识连续", width: 4, height: 4, difficulty: 'easy', series: "入门", board: "0000000000000003|001110110001001111000011", solution: "4132234132141423" },
  { id: "renzoku-5x5-jijfnm", name: "五阶连续", width: 5, height: 5, difficulty: 'easy', series: "入门", board: "0000000000000000000000002|0000100110110101100001101000100010001110", solution: "5241321534453211324534152" },
  { id: "renzoku-5x5-jijfnn", name: "相邻回廊", width: 5, height: 5, difficulty: 'medium', series: "进阶", board: "0004000000000000000000000|0010010100001110100100101110000110001001", solution: "5134235421241534321512534" },
  { id: "renzoku-6x6-jijfno", name: "六阶连续", width: 6, height: 6, difficulty: 'medium', series: "进阶", board: "060000000000000000000000000000000000|011011100101001010010110111001111111100001111111000000111111", solution: "365421456312512643621534143256234165" },
  { id: "renzoku-6x6-jijfnp", name: "连续之墙", width: 6, height: 6, difficulty: 'hard', series: "挑战", board: "000000000000000000000000000000020000|010001000000001000100110110110001100010010001100001010001100", solution: "632415451362263154514236145623326541" },
  { id: "renzoku-6x6-jijfnq", name: "连续终局", width: 6, height: 6, difficulty: 'hard', series: "挑战", board: "000000000000000600000000000000000000|010100001101000011000001011111100010000100111001000010000101", solution: "145236261543423615532164316452654321" },
]
