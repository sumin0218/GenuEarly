// 판단 결과 캐시.
//
// **기사 본문도 URL 원문도 넣지 않는다.** 캐시가 곧 열람 기록이 되면 안 된다 —
// `storage.local.get(null)` 한 번이면 "최근에 읽은 기사와 그 시각" 목록이 나온다
// (docs/security/secure-coding.md 7절, docs/architecture.md 6절).
//
// 그래서 셋을 지킨다.
//   - 키는 **정규화한 URL 의 SHA-256**. 원문을 두지 않는다
//   - **판단 시각 대신 만료 시각만** 둔다. 언제 읽었는지가 남지 않는다
//   - 값은 **항목별 점수**까지다. 기사 글은 한 글자도 넣지 않는다
import schema from '../../../packages/shared/judgment-items.json'

/** 유효 기간. 기사는 수정된다. 근거가 약한 값이라 실제 사용을 보고 조정한다 (requirements.md 3-6). */
const TTL_MS = 6 * 60 * 60 * 1000

/** 항목별 점수. 0(안심) ~ 1(주의), `null` 은 판단 보류. */
export type ItemScores = Record<string, number | null>

interface Entry {
  /** 질문 세트 버전. 다르면 버린다 — 다른 기준으로 낸 판단이다 */
  v: string
  /** 모델 버전 */
  m: string
  /** 만료 시각(ms). **판단 시각은 두지 않는다** */
  exp: number
  items: ItemScores
}

/**
 * 같은 기사가 여러 키로 갈라지지 않게 주소를 정리한다.
 *
 * 네이버는 같은 기사를 `/article/…` 과 `/mnews/article/…` 두 경로로 준다.
 * 쿼리(`sid`, `utm_*`, `cds`…)는 기사를 가리는 데 쓰이지 않으므로 **전부 버린다** —
 * 우리가 보는 사이트가 둘뿐이라 이 단순한 규칙이 안전하다.
 */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw)
  u.hash = ''
  u.search = ''
  u.protocol = 'https:'
  u.hostname = u.hostname.toLowerCase()
  u.pathname = u.pathname.replace('/mnews/article/', '/article/').replace(/\/+$/, '')
  return u.toString()
}

async function keyFor(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeUrl(url))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `judgment:${hex}`
}

/**
 * 캐시에 있는 항목별 점수를 돌려준다. 만료됐거나 버전이 다르면 비어 있다.
 *
 * **"캐시 있음" 판정을 여기서 하지 않는다.** 부르는 쪽이 자기에게 필요한 항목이
 * 다 있는지 본다 — ②는 제목 항목만 채우므로 ①이 그것만 보고 넘어가면 안 된다.
 */
export async function readScores(url: string): Promise<ItemScores> {
  try {
    const key = await keyFor(url)
    const got = (await browser.storage.local.get(key)) as Record<string, Entry | undefined>
    const e = got[key]
    if (!e) return {}
    if (e.v !== schema.version || e.m !== schema.model) return {}
    if (e.exp <= Date.now()) return {}
    return e.items ?? {}
  } catch {
    // 저장소를 못 읽는 것은 판단을 막을 이유가 아니다. 캐시가 없는 것으로 본다.
    return {}
  }
}

/** 새로 얻은 항목을 기존 것 위에 덮어 쓴다. 만료는 쓸 때마다 다시 센다. */
export async function writeScores(url: string, items: ItemScores): Promise<void> {
  if (Object.keys(items).length === 0) return
  try {
    const key = await keyFor(url)
    const got = (await browser.storage.local.get(key)) as Record<string, Entry | undefined>
    const old = got[key]
    const keep = old && old.v === schema.version && old.m === schema.model && old.exp > Date.now()
      ? old.items
      : {}
    const entry: Entry = {
      v: schema.version,
      m: schema.model,
      exp: Date.now() + TTL_MS,
      items: { ...keep, ...items },
    }
    await browser.storage.local.set({ [key]: entry })
  } catch {
    // 못 써도 판단은 이미 끝났다. 다음에 다시 부를 뿐이다.
  }
}

/** 만료된 항목을 비운다. **열람 기록을 남기지 않으려면 지우는 것도 중요하다.** */
export async function sweepExpired(): Promise<number> {
  try {
    const all = (await browser.storage.local.get(null)) as Record<string, unknown>
    const dead = Object.entries(all)
      .filter(([k, v]) => k.startsWith('judgment:') && (v as Entry)?.exp <= Date.now())
      .map(([k]) => k)
    if (dead.length) await browser.storage.local.remove(dead)
    return dead.length
  } catch {
    return 0
  }
}

export const CACHE_TTL_MS = TTL_MS
