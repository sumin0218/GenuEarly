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
import type { ItemResult } from '@genuearly/shared'
import schema from '@genuearly/shared/judgment-items.json'
import content from '../../../packages/content/ui.ko.json'

/** 유효 기간. 기사는 수정된다. 근거가 약한 값이라 실제 사용을 보고 조정한다 (requirements.md 3-6). */
const TTL_MS = 6 * 60 * 60 * 1000

/**
 * 캐시에 담는 항목 결과. `@genuearly/shared` 의 `ItemResult` 에서 **저장할 것만** 추린다.
 *
 * `isConfident` 가 꼭 있어야 한다 — `decideBadge` 가 🔴·🟢 을 가를 때 쓴다.
 * 점수만 저장하면 캐시에서 읽은 항목이 전부 "확신하지 못한 것" 으로 취급돼
 * **같은 기사가 두 번째 열 때 다른 배지를 준다.**
 */
export type CachedItem = Pick<ItemResult, 'score' | 'isConfident' | 'reason'> & {
  /**
   * **무엇을 보고 낸 판단인가** — 그 항목을 보낸 요청 그룹 이름.
   *
   * 없으면 이런 일이 생긴다. `spread_inducement` 는 ①에서 `headline_body`(제목+본문),
   * ②에서 `headline_only`(제목만)다. 캐시 키가 항목 id 하나뿐이면 **②가 제목만 보고 낸 값을
   * ①이 "이미 있다" 고 보고 본문으로 다시 묻지 않는다.** 본문 끝의 "꼭 공유해 주세요" 를
   * 6시간 동안 못 본다 (리뷰 #22).
   *
   * 목록에서 눌러 들어가는 것이 기사를 여는 **가장 흔한 길**이라 흔하게 걸린다.
   */
  g?: string
  /**
   * 판단에 쓴 **제목의 지문**(해시 앞 12자리). 제목을 보는 그룹에만 둔다.
   *
   * ②는 목록 링크의 글자를 제목으로 쓰는데, 거기에는 "동영상"·재생 시간·언론사 이름이
   * 섞이거나 포털이 긴 제목을 줄여 `…` 를 붙여 놓기도 한다. `clickbait_headline` 의 기준이
   * 바로 "말줄임표로 궁금증만 남긴다" 라서 **글자가 다르면 판정도 달라진다.**
   * ①이 그 값을 기사 페이지의 진짜 제목에 대한 판단으로 쓰면 안 된다 (리뷰 #22).
   *
   * **제목 글자를 저장하지 않는다.** 해시만 둔다 — 캐시가 열람 기록이 되지 않게 하는
   * 규칙 그대로다 (docs/security/secure-coding.md 7절).
   */
  h?: string
}

/**
 * 글의 지문. 같은 글인지만 가리면 되므로 짧게 자른다.
 *
 * **되돌릴 수 없어야 한다.** 그래서 URL 키와 같은 SHA-256 을 쓴다.
 * 글자를 저장하지 않고 "같은 글인가" 만 확인해야 하는 자리에 쓴다.
 */
export async function textFingerprint(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.replace(/\s+/g, ' ').trim())
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 제목의 지문. 같은 제목인지만 가린다. */
export const headlineFingerprint = textFingerprint

/**
 * 캐시에 있는 이 항목을 **지금 보내려는 요청 대신 쓸 수 있는가.**
 *
 * 같은 근거로 낸 판단일 때만 그렇다 — 요청 그룹이 같고, 제목을 보는 그룹이면 제목도 같아야 한다.
 * 그룹을 적지 않고 저장된 **옛 항목은 쓰지 않는다.** 무엇을 보고 낸 것인지 알 수 없다.
 */
export function isReusable(c: CachedItem | undefined, group: string, headlineFp?: string): boolean {
  if (!c) return false
  if (c.g !== group) return false
  if (headlineFp !== undefined && c.h !== headlineFp) return false
  return true
}

/** 항목 id → 결과. */
export type ItemScores = Record<string, CachedItem>

interface Entry {
  /** 질문 세트 버전. 다르면 버린다 — 다른 기준으로 낸 판단이다 */
  v: string
  /** 모델 버전 */
  m: string
  /** 만료 시각(ms). **판단 시각은 두지 않는다** */
  exp: number
  items: ItemScores
  /** 심층 분석 답. 항목 id → 그 항목에 받은 답 */
  explain?: Record<string, CachedExplain>
}

/**
 * 떼어 온 문장 하나를 **글자 없이** 적어 둔 것.
 *
 * **기사 글을 저장하지 않는다는 규칙을 심층 분석에서도 지킨다** (이 파일 머리말).
 * 본문에서의 자리(`s`~`e`)와 그 글자의 지문(`q`)만 둔다. 읽을 때 본문을 다시 잘라
 * 지문을 맞춰 보고, 기사가 고쳐졌으면 맞지 않으므로 **그냥 버린다.**
 */
export interface CachedPick {
  /** 본문에서의 시작 자리 */
  s: number
  /** 끝 자리 */
  e: number
  /** 그 자리 글자의 지문. 기사가 고쳐졌는지 가린다 */
  q: string
  /** 고른 이유 id. 짝 문구는 packages/content 가 들고 있다 */
  w: string
}

/**
 * 심층 분석 답 하나. **같은 기사를 다시 열면 같은 답을 보인다.**
 *
 * 생성 모델은 같은 글에도 매번 다르게 답한다. 눌렀다 접었다 하면 짚는 문장이 바뀌는데,
 * 그러면 사용자는 어느 쪽을 믿어야 할지 알 수 없다. 한 번 받은 답을 들고 있는다
 * (크레딧도 그만큼 아낀다).
 */
