// 질문 문구를 바꾸는 PR 용 작은 세트를 고른다 (README 5절 "두 수준").
//
//   node subset.mjs <작업 디렉터리> [--max 30]      → <작업 디렉터리>/articles.small.json
//
// 전체 세트로 한 번 돌린 runs.jsonl 이 있어야 한다. 판정 자리가 나오는 기사를 먼저 담는다.
//   1. 가상 기사 전부 (신호가 겹쳐 있어 안심 쪽 공격을 판정할 자리가 많다)
//   2. 기준선에 🟡·🔴 항목이 있는 실제 기사 (안심 쪽 공격을 판정할 자리)
//   3. 남은 자리는 실제 기사를 id 순으로 채운다 (주의 쪽 공격과 보기 순서는 🟢 기사에서도 판정된다)
// 고른 뒤에는 그 작은 세트로 run.mjs 를 돌린다. 이전 답을 다시 쓰지 않도록 작업 디렉터리를 새로 잡는다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GROUPS, readAnswer, readSentence } from './lib.mjs'

const W = resolve(process.argv[2] ?? '')
const i = process.argv.indexOf('--max')
const MAX = i > 0 ? Number(process.argv[i + 1]) : 30
const articles = JSON.parse(readFileSync(resolve(W, 'articles.json'), 'utf8'))
const runs = new Map(readFileSync(resolve(W, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r]))

function room(r) {
  if (!r) return 0
  let n = 0
  for (const g of Object.keys(GROUPS)) {
    const b = r.res[`order:${g}:0`]
    if (!b?.answers) continue
    for (const id of GROUPS[g]) if ((readAnswer(id, b.answers[id]).risk ?? 0) > 0) n++
  }
  for (const [k, v] of Object.entries(r.res)) if (/^sent:\d+:base$/.test(k) && v.answers && readSentence(v.answers).risk === 1) n++
  return n
}

const ranked = articles
  .map((a) => ({ a, fictional: a.kind === 'fictional', room: room(runs.get(a.id)) }))
  .sort((x, y) => (y.fictional - x.fictional) || (y.room - x.room) || String(x.a.id).localeCompare(String(y.a.id)))
const picked = ranked.slice(0, MAX)
writeFileSync(resolve(W, 'articles.small.json'), JSON.stringify(picked.map((x) => x.a), null, 2), 'utf8')
console.log(`작은 세트 ${picked.length}건 — 가상 ${picked.filter((x) => x.fictional).length}, 🟡·🔴 항목이 있는 실제 ${picked.filter((x) => !x.fictional && x.room > 0).length}, 나머지 ${picked.filter((x) => !x.fictional && x.room === 0).length}`)
console.log(`예상 요청 ${picked.length * 40}건 (기사당 40건)`)
