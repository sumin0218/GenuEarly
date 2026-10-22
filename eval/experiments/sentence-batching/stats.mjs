// stage2.json 을 읽어 판정에 쓰는 값을 만든다. analyze.mjs 와 summarize.mjs 가 같이 쓴다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const KEYS = ['factual_assertion', 'named_basis']
const avg = (xs) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4)
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(s.length * p)].toFixed(4) }

export function stats(dir) {
  const D = resolve(dir)
  const { conditions, runs, reqs, toks, all } = JSON.parse(readFileSync(resolve(D, 'stage2.json'), 'utf8'))
  const arts = JSON.parse(readFileSync(resolve(D, 'sample.json'), 'utf8'))

  const slots = []
  arts.forEach((a, ai) => a.sents.forEach((_, si) => KEYS.forEach((k) => slots.push([ai, si, k]))))
  const at = (key, r, i) => { const [ai, si, k] = slots[i]; return all[key][r][ai][si][k] }
  const mean = (key) => slots.map((_, i) => { let t = 0; for (let r = 0; r < runs; r++) t += at(key, r, i); return t / runs })

  /** 같은 조건을 여러 번 돌렸을 때 자리별 값의 폭. 전체 자리에 대해 센다. */
  function noise(key) {
    const spread = [], flips = []
    slots.forEach((_, i) => {
      const v = []
      for (let r = 0; r < runs; r++) v.push(at(key, r, i))
      spread.push(Math.max(...v) - Math.min(...v))
      if (v.some((x) => x >= 0.5) && v.some((x) => x < 0.5)) flips.push(i)
    })
    return { 평균: avg(spread), '95%': pct(spread, 0.95), 최대: +Math.max(...spread).toFixed(4), 갈린자리: flips.length, 자리수: slots.length }
  }

  const means = Object.fromEntries(conditions.map((c) => [c.key, mean(c.key)]))
  const noises = Object.fromEntries(conditions.map((c) => [c.key, noise(c.key)]))
  const baseNoise = noises.base.평균

  /** 두 조건을 비교한다. 판정 기준은 돌리기 전에 정한 것 그대로다. */
  function compare(fromKey, toKey, cond) {
    const a = means[fromKey], b = means[toKey]
    const shift = b.map((v, i) => Math.abs(v - a[i]))
    const flips = [], outside = []
    b.forEach((v, i) => {
      if ((v >= 0.5) === (a[i] >= 0.5)) return
      flips.push(i)
      if (a[i] < 0.4 || a[i] > 0.6) outside.push(i)   // 확신 구간에서 뒤집혔다 = 실격
    })
    const 이동평균 = avg(shift), 이동95 = pct(shift, 0.95)
    return {
      요청수: arts.reduce((t, x) => t + Math.ceil(x.sents.length / cond.size), 0),
      자체노이즈: noises[toKey].평균,
      이동평균, 이동95,
      뒤집힘: flips.length, 뒤집힘비율: +(flips.length / slots.length).toFixed(4), 경계밖뒤집힘: outside.length,
      판정: toKey === fromKey ? '기준'
        : (flips.length / slots.length <= 0.01 && outside.length === 0 &&
           이동평균 <= 0.08 && 이동95 <= 0.15 && 이동평균 <= baseNoise * 3) ? '통과' : '탈락',
    }
  }

  const vsBase = Object.fromEntries(conditions.map((c) => [c.key, compare('base', c.key, c)]))
  const vsName1 = Object.fromEntries(conditions.map((c) => [c.key, compare('name1', c.key, c)]))

  // 이름만 바꾼 조건이 기준선과 같은가. 이 답이 인과 주장의 범위를 정한다.
  const n = vsBase.name1
  const namingVerdict = n.판정 === '통과'
    ? '이름 효과는 기준 안이다. 묶음 조건의 차이를 "옆 문장이 샌다" 로 설명할 수 있다.'
    : '이름만 바꿔도 기준을 벗어난다. 묶음 조건의 차이를 묶음 탓으로만 돌릴 수 없다 — name1 대비 표를 근거로 쓴다.'

  return { conditions, runs, reqs, toks, slots: slots.length, means, noises, baseNoise, vsBase, vsName1, namingVerdict, arts }
}
