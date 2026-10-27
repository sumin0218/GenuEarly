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
// 2. **글을 쓰지 않는다.** 돌려받는 것은 **본문의 부분 문자열 배열**이다. 사용자에게 보이는
//    말은 전부 ChatKHU 가 미리 쓴 문구다 (packages/content)
// 3. **지어낸 것은 버린다.** 돌려받은 조각이 본문에 글자 그대로 있는지 대조한다.
//    LLM 이 가장 잘 틀리는 일을 코드가 완벽하게 잡는 자리다
// 4. 하나도 남지 않으면 **아무것도 돌려주지 않는다.** 지어낸 설명보다 빈 화면이 낫다
import type { Env } from './index'

/** 게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 403 으로 막는다 (jev.ts 와 같은 이유). */
const USER_AGENT = 'GenuEarly/0.0.0 (+https://github.com/sumin0218/GenuEarly)'

/** 한 항목에 집어 올 수 있는 조각 수. 화면에 들어갈 만큼만. */
const MAX_SPANS = 4
/** 조각 하나의 길이 상한(글자). 넘으면 인용이 아니라 본문 복사다. */
const MAX_SPAN_CHARS = 120

export type PinpointResult =
  | { ok: true; spans: string[] }
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
  source_citation:
    '주장의 출처를 밝힌 표현, 또는 출처 없이 단정한 대목. ' +
    '기관 이름, 실명이 적힌 인물, 문서·보고서의 이름, 다른 언론사 이름, ' +
    "그리고 '전문가에 따르면'·'한 관계자는' 처럼 누구인지 밝히지 않은 표현.",
  headline_body_match:
    '제목이 말하는 것과 본문이 말하는 것이 어긋나는 대목, 또는 본문에 달린 조건이 제목에서 빠진 대목.',
  emotional_language: '분노·공포·혐오·불안을 끌어올리는 표현. 작성자가 쓴 서술만.',
  clickbait_headline: '내용을 감추거나 부풀리는 제목 표현.',
  spread_inducement: '이 글을 퍼뜨리라고 재촉하거나 그럴 필요를 강조하는 표현.',
  ai_style_signal: '기계가 쓴 글에서 흔한 문체가 드러나는 대목.',
  unverifiable_claim: '근거 없이 확정해 말하는 문장.',
}

export const canPinpoint = (itemId: string): boolean => Object.hasOwn(WHAT, itemId)

/**
 * 프롬프트는 **여기서만 만든다.**
 *
 * 확장 프로그램은 항목 id 와 본문만 보낸다. 자유 텍스트 지시를 받지 않는다 —
 * 받으면 우리 키로 남이 생성 모델을 쓰는 길이 열린다 (apps/proxy/README.md).
 */
function buildPrompt(itemId: string, level: PinpointLevel, body: string): string {
  return [
    '아래 글에서 **그대로 베껴 낸 짧은 조각**만 골라 주세요.',
    '',
    `찾을 것: ${WHAT[itemId]}`,
    `참고로, 이 글은 이 항목에서 "${LEVEL_WORD[level]}" 으로 판정되었습니다. **그 판정을 바꾸거나 평가하지 마세요.**`,
    '',
    '규칙:',
    `- 글에 있는 글자를 **한 글자도 바꾸지 말고** 그대로 베낍니다. 요약·설명·번역을 하지 않습니다`,
    `- 조각은 최대 ${MAX_SPANS}개, 각 ${MAX_SPAN_CHARS}자 이내`,
    '- 해당하는 것이 없으면 빈 배열을 돌려줍니다. 억지로 채우지 않습니다',
    '- 설명을 붙이지 않습니다. **JSON 배열 하나만** 돌려줍니다',
    '',
    '돌려줄 모양: ["조각", "조각"]',
    '',
    '--- 글 ---',
    body,
  ].join('\n')
}

/** 모델이 뭐라고 감싸 놨든 **JSON 배열 하나만** 꺼낸다. */
function parseSpans(raw: string): string[] | null {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  try {
    const v = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(v)) return null
    return v.filter((x): x is string => typeof x === 'string')
  } catch {
    return null
  }
}

/**
 * 본문에 **글자 그대로** 있는 조각만 남긴다.
 *
 * **이것이 이 기능의 안전장치다.** LLM 이 가장 잘 틀리는 것이 없는 것을 지어내는 일인데,
 * 그 틀림은 문자열 대조로 100% 잡힌다. 지어낸 것은 여기서 전부 떨어진다.
 */
export function keepOnlyVerbatim(spans: readonly string[], body: string): string[] {
  const out: string[] = []
  for (const raw of spans) {
    const s = raw.trim()
    if (s.length === 0 || s.length > MAX_SPAN_CHARS) continue
    if (!body.includes(s)) continue
    if (out.includes(s)) continue
    out.push(s)
    if (out.length >= MAX_SPANS) break
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

  const parsed = parseSpans(text)
  if (!parsed) return { ok: false, reason: 'unusable' }

  const spans = keepOnlyVerbatim(parsed, body)
  console.warn(JSON.stringify({ at: 'pinpoint', got: parsed.length, kept: spans.length }))
  return { ok: true, spans }
}
