// 본문에서 **근거가 될 부분을 집어 오는** 호출. ChatKHU Gateway 의 생성 모델을 쓴다.
//
// ## 왜 LLM 인가, 그리고 왜 이렇게만 쓰는가
//
// Jev 는 분류기라 "이 글이 어떤가" 는 재지만 "이 표현이 어디 있는가" 는 못 한다
// (docs/jev.md 8절 실측). 코드는 **정해진 표현**만 찾을 수 있다 (packages/shared 의
// evidence.ts). 남는 것 — 기관명·실명처럼 목록으로 담을 수 없는 것 — 만 여기서 한다.
//
// ## 지키는 것
//
// 1. **판단하지 않는다.** 판정은 이미 Jev 가 냈고 **입력으로 준다.** 동의도 반대도 묻지
//    않으므로 판정과 어긋날 수가 없다
// 2. **글을 쓰지 않는다.** 돌려받는 것은 **본문의 부분 문자열**과, 미리 정해 둔 이유 중
//    **고른 하나의 id** 뿐이다. 사용자에게 보이는 말은 전부 ChatKHU 가 미리 쓴 문구다
//    (packages/content). 모델은 쓰지 않고 **고른다**
// 3. **지어낸 것은 버린다.** 돌려받은 조각이 본문에 글자 그대로 있는지 대조한다.
//    LLM 이 가장 잘 틀리는 일을 코드가 완벽하게 잡는 자리다
// 4. 하나도 남지 않으면 **아무것도 돌려주지 않는다.** 지어낸 설명보다 빈 화면이 낫다
import type { Env } from './index'

/** 게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 403 으로 막는다 (jev.ts 와 같은 이유). */
const USER_AGENT = 'GenuEarly/0.0.0 (+https://github.com/sumin0218/GenuEarly)'

/**
 * 한 항목에 집어 올 수 있는 문장 수.
 *
 * **둘이다.** 넷을 붙여 보니 화면이 본문 복사처럼 보였다 — 어디를 보라는 것인지
 * 알 수 없게 된다. 가장 두드러진 한둘만 짚는 편이 낫다.
 */
const MAX_PICKS = 2
/** 조각 하나의 길이 상한(글자). 넘으면 인용이 아니라 본문 복사다. */
const MAX_SPAN_CHARS = 140

/** 떼어 온 문장 하나와, **왜 떼어 왔는지.** `why` 는 미리 정해 둔 id 다. */
export interface Pick {
  /** **원문 그대로.** 본문과 글자 대조해 남은 것만 들어 있다 */
  text: string
  /** `REASONS[itemId]` 안에 있는 id. 화면에 뜨는 문장은 packages/content 가 들고 있다 */
  why: string
}

export type PinpointResult =
  | { ok: true; picks: Pick[] }
  | { ok: false; reason: 'timeout' | 'upstream_error' | 'unusable' }

/**
 * 설명할 수 있는 판정과, **프롬프트에 적어 줄 우리말.**
 *
 * 판정 이름이 프롬프트에 들어가므로 **받은 글자를 그대로 쓰지 않는다.** 정해 둔 둘
 * 중 하나로만 바꿔 적는다. 아니면 요청으로 모델에 말을 집어넣을 수 있다.
 *
 * 🟢(안전)·⚪(판단하지 못함) 은 없다. 설명할 것이 없고, 크레딧을 쓸 이유도 없다.
 */
const LEVEL_WORD = {
  CAUTION: '주의가 필요함',
  CHECK: '확인해 볼 만함',
} as const

export type PinpointLevel = keyof typeof LEVEL_WORD

export const isPinpointLevel = (v: string): v is PinpointLevel => Object.hasOwn(LEVEL_WORD, v)

/**
 * 항목마다 **무엇을 집으라고 할 것인가.**
 *
 * judgment-items.json 의 criteria 를 그대로 옮긴 말이다. 새 기준을 만들지 않는다 —
 * 만들면 Jev 의 판정과 다른 것을 가리키게 된다.
 */
const WHAT: Readonly<Record<string, string>> = {
  source_citation: '주장의 출처를 누구인지 밝히지 않고 적은 대목, 또는 출처 없이 단정한 대목.',
  unverifiable_claim: '일어난 일·수치·인과관계를 확정해 적었는데 그 문장 안에 근거가 없는 문장.',
}

/**
 * 고를 수 있는 **이유**와, 모델에게 그 이유를 설명하는 말.
 *
 * **여기 없는 id 는 버린다.** 모델이 이유를 지어내면 화면에 띄울 문구가 없고,
 * 그 자리가 곧 모델이 쓴 한국어가 새어 들어오는 구멍이 된다.
 *
 * 네 가지(①~④)는 unverifiable_claim 의 criteria "false" 가 적어 둔 네 가지 방식 그대로다.
 * 둘(⑤⑥)은 source_citation 의 criteria 에서 named_source 를 뺀 나머지다.
 * **criteria 에 없는 이유를 만들지 않는다** — 만들면 Jev 의 판정과 다른 것을 가리킨다.
 */
const REASONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  unverifiable_claim: {
    uvc_no_basis: '근거를 가리키는 말 없이 일·수치를 확정해 적은 문장',
    uvc_group_only: "'관계자'·'전문가들'·'업계에서는' 처럼 집단이나 직함으로만 가리킨 문장",
    uvc_hearsay: "'~라고 알려졌다'·'~로 전해졌다' 처럼 전해 들은 말로 적은 문장",
    uvc_causal: '무엇 때문에 무엇이 됐다고, 근거 없이 원인과 결과를 이어 붙인 문장',
  },
  source_citation: {
    src_group_only: "'전문가에 따르면'·'한 관계자는' 처럼 누구인지 밝히지 않은 출처 표현",
    src_none: '출처를 가리키는 표현 없이 주장만 적힌 대목',
  },
}

