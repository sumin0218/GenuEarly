// 주장 하나에 관한 **공개 기록을 찾아 오고**, 그 기록이 주장을 뒷받침하는지 Jev 에 묻는다.
//
// ## 왜 이렇게 나눴는가
//
// 모델을 셋 쓰지만 **판정하는 것은 Jev 하나다.** 셋이 각자 판정하면 서로 어긋나고,
// 그 어긋남은 사용자가 어느 쪽도 믿지 못하게 만든다 (실제로 겪었다 — GE-44 의
// "판정과 설명이 어긋난다").
//
//   sonar-pro  찾는다   — 참·거짓을 선언하지 말라고 적어 보낸다
//   Jev        판단한다 — 두 글을 맞춰 본다. **바깥 지식을 쓰지 않는다**
//   코드       거른다   — 자기 인용, 지어낸 URL, 날짜 어긋남
//
// ## 코드가 거르는 셋 (전부 실측으로 나온 것이다)
//
// 기사 8건·주장 16개·기록 48건을 돌려 본 결과다 (2026-10-28).
//
//   ① **자기 인용 17%** — 기사 X 의 주장을 검색하면 X 자신과 전재본이 올라온다.
//      "기록을 찾았습니다 — 출처: 바로 그 기사" 는 순환 논증이다
//   ② **지어낸 URL** — 모델이 적은 주소가 검색이 실제로 돌려준 것인지 대조한다.
//      pinpoint.ts 가 인용을 본문과 대조하는 것과 같은 원리다
//   ③ **날짜 어긋남 21%** — **Jev 는 날짜를 모른다.** 10/27 기사의 수급 주장에
//      9/18 기록을 두고 `supports 0.95` 를 준다. 질의에 날짜를 적어도 그대로였다.
//      Jev 답을 고치지 않고 **화면에 붙는 표시를 코드가 정한다**
import type { Env } from './index'
// **상대 경로로 읽는다.** 패키지 이름으로 가져오면 CI 에서 풀리지 않는다 —
// schema.ts 가 같은 방식을 쓴다.
import schema from '../../../packages/shared/judgment-items.json'

/** 게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 403 으로 막는다 (jev.ts 와 같은 이유). */
const USER_AGENT = 'GenuEarly/0.0.0 (+https://github.com/sumin0218/GenuEarly)'

/** 주장 하나에 보여 줄 기록 수. 화면에 들어갈 만큼만. */
const MAX_RECORDS = 3
/** 기록 한 줄의 길이 상한(글자). */
const MAX_RECORD_CHARS = 200

/** 기록 하나와 그에 대한 Jev 의 답. */
export interface Entry {
  press: string
  /** `YYYY-MM-DD`. 못 읽었으면 빈 문자열 */
  date: string
  text: string
  url: string
  /** Jev 가 고른 것 */
  verdict: 'supports' | 'contradicts' | 'unrelated'
  confidence: number
  /**
   * 기사 날짜와 견준 결과. **Jev 가 아니라 코드가 정한다.**
   * `same` 만 그대로 믿는다 — 나머지는 화면에서 날짜를 함께 보인다.
   */
  when: 'same' | 'other' | 'unknown'
}

export type RecordsResult =
  | { ok: true; records: Entry[]; searched: number }
  | { ok: false; reason: 'timeout' | 'upstream_error' | 'unusable' }

/** `report_items` 의 대조 질문. **원본은 judgment-items.json 하나다.** */
const ENTAIL = (schema as unknown as {
  report_items: { id: string; question: { type: string; instructions: string; criteria: Readonly<globalThis.Record<string, string>> } }[]
}).report_items.find((i) => i.id === 'record_entailment')!.question

const VERDICTS = ['supports', 'contradicts', 'unrelated'] as const

/**
 * 찾아 달라고 하는 말. **"뒷받침을 찾아 줘" 라고만 하면 확증 편향이 그대로 파이프라인이 된다.**
 *
 * 실측: 뒷받침만 찾게 했을 때 Jev 답이 `supports` 92%(44/48)로 쏠려 대조가 아무 정보도
 * 보태지 못했다. 반증도 찾게 하니 `contradicts` 가 1 → 6 으로 올랐고, 여섯 중 다섯은
 * 읽을 가치가 있는 것이었다 ("전국 최고점" → 기록은 "종합 2위, 한 지표만 1위").
 */
