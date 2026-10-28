// 기사에서 **공개 기록과 나란히 놓고 볼 수 있는 문장**을 집어 온다.
//
// ## pinpoint.ts 와 무엇이 다른가
//
// `pinpoint` 는 **걸린 항목이 왜 걸렸는지**를 집는다. 판정을 입력으로 받고, 그 판정의
// 근거가 될 대목을 가리킨다. 신호가 없는 기사에는 쓸 수 없다 — 가리킬 판정이 없다.
//
// 여기는 **판정과 무관하다.** 기사가 초록이어도 돈다. 고르는 기준은 "이 문장이
// 수상한가" 가 아니라 **"이 문장을 다른 기록과 나란히 놓을 수 있는가"** 다.
//
// 한 기사가 전하지 못하는 것이 있다. 같은 사안을 다른 매체가 어떻게 적었는지,
// 숫자가 보도마다 어떻게 다른지. 그것을 옆에 놓아 주는 것이 이 길의 목적이다.
//
// ## 지키는 것은 pinpoint 와 같다
//
// 1. **판단하지 않는다.** 문장을 고를 뿐이고 그 문장이 옳은지 그른지 묻지 않는다
// 2. **글을 쓰지 않는다.** 돌려받는 것은 본문의 부분 문자열과 **고른 이유의 id** 뿐이다
// 3. **지어낸 것은 버린다.** 본문과 글자 대조, 이유는 목록 대조
import type { Env } from './index'

/** 게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 403 으로 막는다. */
const USER_AGENT = 'GenuEarly/0.0.0 (+https://github.com/sumin0218/GenuEarly)'

/** 한 기사에서 고를 문장 수. 하나에 네다섯 초라 셋이면 충분히 길다. */
const MAX_CLAIMS = 3
/** 문장 하나의 길이 상한(글자). */
const MAX_CLAIM_CHARS = 140

export interface Claim {
  /** **원문 그대로.** 본문과 글자 대조해 남은 것만 */
  text: string
  /** `REASONS` 안에 있는 id. 화면 문구는 packages/content 의 `report.picked` 가 들고 있다 */
  why: string
}

export type ClaimsResult =
  | { ok: true; claims: Claim[] }
  | { ok: false; reason: 'timeout' | 'upstream_error' | 'unusable' }

/**
 * 고를 수 있는 이유. **여기 없는 id 는 버린다.**
 *
 * 넷 다 "기록과 나란히 놓을 수 있는가" 를 가르는 말이지 **문제를 지적하는 말이 아니다.**
 * 신호가 없는 기사에도 그대로 붙는다.
 */
const REASONS: Readonly<Record<string, string>> = {
  kc_number: '숫자를 사실로 전한 문장. 수치, 금액, 비율, 건수',
  kc_event: '일어난 일을 사실로 전한 문장. 사건, 조치, 발표, 결정',
  kc_causal: '무엇 때문에 무엇이 됐다고 설명한 문장',
  kc_quote: '누군가의 발언을 옮긴 문장',
}

/**
 * 프롬프트는 **여기서만 만든다.** 확장 프로그램은 본문만 보낸다 —
 * 자유 텍스트 지시를 받으면 우리 키로 남이 생성 모델을 쓰는 길이 열린다.
 */
function buildPrompt(body: string): string {
  return [
    '아래 글에서 **다른 기록과 나란히 놓고 볼 수 있는 문장**을 골라 주세요.',
    '',
    '이 글이 수상한지 아닌지는 **묻지 않습니다.** 멀쩡한 기사에서도 고릅니다.',
    '고르는 기준은 하나입니다 — **그 문장이 말하는 것을 다른 기록에서 찾아볼 수 있는가.**',
    '',
    '고를 수 있는 이유 (이 중 하나의 id 를 그대로 적습니다):',
    ...Object.entries(REASONS).map(([id, what]) => `- ${id}: ${what}`),
    '',
    '규칙:',
    '- 글에 있는 글자를 **한 글자도 바꾸지 말고** 그대로 베낍니다. 요약하지 않습니다',
    `- **그 기사의 핵심부터 최대 ${MAX_CLAIMS}개**, 각 ${MAX_CLAIM_CHARS}자 이내`,
    '- 서로 다른 사실을 담은 문장을 고릅니다. 같은 내용을 두 번 고르지 않습니다',
    '- 기자 이름, 사진 설명, 다른 기사 안내는 고르지 않습니다',
    '- why 에는 위 목록의 id 를 **그대로** 적습니다. 목록에 없는 말을 적지 않습니다',
    '- 설명을 붙이지 않습니다. **JSON 배열 하나만** 돌려줍니다',
    '',
    `돌려줄 모양: [{"quote": "문장", "why": "${Object.keys(REASONS)[0]}"}]`,
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
 * 공백이 다른 것을 같은 것으로 본다. 기사 본문은 줄바꿈과 연속 공백이 섞여 있는데
 * 모델은 그것을 공백 하나로 옮겨 적는다 (pinpoint.ts 와 같은 이유).
 */
function foldSpace(s: string): { text: string; at: number[] } {
  const out: string[] = []
  const at: number[] = []
  let prevSpace = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string
    const space = /\s/.test(c)
    if (space && prevSpace) continue
    out.push(space ? ' ' : c)
    at.push(i)
    prevSpace = space
  }
  return { text: out.join(''), at }
}

/** **본문에 있고 이유가 아는 것인 것만** 남긴다. 돌려주는 것은 원문에서 잘라 낸 글이다. */
export function keepOnlyUsable(raw: readonly unknown[], body: string): Claim[] {
  const folded = foldSpace(body)
  const out: Claim[] = []
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue
    const { quote, why } = row as { quote?: unknown; why?: unknown }
    if (typeof quote !== 'string' || typeof why !== 'string') continue

    const asked = foldSpace(quote).text.trim()
    if (asked.length === 0 || asked.length > MAX_CLAIM_CHARS) continue
    const hit = folded.text.indexOf(asked)
    if (hit < 0) continue
    const start = folded.at[hit] as number
    const end = (folded.at[hit + asked.length - 1] as number) + 1
    const text = body.slice(start, end)
    if (!Object.hasOwn(REASONS, why)) continue
    if (out.some((x) => x.text === text)) continue

    out.push({ text, why })
    if (out.length >= MAX_CLAIMS) break
  }
  return out
}

/** 기사에서 나란히 볼 문장을 고른다. **실패는 오류가 아니라 "없음" 이다.** */
export async function pickClaims(env: Env, body: string): Promise<ClaimsResult> {
  const timeout = Number(env.EXPLAIN_TIMEOUT_MS) || 15000
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
        messages: [{ role: 'user', content: buildPrompt(body) }],
      }),
      signal: AbortSignal.timeout(timeout),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    console.warn(JSON.stringify({ at: 'claims', outcome: timedOut ? 'timeout' : 'network_error' }))
    return { ok: false, reason: timedOut ? 'timeout' : 'upstream_error' }
  }
  if (!res.ok) {
    // **원본 에러 본문을 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).
    console.warn(JSON.stringify({ at: 'claims', outcome: 'upstream_error', status: res.status }))
    return { ok: false, reason: 'upstream_error' }
  }

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string') return { ok: false, reason: 'unusable' }

  const parsed = parseArray(text)
  if (!parsed) return { ok: false, reason: 'unusable' }

  const claims = keepOnlyUsable(parsed, body)
  console.warn(JSON.stringify({ at: 'claims', got: parsed.length, kept: claims.length }))
  return { ok: true, claims }
}
