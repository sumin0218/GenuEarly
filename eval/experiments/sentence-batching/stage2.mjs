// 2단계 - 조건별 측정.
//
// 1단계에서 모델이 흔들린다는 것을 알았으므로 모든 조건을 RUNS 회씩 돌려
// "노이즈" 와 "조건이 만든 차이" 를 가른다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { judge } from './jev.mjs'
import { CONDITIONS, RUNS } from './conditions.mjs'

const D = resolve(process.argv[2])
const arts = JSON.parse(readFileSync(resolve(D, 'sample.json'), 'utf8'))

const all = {}   // key -> [run][articleIdx][sentIdx][questionId]
let reqs = 0, toks = 0
for (const c of CONDITIONS) {
  all[c.key] = []
  for (let r = 0; r < RUNS; r++) {
    const per = []
    for (const a of arts) {
      const o = await judge(a.sents, c.size, c.naming)
      per.push(o.res); reqs += o.requests; toks += o.tokens
    }
    all[c.key].push(per)
    console.error(`  ${c.key} ${r + 1}/${RUNS} 끝 (누적 요청 ${reqs})`)
  }
}
writeFileSync(resolve(D, 'stage2.json'),
  JSON.stringify({ conditions: CONDITIONS, runs: RUNS, reqs, toks, all }), 'utf8')
console.log(`끝. 요청 ${reqs}건, 입력토큰 ${toks}`)
