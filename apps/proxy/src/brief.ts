// 찾아 온 기록을 **읽을 수 있는 글로 엮는다.** 리포트에서 사람이 쓴 것처럼 읽히는
// 유일한 부분이고, **실행 중에 생성되는 유일한 한국어**다.
//
// ## 그래서 여기만 규칙이 다르다
//
// 제품의 나머지 글자는 전부 ChatKHU 가 미리 써 둔 것이고, 사람이 보고 고른 것이다
// (packages/content). 미리 검수가 끝난 글이라 런타임에 볼 것이 없다.
//
// 이 글은 아니다. 그래서 **코드가 그 자리에서 본다.**
//
//   1. **지어낸 주장을 버린다** — `claim` 이 우리가 보낸 문장과 글자 그대로 같아야 한다
//   2. **단정하는 말을 버린다** — packages/shared 의 금지어 목록 (검사와 같은 목록)
//   3. **마크업을 버린다** — 꺾쇠가 든 글은 안 보여 준다. 우리는 HTML 을 받지 않는다
//   4. **고치지 않는다** — 걸리면 통째로 버리고 부르는 쪽이 미리 써 둔 문구로 대신한다
//
// 4번이 중요하다. 어설프게 고치면 그 글은 모델이 쓴 것도 우리가 쓴 것도 아닌 것이 되고,
// 어디까지 고쳤는지 아무도 모르게 된다.
import type { Env } from './index'
import { safeToShow } from '../../../packages/shared/src/wording'
import type { Entry } from './records'

/** 게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 403 으로 막는다. */
const USER_AGENT = 'GenuEarly/0.0.0 (+https://github.com/sumin0218/GenuEarly)'

/** 한 문단·한 줄의 길이 상한(글자). 넘으면 화면을 넘긴다. */
const MAX_SUMMARY = 400
const MAX_CHECK = 200
const MAX_WHERE = 60
/** "어디서 확인하나" 목록의 최대 수. */
const MAX_WHERE_COUNT = 3

/** 리포트에 들어갈 주장 하나와 그에 딸린 기록. */
export interface BriefClaim {
  text: string
  /** 왜 집어 왔는지. **ChatKHU 가 미리 쓴 문구다** */
  why: string
  records: Entry[]
}

/** 엮은 결과. **걸러진 자리는 아예 없다** — 빈 문자열로 두지 않는다. */
export interface Brief {
  /** 전체 한 문단. 걸렀으면 없다 */
  summary?: string
  /** 주장별 "확인할 점". 주장 문장이 우리 것과 다르면 버린다 */
  checks: { claim: string; what: string }[]
  /** 어디서 확인하나 */
  where: string[]
  /** 모델이 돌려준 것 중 **몇 개를 버렸는가.** 로그와 검사가 본다 */
  dropped: number
}

export type BriefResult = { ok: true; brief: Brief } | { ok: false; reason: 'timeout' | 'upstream_error' | 'unusable' }

/**
 * 프롬프트는 **여기서만 만든다.** 확장 프로그램은 자료만 보낸다.
 *
 * 자료를 JSON 으로 넣는다 — 기사 글을 산문에 섞어 넣으면 그 안의 문장이 지시처럼
 * 읽힐 자리가 생긴다. 모양이 분명한 편이 낫다.
 */
function buildPrompt(headline: string, date: string, claims: readonly BriefClaim[]): string {
  const 자료 = {
    headline,
    date,
    claims: claims.map((c) => ({
      text: c.text,
      why: c.why,
      records: c.records.map((r) => ({
        press: r.press,
        date: r.date,
        text: r.text,
        verdict: r.verdict,
        when: r.when,
      })),
    })),
  }
  return [
    '뉴스 기사를 읽는 사람에게 **직접 확인해 볼 것**을 알려 주는 짧은 글을 씁니다.',
    '',
    '## 가장 중요한 규칙',
    '',
    '**기사가 참인지 거짓인지 말하지 않습니다.** "가짜"·"허위"·"거짓"·"조작"·',
    '"신뢰할 수 있는"·"검증된"·"문제없는" 같은 말을 쓰지 않습니다. 기자나 언론사를',
    '탓하는 말로 읽혀서도 안 됩니다. **기록을 못 찾은 것이 거짓이라는 뜻이 아닙니다.**',
    '',
    '평어체 "~습니다" 로 끝내고, 점수나 백분율로 평가하지 않으며, 느낌표와 이모지를 쓰지 않습니다.',
    'HTML 이나 마크다운을 쓰지 않습니다.',
    '',
    '## 받은 자료',
    '',
    JSON.stringify(자료),
    '',
    '`when` 이 `other` 면 **기사와 다른 날짜의 기록**입니다. 같은 사안인지 알 수 없습니다.',
    '`when` 이 `unknown` 이면 기록의 날짜를 읽지 못한 것입니다.',
    '`verdict` 는 그 기록과 그 문장을 맞춰 본 결과이지 **사실 확인이 아닙니다.**',
    '',
    '## 돌려줄 것',
    '',
    '**JSON 하나만** 돌려줍니다. 코드 울타리도, 다른 말도 붙이지 않습니다.',
    '',
    '{',
    `  "summary": "리포트 전체를 요약하는 한 문단. 세 문장 이내, ${MAX_SUMMARY}자 이내.",`,
    '  "checks": [',
    `    { "claim": "받은 자료의 claims[].text 를 **글자 그대로**", "what": "무엇을 어디서 확인하면 되는지 한 문장, ${MAX_CHECK}자 이내" }`,
    '  ],',
    `  "where": ["확인해 볼 만한 자료나 기관 이름. ${MAX_WHERE_COUNT}개 이내"]`,
    '}',
  ].join('\n')
}

