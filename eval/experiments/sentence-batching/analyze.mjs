// 미리 적어 둔 판정 기준으로만 읽는다. 숫자를 보고 기준을 바꾸지 않는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stats } from './stats.mjs'

const D = resolve(process.argv[2])
const s = stats(D)

console.log(`문장 ${s.slots / 2}개 · 판정 자리 ${s.slots}개 · 요청 ${s.reqs}건 · 입력토큰 ${s.toks.toLocaleString()}`)
console.log(`기준선 노이즈(base, ${RUNSLABEL(s)}회 폭 평균) = ${s.baseNoise.toFixed(3)}  → 허용선 ×3 = ${(s.baseNoise * 3).toFixed(3)}\n`)
function RUNSLABEL(x) { return x.runs }

const row = (label, v) =>
  `${label.padEnd(34)}|${String(v.요청수).padStart(6)} |${v.자체노이즈.toFixed(3).padStart(9)} |${v.이동평균.toFixed(3).padStart(8)} |${v.이동95.toFixed(3).padStart(8)} |${String(v.뒤집힘).padStart(6)} |${String(v.경계밖뒤집힘).padStart(10)} | ${v.판정}`

console.log('── base 대비 (묶음 + 이름이 함께 바뀐 것) ──')
console.log('조건                              | 요청수 | 자체노이즈| 이동평균| 이동95% | 뒤집힘| 경계밖   | 판정')
for (const c of s.conditions) console.log(row(c.label, s.vsBase[c.key]))

console.log('\n── name1 대비 (이름을 고정한 채 묶음 효과만) ──')
for (const c of s.conditions.filter((c) => c.key.startsWith('b')))
  console.log(row(c.label, s.vsName1[c.key]))

console.log(`\n이름 효과만 (base → name1): 이동평균 ${s.vsBase.name1.이동평균.toFixed(3)} · 뒤집힘 ${s.vsBase.name1.뒤집힘} · 경계밖 ${s.vsBase.name1.경계밖뒤집힘}`)
console.log(`  → ${s.namingVerdict}`)