export const canPinpoint = (itemId: string): boolean => Object.hasOwn(REASONS, itemId)

/**
 * 프롬프트는 **여기서만 만든다.**
 *
 * 확장 프로그램은 항목 id 와 본문만 보낸다. 자유 텍스트 지시를 받지 않는다 —
 * 받으면 우리 키로 남이 생성 모델을 쓰는 길이 열린다 (apps/proxy/README.md).
 */
function buildPrompt(itemId: string, level: PinpointLevel, body: string): string {
  const reasons = REASONS[itemId]
  return [
    '아래 글에서 **그대로 베껴 낸 짧은 조각**을 골라, 각각 왜 골랐는지 밝혀 주세요.',
    '',
    `찾을 것: ${WHAT[itemId]}`,
    `참고로, 이 글은 이 항목에서 "${LEVEL_WORD[level]}" 으로 판정되었습니다. **그 판정을 바꾸거나 평가하지 마세요.**`,
    '',
    '왜 골랐는지는 **아래 목록에서 하나를 고릅니다.** 새로 쓰지 않습니다:',
    ...Object.entries(reasons).map(([id, what]) => `- ${id}: ${what}`),
    '',
    '규칙:',
    '- 글에 있는 글자를 **한 글자도 바꾸지 말고** 그대로 베낍니다. 요약·설명·번역을 하지 않습니다',
    `- **가장 두드러진 것부터 최대 ${MAX_PICKS}개**, 각 ${MAX_SPAN_CHARS}자 이내`,
    `- why 에는 위 목록의 id 를 **그대로** 적습니다. 목록에 없는 말을 적지 않습니다`,
    '- 해당하는 것이 없으면 빈 배열을 돌려줍니다. 억지로 채우지 않습니다',
    '- 설명을 붙이지 않습니다. **JSON 배열 하나만** 돌려줍니다',
    '',
    `돌려줄 모양: [{"quote": "조각", "why": "${Object.keys(reasons)[0]}"}]`,
    '',
    '--- 글 ---',
    body,
  ].join('\n')
}

/** 모델이 뭐라고 감싸 놨든 **JSON 배열 하나만** 꺼낸다. */
function parseArray(raw: string): unknown[] | null {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  try {
    const v = JSON.parse(raw.slice(start, end + 1))
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/**
 * **본문에 글자 그대로 있고, 이유가 아는 것인 것만** 남긴다.
 *
 * **이것이 이 기능의 안전장치다.** LLM 이 가장 잘 틀리는 것이 없는 것을 지어내는 일인데,
 * 그 틀림은 둘 다 코드가 100% 잡는다 — 조각은 문자열 대조로, 이유는 목록 대조로.
 * 지어낸 것은 여기서 전부 떨어진다.
 */
export function keepOnlyUsable(raw: readonly unknown[], body: string, itemId: string): Pick[] {
  const reasons = REASONS[itemId]
  if (!reasons) return []

  const out: Pick[] = []
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue
    const { quote, why } = row as { quote?: unknown; why?: unknown }
    if (typeof quote !== 'string' || typeof why !== 'string') continue

    const text = quote.trim()
    if (text.length === 0 || text.length > MAX_SPAN_CHARS) continue
    // 본문에 없는 글자는 지어낸 것이다.
    if (!body.includes(text)) continue
    // 목록에 없는 이유는 **화면에 띄울 문구가 없다.** 모델이 쓴 말이 새어 들어오는 자리다.
    if (!Object.hasOwn(reasons, why)) continue
    if (out.some((x) => x.text === text)) continue

    out.push({ text, why })
    if (out.length >= MAX_PICKS) break
  }
  return out
}

/** 본문에서 근거가 될 조각을 집어 온다. **실패는 오류가 아니라 "없음" 이다.** */
export async function pinpoint(
  env: Env,
  itemId: string,
  level: PinpointLevel,
  body: string,
): Promise<PinpointResult> {
  if (!canPinpoint(itemId)) return { ok: false, reason: 'unusable' }

  const timeout = Number(env.EXPLAIN_TIMEOUT_MS) || 12000
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
        model: env.EXPLAIN_MODEL,
        messages: [{ role: 'user', content: buildPrompt(itemId, level, body) }],
      }),
      signal: AbortSignal.timeout(timeout),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    console.warn(JSON.stringify({ at: 'pinpoint', outcome: timedOut ? 'timeout' : 'network_error' }))
    return { ok: false, reason: timedOut ? 'timeout' : 'upstream_error' }
  }

  if (!res.ok) {
    // **원본 에러 본문을 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).
    console.warn(JSON.stringify({ at: 'pinpoint', outcome: 'upstream_error', status: res.status }))
    return { ok: false, reason: 'upstream_error' }
  }

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string') return { ok: false, reason: 'unusable' }

  const parsed = parseArray(text)
  if (!parsed) return { ok: false, reason: 'unusable' }

  const picks = keepOnlyUsable(parsed, body, itemId)
  console.warn(JSON.stringify({ at: 'pinpoint', got: parsed.length, kept: picks.length }))
  return { ok: true, picks }
}
