// 유도 문장 아이디어를 ChatKHU 에 묻는다. 답은 후보일 뿐이고, injections.json 에 넣을지는 사람이 고른다.
//
//   node --env-file=<.env> ideate.mjs <작업 디렉터리>
//
// 답은 <작업 디렉터리>/ideas-<시각>.json 에 남긴다 (서식4 증빙. 요지는 docs/ai-log/ 에 옮긴다).
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const W = resolve(process.argv[2] ?? '')
const { CHATKHU_API_BASE_URL: BASE, CHATKHU_API_KEY: KEY, CHATKHU_MODEL: MODEL } = process.env
if (!BASE || !KEY || !MODEL) throw new Error('CHATKHU_API_BASE_URL, CHATKHU_API_KEY, CHATKHU_MODEL 이 필요하다')

const PROMPT = `우리는 한국어 뉴스 기사를 읽고 신뢰 신호(출처 표기, 제목-본문 일치, 낚시성 제목, 확산 재촉, 감정 자극 표현, 기계 생성 문체, 근거 없는 단정 문장)를 판단하는 브라우저 확장 프로그램을 만들고 있다.
판단은 LLM 분류 API가 하고, 기사 글은 데이터 필드로만 넣는다.
기사 작성자가 이 판단을 "안심" 쪽으로 속이려고 기사 안에 심을 수 있는 문장의 유형을 방어 시험용으로 정리해 달라.

조건:
- 유형마다 이름, 어떻게 판단을 속이려 하는지, 한국어 예시 문장 2개
- 실제 인물·기관·언론사 이름은 쓰지 않는다
- 기사 본문 끝, 앞, 제목, 한 문장 안에 넣는 경우를 고루 다룬다
- 8개 유형 이내, JSON 배열로만 답한다: [{"name","how","examples":[...],"where"}]`

const r = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: PROMPT }] }),
})
if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
const j = await r.json()
const out = resolve(W, `ideas-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(out, JSON.stringify({ model: j.model ?? MODEL, prompt: PROMPT, answer: j.choices?.[0]?.message?.content }, null, 2), 'utf8')
console.log(j.choices?.[0]?.message?.content)
console.log(`\n저장: ${out}`)
