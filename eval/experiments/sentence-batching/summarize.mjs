// 저장소에 올릴 결과를 만든다. 기사 본문과 문장 텍스트는 넣지 않는다 (eval/README.md 규칙).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { stats } from './stats.mjs'

const D = resolve(process.argv[2]), OUT = resolve(process.argv[3])
mkdirSync(OUT, { recursive: true })
const s = stats(D)
const s1 = JSON.parse(readFileSync(resolve(D, 'stage1.json'), 'utf8'))

writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({
  실행일: new Date().toISOString().slice(0, 10),
  모델: 'jev-1.13.0 (ChatKHU Gateway)',
  질문세트: JSON.parse(readFileSync(new URL('../../../packages/shared/judgment-items.json', import.meta.url), 'utf8')).version,
  표본: { 기사: s.arts.length, 문장: s.slots / 2, 판정자리: s.slots, 반복: s.runs },
  비용: { 요청: s.reqs, 입력토큰: s.toks },
  '1단계_재현성_기사1편': s1,
  '2단계_조건별_재현성_전체자리': s.noises,
  기준선노이즈: s.baseNoise,
  '2단계_base대비': s.vsBase,
  '2단계_name1대비': s.vsName1,
  이름효과판정: s.namingVerdict,
}, null, 2), 'utf8')

writeFileSync(resolve(OUT, 'sample.json'), JSON.stringify(
  s.arts.map((a, i) => ({ i, url: a.url, 분야: a.section, 길이대: a.band, 문장수: a.n })), null, 2), 'utf8')

const slots = []
s.arts.forEach((a, ai) => a.sents.forEach((_, si) => ['factual_assertion', 'named_basis'].forEach((k) => slots.push([ai, si, k]))))
writeFileSync(resolve(OUT, 'per-slot.json'), JSON.stringify(
  slots.map(([ai, si, k], i) => ({ 기사: ai, 문장: si, 질문: k,
    ...Object.fromEntries(s.conditions.map((c) => [c.key, +s.means[c.key][i].toFixed(4)])) }))), 'utf8')

console.log('결과 3개 파일 생성 (본문·문장 텍스트 없음)')
