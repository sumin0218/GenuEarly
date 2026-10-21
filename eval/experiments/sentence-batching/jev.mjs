// Jev 호출 공용부. 분당 120건 한도를 넘지 않게 창을 관리한다.
import { readFileSync } from 'node:fs'
const SCHEMA = JSON.parse(readFileSync('packages/shared/judgment-items.json', 'utf8'))
const UV = SCHEMA.items.find((i) => i.id === 'unverifiable_claim')
const COMMON = SCHEMA.common_instructions
const BASE = process.env.CHATKHU_API_BASE_URL, KEY = process.env.CHATKHU_API_KEY

const LIMIT = 95            // 분당 120건 중 여유를 둔다
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

/** 문장들을 size 개씩 묶어 부른다. size=1 이면 지금 방식. 반환: [{factual, basis}, ...] 문장 순서대로 */
export async function judge(sents, size) {
  const res = new Array(sents.length)
  const jobs = []
  for (let off = 0; off < sents.length; off += size) {
    const chunk = sents.slice(off, off + size)
    const state = {}, questions = {}, map = {}
    chunk.forEach((t, k) => {
      const f = size === 1 ? 'sentence' : `s${k + 1}`
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
