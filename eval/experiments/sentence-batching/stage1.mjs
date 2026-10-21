// 1단계 - 재현성. 같은 입력을 3번 보내 모델 자체의 흔들림을 잰다.
// 이 값이 묶음 효과와 비슷하면 2단계는 의미가 없다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { judge } from './jev.mjs'
const D = resolve(process.argv[2])
const arts = JSON.parse(readFileSync(resolve(D, 'sample.json'), 'utf8'))
const a = arts.find((x) => x.n >= 20) ?? arts[0]
console.log(`대상: [${a.section}] ${a.n}문장 — ${a.headline.slice(0, 40)}\n`)

const spread = (runs) => {           // 같은 자리 값들의 최대-최소
  const out = []
  for (let i = 0; i < runs[0].length; i++)
    for (const k of ['factual_assertion', 'named_basis']) {
      const v = runs.map((r) => r[i][k])
      out.push(Math.max(...v) - Math.min(...v))
    }
  return out
}
const stat = (xs) => { const s = [...xs].sort((p, q) => p - q); return { 평균: (xs.reduce((p, q) => p + q, 0) / xs.length).toFixed(3), 중앙: s[s.length >> 1].toFixed(3), '95%': s[Math.floor(s.length * .95)].toFixed(3), 최대: Math.max(...xs).toFixed(3) } }

const out = {}
for (const size of [1, 8]) {
  const runs = []
  for (let t = 0; t < 3; t++) runs.push((await judge(a.sents, size)).res)
  const d = spread(runs)
  out[size] = { spread: d, stat: stat(d) }
  const flips = d.filter((_, i) => { const k = ['factual_assertion', 'named_basis'][i % 2], idx = i >> 1
    const v = runs.map((r) => r[idx][k]); return v.some((x) => x >= .5) && v.some((x) => x < .5) }).length
  console.log(`묶음 ${String(size).padEnd(2)} 3회 반복 — 같은 자리 값의 흔들림`, stat(d), `· 예/아니오 갈린 자리 ${flips}개`)
}
writeFileSync(resolve(D, 'stage1.json'), JSON.stringify(out, null, 2), 'utf8')
