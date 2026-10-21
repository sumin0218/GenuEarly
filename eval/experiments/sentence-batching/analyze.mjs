// 미리 적어 둔 판정 기준으로만 읽는다. 숫자를 보고 기준을 바꾸지 않는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const D = resolve(process.argv[2])
const { sizes, runs, reqs, toks, all } = JSON.parse(readFileSync(resolve(D, 'stage2.json'), 'utf8'))
const arts = JSON.parse(readFileSync(resolve(D, 'sample.json'), 'utf8'))
const KEYS = ['factual_assertion', 'named_basis']

// 모든 (기사, 문장, 질문) 자리를 하나의 목록으로 편다
const slots = []
arts.forEach((a, ai) => a.sents.forEach((_, si) => KEYS.forEach((k) => slots.push([ai, si, k]))))
const vals = (size, r) => slots.map(([ai, si, k]) => all[size][r][ai][si][k])
const mean = (size) => slots.map((_, i) => { let t = 0; for (let r = 0; r < runs; r++) t += vals(size, r)[i]; return t / runs })
const noise = (size) => slots.map((_, i) => { const v = []; for (let r = 0; r < runs; r++) v.push(vals(size, r)[i]); return Math.max(...v) - Math.min(...v) })
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * p)] }

const base = mean(1)
const baseNoise = avg(noise(1))

console.log(`문장 ${slots.length / 2}개 · 판정 자리 ${slots.length}개 · 요청 ${reqs}건 · 입력토큰 ${toks.toLocaleString()}`)
console.log(`기준선 노이즈(묶음 1, 3회 폭 평균) = ${baseNoise.toFixed(3)}   → 허용선 ×3 = ${(baseNoise * 3).toFixed(3)}\n`)

console.log('묶음 | 요청수 | 자체노이즈 | 이동평균 | 이동95% | 뒤집힘 | 경계밖뒤집힘 | 판정')
console.log('-----|--------|-----------|---------|---------|--------|------------|-----')
for (const size of sizes) {
  const m = mean(size)
  const own = avg(noise(size))
  const shift = m.map((v, i) => Math.abs(v - base[i]))
  const flips = [], outside = []
  m.forEach((v, i) => {
    if ((v >= .5) === (base[i] >= .5)) return
    flips.push(i)
    if (base[i] < .4 || base[i] > .6) outside.push(i)   // 경계 밖에서 뒤집혔으면 실격
  })
  const nreq = arts.reduce((t, a) => t + Math.ceil(a.sents.length / size), 0)
  const ok = size === 1 ? '기준' :
    (flips.length / slots.length <= .01 && outside.length === 0 &&
     avg(shift) <= .08 && pct(shift, .95) <= .15 && avg(shift) <= baseNoise * 3) ? '통과' : '탈락'
  console.log(`${String(size).padStart(4)} |${String(nreq).padStart(7)} |${own.toFixed(3).padStart(10)} |${avg(shift).toFixed(3).padStart(8)} |${pct(shift, .95).toFixed(3).padStart(8)} |${String(flips.length).padStart(7)} |${String(outside.length).padStart(11)} | ${ok}`)
}

console.log('\n── 경계 밖에서 뒤집힌 자리 (있으면 그 크기는 실격) ──')
for (const size of sizes.filter((s) => s !== 1)) {
  const m = mean(size)
  const bad = []
  m.forEach((v, i) => { if ((v >= .5) !== (base[i] >= .5) && (base[i] < .4 || base[i] > .6)) bad.push([i, base[i], v]) })
  if (!bad.length) { console.log(`묶음 ${size}: 없음`); continue }
  console.log(`묶음 ${size}: ${bad.length}개`)
  for (const [i, b, v] of bad.slice(0, 4)) {
    const [ai, si, k] = slots[i]
    console.log(`   ${b.toFixed(2)} → ${v.toFixed(2)}  ${k}  [${arts[ai].section}] ${arts[ai].sents[si].slice(0, 60)}`)
  }
}
