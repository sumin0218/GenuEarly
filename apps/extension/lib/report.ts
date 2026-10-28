// 심층 분석 리포트. **background 에서 돈다.**
//
// 팝업이 "만들어 줘" 하면 여기서 차례로 묻고, 되는 대로 `storage.session` 에 적는다.
// 팝업은 그 변화를 듣고 진행을 보이며, 다 되면 사용자가 리포트 탭을 연다.
//
// ## 왜 한 번에 돌려주지 않는가
//
// 주장 둘이면 **스무 초**가 걸린다 (검색 4초 × 2 + 대조 0.5초 × 6 + 글 11초).
// 그동안 팝업은 닫힐 수 있고, MV3 의 service worker 도 꺼질 수 있다.
// 메시지로 결과를 기다리면 둘 중 하나만 일어나도 통째로 날아간다.
//
// 그래서 **진행 상태를 저장소에 적는다.** 팝업이 닫혔다 열려도 이어서 보이고,
// 리포트 탭은 저장소만 읽으면 된다.
//
// ## 저장에 대하여
//
// **`storage.session` 이다. `local` 이 아니다.** 리포트에는 기사 본문 인용과
// 읽고 있던 주소가 들어 있어, 디스크에 남으면 그 자체가 열람 기록이 된다
// (docs/security/secure-coding.md 7절). session 은 브라우저를 닫으면 사라진다.
//
// 하나만 들고 있는다. 리포트를 새로 만들면 앞의 것은 지운다.
//
// **다 된 리포트는 따로 한 벌 보관된다** (lib/archive.ts). 그쪽은 `local` 이다 —
// 사용자가 직접 만든 것만, 사용자가 지울 수 있는 형태로 남는다.
import { saveToArchive } from './archive'
import { PROXY_URL, type ExplainLevel, type ReportRow } from './protocol'

/** 저장소 열쇠. 하나만 둔다 — 쌓이면 그것이 곧 열람 기록이다. */
export const REPORT_KEY = 'report'

/** 리포트에 들어갈 기록 하나. 중계 서버의 `Entry` 와 같은 모양이다. */
export interface ReportRecord {
  press: string
  date: string
  text: string
  url: string
  verdict: 'supports' | 'contradicts' | 'unrelated'
  confidence: number
  /** 기사 날짜와 견준 결과. **중계 서버의 코드가 정한다** */
  when: 'same' | 'other' | 'unknown'
}

/** 조사한 주장 하나. */
export interface ReportClaim {
  text: string
  /** 왜 집어 왔는지. **ChatKHU 가 미리 쓴 문구다** */
  why: string
  records: ReportRecord[]
  /** 아직 조사 중이면 참 */
  pending?: boolean
}

/** 엮은 글. 걸러진 자리는 아예 없다. */
export interface ReportBrief {
  summary?: string
  checks: { claim: string; what: string }[]
  where: string[]
}

/**
 * 리포트 한 건. **만드는 동안에도 같은 모양으로 저장된다** — 팝업과 리포트 탭이
 * 같은 것을 읽고, 단계마다 화면을 채운다.
 */
export interface Report {
  /** 어느 기사인가 */
  url: string
  headline: string
  date: string
  /** 만든 시각(ms). 리포트 탭이 "조사 시각" 으로 보인다 */
  at: number
  /** 지금 무엇을 하고 있는가 */
  stage: 'claims' | 'records' | 'brief' | 'done' | 'failed'
  /** 기사를 열었을 때 나온 판정 줄. **여기서 다시 판단하지 않는다** */
  rows: ReportRow[]
  /** 조사한 주장들 */
  claims: ReportClaim[]
  brief?: ReportBrief
  /** 실패했으면 왜 */
  reason?: string
}

/**
 * **걸렸을 때 그 자리를 보충할 수 있는 항목.** 둘뿐이다.
 *
 * 나머지 다섯은 공개 기록으로 대조할 것이 없다 — "분노를 자극하는 표현" 이나
 * "제목이 내용을 감춘다" 는 글의 성질이지 사실 주장이 아니다.
 *
 * **이것이 리포트의 조건은 아니다.** 리포트는 신호가 없어도 만든다 —
 * 주된 일은 주변 기록을 모으는 것이고, 보충은 곁다리다 (buildReport 머리말).
 */
export const CLAIM_ITEMS = ['unverifiable_claim', 'source_citation'] as const
/** 한 리포트에서 조사할 주장 수. 하나에 네다섯 초라 넷이면 너무 길다. */
const MAX_CLAIMS = 3

async function put(report: Report): Promise<void> {
  try {
    await browser.storage.session.set({ [REPORT_KEY]: report })
  } catch {
    // 못 써도 흐름은 이어 간다. 팝업이 진행을 못 볼 뿐이다.
  }
}

/** 지금 들고 있는 리포트. 없으면 `null`. */
export async function peekReport(): Promise<Report | null> {
  try {
    const got = (await browser.storage.session.get(REPORT_KEY)) as Record<string, Report | undefined>
    return got[REPORT_KEY] ?? null
  } catch {
    return null
  }
}

