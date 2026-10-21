// 저장소에 올릴 결과를 만든다. 기사 본문과 문장 텍스트는 넣지 않는다 (eval/README.md 규칙).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const D = resolve(process.argv[2]), OUT = resolve(process.argv[3])
mkdirSync(OUT, { recursive: true })
const { sizes, runs, reqs, toks, all } = JSON.parse(readFileSync(resolve(D, 'stage2.json'), 'utf8'))
const s1 = JSON.parse(readFileSync(resolve(D, 'stage1.json'), 'utf8'))
const arts = JSON.parse(readFileSync(resolve(D, 'sample.json'), 'utf8'))
const KEYS = ['factual_assertion', 'named_basis']

const slots = []
arts.forEach((a, ai) => a.sents.forEach((_, si) => KEYS.forEach((k) => slots.push([ai, si, k]))))
const at = (size, r, i) => { const [ai, si, k] = slots[i]; return all[size][r][ai][si][k] }
const mean = (size) => slots.map((_, i) => { let t = 0; for (let r = 0; r < runs; r++) t += at(size, r, i); return +(t / runs).toFixed(4) })
const noise = (size) => slots.map((_, i) => { const v = []; for (let r = 0; r < runs; r++) v.push(at(size, r, i)); return +(Math.max(...v) - Math.min(...v)).toFixed(4) })
const avg = (xs) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4)
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(s.length * p)].toFixed(4) }

const base = mean(1), baseNoise = avg(noise(1))
const verdicts = {}
for (const size of sizes) {
  const m = mean(size), shift = m.map((v, i) => Math.abs(v - base[i]))
  const flips = [], outside = []
  m.forEach((v, i) => { if ((v >= .5) === (base[i] >= .5)) return; flips.push(i); if (base[i] < .4 || base[i] > .6) outside.push(i) })
  verdicts[size] = {
    요청수: arts.reduce((t, a) => t + Math.ceil(a.sents.length / size), 0),
    자체노이즈: avg(noise(size)),
    이동평균: avg(shift), 이동95: pct(shift, .95),
    뒤집힘: flips.length, 뒤집힘비율: +(flips.length / slots.length).toFixed(4), 경계밖뒤집힘: outside.length,
    판정: size === 1 ? '기준'
      : (flips.length / slots.length <= .01 && outside.length === 0 && avg(shift) <= .08 && pct(shift, .95) <= .15 && avg(shift) <= baseNoise * 3) ? '통과' : '탈락',
  }
}

writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({
  실행일: '2026-10-21', 모델: 'jev-1.13.0 (ChatKHU Gateway)', 질문세트: '1.1.0',
  표본: { 기사: arts.length, 문장: slots.length / 2, 판정자리: slots.length },
  비용: { 요청: reqs, 입력토큰: toks },
  '1단계_재현성': { 묶음1: s1['1'].stat, 묶음8: s1['8'].stat },
  기준선노이즈: baseNoise,
  '2단계_판정': verdicts,
}, null, 2), 'utf8')

// 기사 목록 - URL 과 문장 수만. 제목도 본문의 일부이므로 넣지 않는다.
writeFileSync(resolve(OUT, 'sample.json'), JSON.stringify(
  arts.map((a, i) => ({ i, url: a.url, 분야: a.section, 길이대: a.band, 문장수: a.n })), null, 2), 'utf8')

// 자리별 원시값 - 문장 텍스트 없이 번호로만
writeFileSync(resolve(OUT, 'per-slot.json'), JSON.stringify(
  slots.map(([ai, si, k], i) => ({ 기사: ai, 문장: si, 질문: k,
    ...Object.fromEntries(sizes.map((s) => [`묶음${s}`, mean(s)[i]])) }))), 'utf8')
console.log('결과 3개 파일 생성 (본문·문장 텍스트 없음)')