export interface CachedExplain {
  /** 그때의 판정. 배지가 달라졌으면 다시 묻는다 — 판정이 프롬프트에 들어간다 */
  lv: string
  /**
   * 그때의 문구 묶음 버전.
   *
   * 고른 이유의 id 와 화면 문구는 짝이다. 문구를 고치거나 이유를 더하면 적어 둔 답이
   * **낡은 짝**이 된다 — 짝이 없는 id 는 화면에서 조용히 빠져 빈 줄이 된다.
   * 버전이 다르면 다시 묻는다.
   */
  cv?: string
  /** Jev 가 잰 것. 참·거짓뿐이라 글자가 섞이지 않는다 */
  f: Record<string, boolean>
  /** LLM 이 집어 온 자리 */
  p: CachedPick[]
}

/** 떼어 온 글자를 **자리와 지문으로** 바꾼다. 본문에 없는 것은 버린다. */
export async function packPicks(
  body: string,
  picks: readonly { text: string; why: string }[],
): Promise<CachedPick[]> {
  const out: CachedPick[] = []
  for (const x of picks) {
    const s = body.indexOf(x.text)
    if (s < 0) continue
    out.push({ s, e: s + x.text.length, q: await textFingerprint(x.text), w: x.why })
  }
  return out
}

/**
 * 자리를 다시 글자로 푼다.
 *
 * **지문이 맞는 것만 돌려준다.** 기사가 고쳐져 자리가 밀렸으면 엉뚱한 글자를 인용하게
 * 되는데, 그것은 지어낸 인용과 다르지 않다.
 */
export async function unpackPicks(
  body: string,
  packed: readonly CachedPick[],
): Promise<{ text: string; why: string }[]> {
  const out: { text: string; why: string }[] = []
  for (const x of packed) {
    const text = body.slice(x.s, x.e)
    if (text.length === 0) continue
    if ((await textFingerprint(text)) !== x.q) continue
    out.push({ text, why: x.w })
  }
  return out
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
    const live = old && old.v === schema.version && old.m === schema.model && old.exp > Date.now()
    const entry: Entry = {
      v: schema.version,
      m: schema.model,
      exp: Date.now() + TTL_MS,
      items: { ...(live ? old.items : {}), ...items },
      // **심층 분석 답을 함께 들고 간다.** 빠뜨리면 점수를 쓸 때마다 지워진다 —
      // 기사를 다시 열 때마다 점수가 먼저 쓰이므로, 받아 둔 답이 한 번도 살아남지 못한다.
      ...(live && old.explain ? { explain: old.explain } : {}),
    }
    await browser.storage.local.set({ [key]: entry })
  } catch {
    // 못 써도 판단은 이미 끝났다. 다음에 다시 부를 뿐이다.
  }
}

/**
 * 이 기사·항목에 **이미 받아 둔 심층 분석 답**. 없거나 판정이 달라졌으면 비어 있다.
 *
 * 점수와 같은 칸(같은 키, 같은 만료)에 둔다. 따로 두면 지우는 자리가 둘이 되고,
 * 한쪽만 지우면 열람 기록이 남는다.
 */
export async function readExplain(
  url: string,
  itemId: string,
  level: string,
): Promise<CachedExplain | undefined> {
  try {
    const key = await keyFor(url)
    const got = (await browser.storage.local.get(key)) as Record<string, Entry | undefined>
    const e = got[key]
    if (!e || e.v !== schema.version || e.m !== schema.model || e.exp <= Date.now()) return undefined
    const hit = e.explain?.[itemId]
    if (!hit) return undefined
    // 판정이 바뀌었으면 그때 받은 답은 다른 질문의 답이다 (판정이 프롬프트에 들어간다).
    if (hit.lv !== level) return undefined
    if (hit.cv !== CONTENT_VERSION) return undefined
    return hit
  } catch {
    return undefined
  }
}

/** 문구 묶음 버전. 이것이 바뀌면 적어 둔 심층 분석 답을 버린다. */
const CONTENT_VERSION: string = (content as { version?: string }).version ?? '0'

/**
 * 받은 심층 분석 답을 적어 둔다. **만료는 점수와 같이 센다.**
 *
 * **빈 답은 적지 않는다.** 못 찾은 것은 대개 한 번의 실패이거나 그때의 물음이 빗나간
 * 것이고, 그것을 적어 두면 **빈 화면이 여섯 시간 굳는다.** 실제로 그렇게 굳었다.
 * 다음에 다시 묻는 편이 낫다.
 */
export async function writeExplain(
  url: string,
  itemId: string,
  value: CachedExplain,
): Promise<void> {
  if (value.p.length === 0 && Object.keys(value.f).length === 0) return
  try {
    const key = await keyFor(url)
    const got = (await browser.storage.local.get(key)) as Record<string, Entry | undefined>
    const old = got[key]
    const live = old && old.v === schema.version && old.m === schema.model && old.exp > Date.now()
    const entry: Entry = {
      v: schema.version,
      m: schema.model,
      // **만료를 다시 세지 않는다.** 심층 분석을 누를 때마다 미뤄지면 점수까지 함께
      // 오래 남는다. 점수를 받은 그 시각이 기준이다.
      exp: live ? old.exp : Date.now() + TTL_MS,
      items: live ? old.items : {},
      explain: { ...(live ? old.explain : {}), [itemId]: { ...value, cv: CONTENT_VERSION } },
    }
    await browser.storage.local.set({ [key]: entry })
  } catch {
    // 못 써도 화면에는 이미 떴다. 다음에 다시 물을 뿐이다.
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
