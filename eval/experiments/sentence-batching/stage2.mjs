// 2단계 - 묶음 크기 스윕. 1단계에서 모델이 흔들린다는 것을 알았으므로
// 모든 조건을 3회씩 돌려 "노이즈"와 "묶음이 만든 차이"를 가른다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { judge } from './jev.mjs'
const D = resolve(process.argv[2])
const arts = JSON.parse(readFileSync(resolve(D, 'sample.json'), 'utf8'))
const SIZES = [1, 4, 8, 12, 16]
const RUNS = 3
const KEYS = ['factual_assertion', 'named_basis']

const all = {}   // size -> [run][articleIdx][sentIdx][key]
let reqs = 0, toks = 0
for (const size of SIZES) {
  all[size] = []
  for (let r = 0; r < RUNS; r++) {
    const per = []
    for (const a of arts) { const o = await judge(a.sents, size); per.push(o.res); reqs += o.requests; toks += o.tokens }
    all[size].push(per)
    console.error(`  묶음 ${size} ${r + 1}/${RUNS} 끝 (누적 요청 ${reqs})`)
  }
}
writeFileSync(resolve(D, 'stage2.json'), JSON.stringify({ sizes: SIZES, runs: RUNS, reqs, toks, all }), 'utf8')
console.log(`끝. 요청 ${reqs}건, 입력토큰 ${toks}`)
