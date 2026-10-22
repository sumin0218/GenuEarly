// 길이와 분야가 한쪽에 몰리지 않게 10건을 고른다. 씨앗 고정 - 다시 돌려도 같은 표본.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const D = resolve(process.argv[2])
const arts = JSON.parse(readFileSync(resolve(D, 'articles.json'), 'utf8'))
let seed = 20261021
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const shuffle = (a) => a.map((v) => [rnd(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1])

const BANDS = [
  { name: '짧음', test: (n) => n <= 10, want: 3 },
  { name: '보통', test: (n) => n >= 14 && n <= 23, want: 4 },
  { name: '긺',   test: (n) => n >= 28, want: 3 },
]
const taken = [], usedSection = {}
for (const b of BANDS) {
  // 같은 분야가 몰리지 않게 분야별 사용 횟수가 적은 것부터
  const pool = shuffle(arts.filter((a) => b.test(a.n) && !taken.includes(a)))
    .sort((x, y) => (usedSection[x.section] ?? 0) - (usedSection[y.section] ?? 0))
  for (const a of pool.slice(0, b.want)) { taken.push({ ...a, band: b.name }); usedSection[a.section] = (usedSection[a.section] ?? 0) + 1 }
}
writeFileSync(resolve(D, 'sample.json'), JSON.stringify(taken, null, 2), 'utf8')
console.log(`고른 기사 ${taken.length}건 · 문장 합계 ${taken.reduce((t, a) => t + a.n, 0)}개\n`)
for (const a of taken) console.log(`  ${a.band.padEnd(3)} ${String(a.n).padStart(2)}문장  [${a.section.padEnd(4)}] ${a.headline.slice(0, 38)}`)
