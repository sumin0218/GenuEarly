// 배지 단계에 sonar 를 넣으면 정확도가 오르는가, 시간은 얼마나 느는가.
//
// 두 길을 **같은 문장에** 돌려 견준다.
//
//   A (지금)      문장 → Jev 두 질문(factual_assertion, named_basis) → 점수
//   B (sonar 추가) 문장 → sonar 로 주변 기록 검색 → 기록마다 Jev entail → 신호
//
// 키는 --env-file 로 받는다. 이 파일에 값을 적지 않는다.
//
//   node --env-file=tools/content-gen/.env eval/experiments/badge-with-search/run.mjs
//
// **대조군은 자료가 들고 있다.** manual-news 의 과장 제목 15건 가운데 `subtype` 이
// `true` 인 5건은 **공식 출처를 확인해 요약한 과거 기록**이고, `false` 인 5건은
// **지어낸 사건**이다. sonar 가 배지에 쓸모가 있다면 앞의 다섯에서는 기록을 찾고
// 뒤의 다섯에서는 못 찾아야 한다.
//
// **정답 라벨이 아니다.** 5건씩이라 한 건이 20%p 를 움직인다
// (eval/data/README.md 1절). 방향을 보는 정도로 읽는다.
import { readFileSync } from 'node:fs'

const BASE = process.env.CHATKHU_API_BASE_URL
const KEY = process.env.CHATKHU_API_KEY
if (!BASE || !KEY) throw new Error('CHATKHU_API_BASE_URL, CHATKHU_API_KEY 가 필요하다 (--env-file)')

/** 게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 막는다 (apps/proxy/src/jev.ts 와 같은 이유). */
const UA = 'GenuEarly-eval/0.0.0 (+https://github.com/sumin0218/GenuEarly)'
const JEV = 'jev-1.13.0'
const SEARCH = 'sonar-pro'

/** 한 기사에서 볼 문장 수. 비용을 아끼려고 앞쪽만 본다. */
const PER_ARTICLE = 3
/** 한 문장에 맞춰 볼 기록 수. */
const MAX_RECORDS = 3

const schema = JSON.parse(readFileSync('packages/shared/judgment-items.json', 'utf8'))
const uvc = schema.items.find((i) => i.id === 'unverifiable_claim')
const Q = Object.fromEntries(uvc.questions.map((q) => [q.id, q.question]))
const ENTAIL = schema.report_items.find((i) => i.id === 'record_entailment').question

const articles = JSON.parse(readFileSync('eval/fixtures/manual-news/articles.json', 'utf8'))
const sample = (Array.isArray(articles) ? articles : articles.articles).filter(
  (a) => a.category === 'clickbait' && (a.subtype === 'true' || a.subtype === 'false'),
)

/** 문장 나누기. 제품의 분리기와 **같지 않다** — 종결부호로만 끊는 거친 판이다. */
function sentences(body) {
  return body
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15)
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status} ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

/** A: 지금 배지가 하는 그대로. */
async function routeA(sentence) {
  const t = Date.now()
  const j = await post('/decisions/', {
    model: JEV,
    state: { sentence },
    questions: { factual_assertion: Q.factual_assertion, named_basis: Q.named_basis },
  })
  const a = j.answers?.factual_assertion?.noul
  const b = j.answers?.named_basis?.noul
  const score = typeof a === 'number' && typeof b === 'number' ? a * (1 - b) : null
  return { ms: Date.now() - t, score, a, b }
}

/** sonar 에 보내는 글. apps/proxy/src/records.ts 의 buildQuery 를 그대로 옮겼다. */
function query(claim, date) {
  return [
    `아래 문장이 말하는 사안의 공개 기록을 찾아 주세요. 이 문장은 ${date} 기사의 것입니다.`,
    '',
    '**뒷받침하는 기록과 어긋나는 기록을 모두 찾습니다.** 어긋나는 기록이란 같은 사안을 ' +
      '다르게 적은 것, 수치·날짜·주체가 다른 것, 정정·반박·부인 보도, 나중에 뒤집힌 내용을 ' +
      '말합니다. 어긋나는 것을 **먼저** 찾아보고, 없으면 없다고 두세요.',
    `**${date} 전후의 기록을 우선**합니다.`,
    '',
    '참·거짓을 선언하지 마세요. 기록마다 한 줄로: 매체 | 날짜(YYYY-MM-DD) | 내용 한 문장 | URL',
    '최대 5건. 다른 말은 쓰지 마세요.',
    '',
    '문장: ' + claim,
  ].join('\n')
}

/** B: sonar 로 찾고 Jev 로 맞춰 본다. */
async function routeB(sentence, date) {
  const t = Date.now()
  let records = []
  let searchMs = 0
  try {
    const s0 = Date.now()
    const j = await post('/chat/completions/', {
      model: SEARCH,
      messages: [{ role: 'user', content: query(sentence, date) }],
    })
    searchMs = Date.now() - s0
    const text = j.choices?.[0]?.message?.content ?? ''
    records = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.split('|').length >= 3)
      .slice(0, MAX_RECORDS)
  } catch (e) {
    return { ms: Date.now() - t, searchMs, records: 0, verdicts: [], error: String(e).slice(0, 120) }
  }

  const verdicts = []
  for (const r of records) {
    try {
      const j = await post('/decisions/', {
        model: JEV,
        state: { claim: sentence, record: r },
        questions: { entail: ENTAIL },
      })
      verdicts.push(j.answers?.entail?.choice ?? '?')
    } catch {
      verdicts.push('error')
    }
  }
  return { ms: Date.now() - t, searchMs, records: records.length, verdicts }
}

const out = []
for (const art of sample) {
  const ss = sentences(art.body).slice(0, PER_ARTICLE)
  const date = '2026-09-01'
  const row = { id: art.id, truth: art.subtype, headline: art.headline, sentences: [] }
  for (const s of ss) {
    const A = await routeA(s)
    const B = await routeB(s, date)
    row.sentences.push({ text: s.slice(0, 60), A, B })
    process.stderr.write(`${art.id} ${art.subtype.padEnd(5)} A=${String(A.score).slice(0, 5).padEnd(5)} ${String(A.ms).padStart(5)}ms | B rec=${B.records} ${String(B.verdicts)} ${String(B.ms).padStart(6)}ms\n`)
  }
  out.push(row)
}

console.log(JSON.stringify(out, null, 1))