/** 모델이 뭐라고 감싸 놨든 **JSON 객체 하나만** 꺼낸다. */
function parseObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const v: unknown = JSON.parse(raw.slice(start, end + 1))
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 길이와 모양만 본 뒤, **보여도 되는 글인지** 묻는다. */
const usable = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length === 0 || t.length > max) return null
  return safeToShow(t) ? t : null
}

/**
 * 받은 것을 거른다. **이 함수가 이 기능의 안전장치다.**
 *
 * 걸러진 것은 세어서 돌려준다 — 조용히 사라지면 모델이 무엇을 하고 있는지 알 수 없다.
 */
export function keepUsableBrief(got: Record<string, unknown>, claims: readonly BriefClaim[]): Brief {
  let dropped = 0
  const 보낸주장 = new Set(claims.map((c) => c.text))

  const summary = usable(got.summary, MAX_SUMMARY)
  if (got.summary !== undefined && summary === null) dropped++

  const checks: Brief['checks'] = []
  for (const row of Array.isArray(got.checks) ? got.checks : []) {
    if (typeof row !== 'object' || row === null) { dropped++; continue }
    const { claim, what } = row as { claim?: unknown; what?: unknown }
    // **우리가 보내지 않은 주장은 버린다.** 모델이 문장을 지어내거나 고쳐 적을 수 있다.
    if (typeof claim !== 'string' || !보낸주장.has(claim)) { dropped++; continue }
    const w = usable(what, MAX_CHECK)
    if (w === null) { dropped++; continue }
    if (checks.some((c) => c.claim === claim)) { dropped++; continue }
    checks.push({ claim, what: w })
  }

  const where: string[] = []
  for (const v of Array.isArray(got.where) ? got.where : []) {
    const t = usable(v, MAX_WHERE)
    if (t === null) { dropped++; continue }
    if (where.includes(t)) continue
    where.push(t)
    if (where.length >= MAX_WHERE_COUNT) break
  }

  return { ...(summary ? { summary } : {}), checks, where, dropped }
}

/** 리포트의 글을 엮는다. **실패는 오류가 아니라 "글이 없음" 이다.** */
export async function weave(
  env: Env,
  headline: string,
  date: string,
  claims: readonly BriefClaim[],
): Promise<BriefResult> {
  if (claims.length === 0) return { ok: false, reason: 'unusable' }

  const timeout = Number(env.BRIEF_TIMEOUT_MS) || 30000
  let res: Response
  try {
    res = await fetch(`${env.JEV_API_BASE_URL}/chat/completions/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.JEV_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        model: env.BRIEF_MODEL,
        messages: [{ role: 'user', content: buildPrompt(headline, date, claims) }],
      }),
      signal: AbortSignal.timeout(timeout),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    console.warn(JSON.stringify({ at: 'brief', outcome: timedOut ? 'timeout' : 'network_error' }))
    return { ok: false, reason: timedOut ? 'timeout' : 'upstream_error' }
  }
  if (!res.ok) {
    // **원본 에러 본문을 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).
    console.warn(JSON.stringify({ at: 'brief', outcome: 'upstream_error', status: res.status }))
    return { ok: false, reason: 'upstream_error' }
  }

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string') return { ok: false, reason: 'unusable' }

  const got = parseObject(text)
  if (!got) return { ok: false, reason: 'unusable' }

  const brief = keepUsableBrief(got, claims)
  console.warn(JSON.stringify({ at: 'brief', checks: brief.checks.length, dropped: brief.dropped }))
  return { ok: true, brief }
}