function buildQuery(claim: string, articleDate: string): string {
  return [
    `아래 문장이 말하는 사안의 공개 기록을 찾아 주세요. 이 문장은 ${articleDate} 기사의 것입니다.`,
    '',
    '**뒷받침하는 기록과 어긋나는 기록을 모두 찾습니다.** 어긋나는 기록이란 같은 사안을 ' +
      '다르게 적은 것, 수치·날짜·주체가 다른 것, 정정·반박·부인 보도, 나중에 뒤집힌 내용을 ' +
      '말합니다. 어긋나는 것을 **먼저** 찾아보고, 없으면 없다고 두세요.',
    `**${articleDate} 전후의 기록을 우선**합니다.`,
    '',
    '참·거짓을 선언하지 마세요. 기록마다 한 줄로: 매체 | 날짜(YYYY-MM-DD) | 내용 한 문장 | URL',
    '최대 5건. 다른 말은 쓰지 마세요.',
    '',
    '문장: ' + claim,
  ].join('\n')
}

interface Found {
  press: string
  date: string
  text: string
  url: string
}

/** 모델이 적은 줄을 뜯는다. 모양이 아니면 버린다. */
export function parseRecords(raw: string): Found[] {
  const out: Found[] = []
  for (const line of raw.split('\n')) {
    const l = line.replace(/^[-*\d.\s[\]]+/, '').trim()
    if (!l.includes('|') || !/https?:\/\//.test(l)) continue
    const p = l.split('|').map((x) => x.trim())
    const url = (p.find((x) => /^https?:\/\//.test(x)) ?? '').replace(/[)\]]+$/, '')
    const text = (p[2] ?? '').slice(0, MAX_RECORD_CHARS)
    if (!url || !text) continue
    out.push({
      press: (p[0] ?? '').slice(0, 40),
      date: (/\d{4}-\d{2}-\d{2}/.exec(p[1] ?? '') ?? [''])[0] as string,
      text,
      url,
    })
  }
  return out
}

/** 호스트에서 등록 도메인에 가까운 두 조각을 뽑는다. `www.a.co.kr` → `a.co.kr` */
function baseHost(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    const parts = h.split('.')
    // `co.kr`·`or.kr` 같은 두 단계 접미사를 한 조각 더 본다
    const n = parts.length >= 3 && /^(co|or|ne|go|re|pe)$/.test(parts[parts.length - 2] ?? '') ? 3 : 2
    return parts.slice(-n).join('.')
  } catch {
    return ''
  }
}

/**
 * **거를 것을 거른다.** 자기 인용, 지어낸 URL, 중복, 모양이 아닌 것.
 *
 * `citations` 는 검색이 실제로 돌려준 주소다. 모델이 글에 적은 주소가 그 안에 없으면
 * **지어낸 것**이다 — 인용을 본문과 대조하는 것과 같다 (pinpoint.ts).
 */
export function keepUsable(found: readonly Found[], citations: readonly string[], articleUrl: string): Found[] {
  const 본문매체 = baseHost(articleUrl)
  const 찾은주소 = new Set(citations.map((c) => c.trim()))
  // **출처 목록이 비면 **아무것도** 쓸 수 없다.**
  //
  // 처음에는 `찾은주소.size > 0` 일 때만 주소를 맞춰 봤다. 목록이 비었을 때
  // 그냥 통과시킨 것인데, 그러면 **검증을 가장 못 하는 상황에서 검증을 끈다.**
  // 모델이 지어낸 주소가 Jev 를 거쳐 화면의 링크까지 그대로 간다.
  //
  // 기록이 없는 리포트는 "기록을 찾지 못했습니다" 로 끝난다 — 멀쩡한 결말이다.
  // 지어낸 주소를 내보내는 것보다 낫다. (승원 리뷰 #34)
  if (찾은주소.size === 0) return []

  const out: Found[] = []
  for (const r of found) {
    // 검색이 돌려주지 않은 주소는 지어낸 것이다.
    if (!찾은주소.has(r.url)) continue
    // 자기 인용은 근거가 되지 않는다.
    if (본문매체 && baseHost(r.url) === 본문매체) continue
    if (out.some((x) => x.url === r.url)) continue
    out.push(r)
    if (out.length >= MAX_RECORDS) break
  }
  return out
}

/** 기사 날짜와 견준다. **Jev 가 못 하는 일이고, 할 필요도 없는 일이다.** */
export const whenOf = (recordDate: string, articleDate: string): Entry['when'] =>
  !recordDate || !articleDate ? 'unknown' : recordDate === articleDate ? 'same' : 'other'

async function searchRecords(env: Env, claim: string, articleDate: string): Promise<{ found: Found[]; citations: string[] } | null> {
  const timeout = Number(env.SEARCH_TIMEOUT_MS) || 20000
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
        model: env.SEARCH_MODEL,
        messages: [{ role: 'user', content: buildQuery(claim, articleDate) }],
      }),
      signal: AbortSignal.timeout(timeout),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    console.warn(JSON.stringify({ at: 'search', outcome: timedOut ? 'timeout' : 'network_error' }))
    return null
  }
  if (!res.ok) {
    // **원본 에러 본문을 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).
    console.warn(JSON.stringify({ at: 'search', outcome: 'upstream_error', status: res.status }))
    return null
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[]
    citations?: unknown
  }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string') return null
  const citations = Array.isArray(data.citations)
    ? data.citations.filter((c): c is string => typeof c === 'string')
    : []
  return { found: parseRecords(text), citations }
}

