// ChatKHU Gateway 채팅 호출 (OpenAI 호환). 평가 세트 준비에만 쓴다.
// 키는 --env-file 로 받는다. 이 파일에 값을 적지 않는다.
const BASE = process.env.CHATKHU_API_BASE_URL
const KEY = process.env.CHATKHU_API_KEY
export const MODEL = process.env.CHATKHU_MODEL || 'claude-sonnet-5-5'

if (!BASE || !KEY) throw new Error('CHATKHU_API_BASE_URL, CHATKHU_API_KEY 가 필요하다 (--env-file)')

export async function chat(messages, { temperature = 0.7, maxTokens = 12000, tries = 3 } = {}) {
  for (let t = 0; t < tries; t++) {
    const r = await fetch(`${BASE}/chat/completions/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens }),
    })
    if (r.status === 200) {
      const j = await r.json()
      return { text: j.choices[0].message.content ?? "", finish: j.choices[0].finish_reason, model: j.model, usage: j.usage }
    }
    const txt = await r.text()
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 5000 * (t + 1))); continue }
    throw new Error(`${r.status} ${txt.slice(0, 200)}`)
  }
  throw new Error('재시도 소진')
}
