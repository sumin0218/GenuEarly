// Jev 호출 공용부. 분당 120건 한도를 넘지 않게 창을 관리한다.
import { readFileSync } from 'node:fs'
// 어디서 돌려도 되게 이 파일 기준으로 읽는다.
const SCHEMA = JSON.parse(readFileSync(new URL('../../../packages/shared/judgment-items.json', import.meta.url), 'utf8'))
const UV = SCHEMA.items.find((i) => i.id === 'unverifiable_claim')
const COMMON = SCHEMA.common_instructions
const BASE = process.env.CHATKHU_API_BASE_URL, KEY = process.env.CHATKHU_API_KEY

// 분당 120건 중 여유를 둔다. 전후를 같은 시간에 재려고 두 프로세스를 함께 돌릴 때는
// JEV_RATE_PER_MIN 으로 나눠 준다 (예: 55 씩 둘, 합 110). 한도는 계정 하나에 걸린다
const LIMIT = Number(process.env.JEV_RATE_PER_MIN) || 95
const win = []
async function slot() {
  for (;;) {
    const now = Date.now()
    while (win.length && now - win[0] > 60_000) win.shift()
    if (win.length < LIMIT) { win.push(now); return }
    await new Promise((r) => setTimeout(r, 60_000 - (now - win[0]) + 250))
  }
}

export async function post(body, tries = 3) {
  for (let t = 0; t < tries; t++) {
    await slot()
    const r = await fetch(`${BASE}/decisions/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.status === 200) return r.json()
    const txt = await r.text()
    if (r.status === 429) { await new Promise((x) => setTimeout(x, (+(r.headers.get('retry-after') || 5) + 1) * 1000)); continue }
    throw new Error(`${r.status} ${txt.slice(0, 160)}`)
  }
  throw new Error('429 재시도 소진')
}

const q = (question, field) => ({
  ...question,
  instructions: question.instructions.replaceAll('`sentence` 필드', `\`${field}\` 필드`) + '\n' + COMMON,
})

/**
 * 문장들을 size 개씩 묶어 부른다.
 *
 * `naming` 이 필드 이름을 정한다. 이게 따로 있는 이유는 **묶음 효과와 이름 효과를 가르기 위해서다.**
 * 처음에는 size=1 일 때만 `sentence`, 아니면 `s1`…`sN` 을 썼는데, 그러면 기준선과 묶음 조건이
 * 두 가지(묶는 것, 이름) 모두 달라져 "옆 문장이 샌다" 는 결론을 분리할 수 없다.
 *
 * - `'sentence'` — `state.sentence`. 제품이 지금 쓰는 방식
 * - `'indexed'`  — `state.s1`…`sN`. size=1 과 함께 쓰면 **이름만 바꾼 통제 조건**이 된다
 *
 * 반환: [{factual_assertion, named_basis}, ...] 문장 순서대로
 */
export async function judge(sents, size, naming = size === 1 ? 'sentence' : 'indexed') {
  const res = new Array(sents.length)
  const jobs = []
  for (let off = 0; off < sents.length; off += size) {
    const chunk = sents.slice(off, off + size)
    const state = {}, questions = {}, map = {}
    chunk.forEach((t, k) => {
      const f = naming === 'sentence' ? 'sentence' : `s${k + 1}`
      state[f] = t
      for (const sub of UV.questions) { questions[`${f}_${sub.id}`] = q(sub.question, f); map[`${f}_${sub.id}`] = [off + k, sub.id] }
    })
    jobs.push(
      post({ model: SCHEMA.model, state, questions }).then((j) => {
        for (const [key, a] of Object.entries(j.answers)) {
          const [idx, id] = map[key]
          ;(res[idx] ??= {})[id] = a.noul
        }
        return j.usage.input_tokens
      }),
    )
  }
  const toks = await Promise.all(jobs)
  return { res, requests: jobs.length, tokens: toks.reduce((a, b) => a + b, 0) }
}