/** 기록 하나가 주장을 뒷받침하는지 Jev 에 묻는다. 답이 이상하면 `unrelated` 로 둔다. */
async function entail(env: Env, claim: string, record: string): Promise<{ verdict: Entry['verdict']; confidence: number }> {
  try {
    const res = await fetch(`${env.JEV_API_BASE_URL}/decisions/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.JEV_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        model: env.JEV_MODEL,
        state: { claim, record },
        questions: { entail: ENTAIL },
      }),
      signal: AbortSignal.timeout(Number(env.JEV_TIMEOUT_MS) || 8000),
    })
    if (!res.ok) {
      console.warn(JSON.stringify({ at: 'entail', outcome: 'upstream_error', status: res.status }))
      return { verdict: 'unrelated', confidence: 0 }
    }
    const a = ((await res.json()) as { answers?: { entail?: { choice?: unknown; confidence?: unknown } } })
      .answers?.entail
    const choice = VERDICTS.find((v) => v === a?.choice)
    if (!choice) return { verdict: 'unrelated', confidence: 0 }
    const c = typeof a?.confidence === 'number' && Number.isFinite(a.confidence) ? a.confidence : 0
    return { verdict: choice, confidence: c }
  } catch {
    console.warn(JSON.stringify({ at: 'entail', outcome: 'unreachable' }))
    return { verdict: 'unrelated', confidence: 0 }
  }
}

/**
 * 주장 하나를 조사한다. **실패는 오류가 아니라 "못 찾음" 이다.**
 *
 * 주장마다 따로 부른다 — 확장 프로그램이 받는 대로 한 줄씩 그릴 수 있어야 하고,
 * 스무 초를 빈 화면으로 기다리게 하지 않기 위해서다.
 */
export async function investigate(
  env: Env,
  claim: string,
  articleDate: string,
  articleUrl: string,
): Promise<RecordsResult> {
  const got = await searchRecords(env, claim, articleDate)
  if (!got) return { ok: false, reason: 'upstream_error' }

  const usable = keepUsable(got.found, got.citations, articleUrl)
  const records: Entry[] = []
  for (const r of usable) {
    const { verdict, confidence } = await entail(env, claim, `${r.press}(${r.date}): ${r.text}`)
    records.push({ ...r, verdict, confidence, when: whenOf(r.date, articleDate) })
  }
  console.warn(JSON.stringify({ at: 'records', found: got.found.length, kept: records.length }))
  return { ok: true, records, searched: got.found.length }
}