/** 리포트를 버린다. 탭을 닫거나 새로 만들 때 부른다. */
export async function clearReport(): Promise<void> {
  try {
    await browser.storage.session.remove(REPORT_KEY)
  } catch {
    /* 못 지워도 session 이라 브라우저를 닫으면 사라진다 */
  }
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${PROXY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[GenuEarly] 리포트 거절', path, res.status)
      return null
    }
    return (await res.json()) as T
  } catch (e) {
    console.warn('[GenuEarly] 리포트 요청이 닿지 못했다', path, e)
    return null
  }
}

/**
 * 조사할 문장을 고른다. **두 곳에서 온다.**
 *
 *   ① 나란히 볼 문장 — **판정과 무관하게 늘** 고른다 (/v1/claims).
 *      이것이 리포트의 주된 일이다. 초록 기사에도 주변 기록은 있다
 *   ② 걸린 항목의 대목 — 🔴·🟡 이 있을 때만 더한다 (/v1/explain).
 *      **곁다리다.** 부족한 자리를 보충한다
 *
 * ②를 **뒤에** 놓는다. 앞자리는 기사의 핵심이 차지해야 한다 —
 * 신호를 앞세우면 리포트가 다시 "흠잡기" 로 읽힌다.
 */
async function gatherClaims(body: string, rows: readonly ReportRow[]): Promise<ReportClaim[]> {
  const out: ReportClaim[] = []

  // ① 늘 한다
  const picked = await post<{ claims?: { text: string; why: string }[] }>('/v1/claims', { body })
  for (const c of picked?.claims ?? []) {
    if (out.some((x) => x.text === c.text)) continue
    out.push({ text: c.text, why: c.why, records: [], pending: true })
    if (out.length >= MAX_CLAIMS) return out
  }

  // ② 걸린 자리를 보충한다
  for (const itemId of CLAIM_ITEMS) {
    const level = rows.find((r) => r.id === itemId)?.level
    if (level !== 'CAUTION' && level !== 'CHECK') continue
    const got = await post<{ picks?: { text: string; why: string }[] }>('/v1/explain', {
      itemId,
      level: level satisfies ExplainLevel,
      body,
    })
    for (const p of got?.picks ?? []) {
      if (out.some((c) => c.text === p.text)) continue
      out.push({ text: p.text, why: p.why, records: [], pending: true })
      if (out.length >= MAX_CLAIMS) return out
    }
  }
  return out
}

/**
 * 리포트를 만든다. **단계마다 저장소에 적는다** — 팝업이 그것을 보고 진행을 그린다.
 *
 * **주된 일은 주변 기록을 모으는 것이다.** 한 기사가 전하지 못하는 것이 있다 —
 * 같은 사안을 다른 매체가 어떻게 적었는지, 숫자가 보도마다 어떻게 다른지.
 * 그래서 **신호가 없어도 만든다.** 걸린 항목을 보충하는 것은 곁다리다.
 *
 * `rows` 는 일곱 항목의 판정 줄이다. 팝업이 이미 그리고 있는 값을 그대로 넘긴다 —
 * **여기서 다시 판단하지 않는다.** 리포트와 배지가 다른 말을 하면 사용자는
 * 둘 중 어느 쪽도 믿지 못한다.
 */
export async function buildReport(
  article: { url: string; headline: string; date: string; body: string },
  rows: ReportRow[],
): Promise<Report> {
  const base = { ...article, at: Date.now(), rows }

  let report: Report = { ...base, stage: 'claims', claims: [] }
  await put(report)

  const claims = await gatherClaims(article.body, rows)
  if (claims.length === 0) {
    report = { ...report, stage: 'failed', reason: 'no_claims' }
    await put(report)
    return report
  }

  report = { ...report, stage: 'records', claims }
  await put(report)

  // **주장 하나씩 묻고 그때마다 적는다.** 한꺼번에 기다리면 스무 초 동안 아무것도 안 보인다.
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i] as ReportClaim
    const got = await post<{ records?: ReportRecord[] }>('/v1/records', {
      claim: c.text,
      articleDate: article.date,
      articleUrl: article.url,
    })
    const next = [...report.claims]
    next[i] = { ...c, records: got?.records ?? [], pending: false }
    report = { ...report, claims: next }
    await put(report)
  }

  report = { ...report, stage: 'brief' }
  await put(report)

  const woven = await post<{ brief?: ReportBrief | null }>('/v1/brief', {
    headline: article.headline,
    articleDate: article.date,
    claims: report.claims.map((c) => ({ text: c.text, why: c.why, records: c.records })),
  })

  // **글이 없어도 리포트는 끝난 것이다.** 기록과 인용은 이미 있다.
  report = { ...report, stage: 'done', ...(woven?.brief ? { brief: woven.brief } : {}) }
  await put(report)

  // **아카이브에 넣는 자리는 여기 하나뿐이다.** 다 된 것만, 사용자가 버튼을 눌러
  // 만든 것만 남는다 — 기사를 열기만 해서는 한 줄도 쌓이지 않는다 (lib/archive.ts).
  await saveToArchive(report)
  return report
}
