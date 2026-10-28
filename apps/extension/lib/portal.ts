// ② 포털 목록 동그라미. **제목만 보고 판단한 것을 제목 옆에 표시한다**
// (docs/requirements.md 4절).
//
// 여기는 **화면에 닿지 않는 부분만** 둔다 — 어떤 링크가 기사인가, 동그라미를 어떻게 그릴 것인가.
// 실제 DOM 조작과 스크롤 추적은 entrypoints/portal.ts 에 있다. 그래야 테스트에서 부를 수 있다.
import { normalizeUrl } from './cache'
import { createIcon } from './icon'
import { LEVEL_ICON, inkFor } from './item-view'
import { isArticleUrl } from '../match-patterns'
import type { IconName } from './icon-data'
import type { DisplayLevel } from './protocol'

/**
 * 우리가 넣은 요소를 알아보는 이름. **페이지와 겹치지 않는 식별자를 쓴다**
 * (docs/security/secure-coding.md 4절).
 */
export const MARK_CLASS = 'genuearly-portal-mark'

/**
 * 제목으로 볼 최소 글자 수.
 *
 * 포털 목록은 같은 기사를 **여러 번 건다** — 썸네일 이미지, 제목, "더보기". 그중 글자가
 * 거의 없는 링크에 동그라미를 달면 이미지 위에 점 하나가 떠 있게 된다.
 * **측정으로 정한 값이 아니다.**
 */
export const MIN_HEADLINE_CHARS = 8

export interface PortalTitle {
  /** 원래 주소. 판단 요청과 캐시 키에 쓴다 */
  url: string
  headline: string
  anchor: HTMLAnchorElement
}

/**
 * 목록에서 **기사 제목 링크**를 골라낸다.
 *
 * **클래스 이름으로 찾지 않는다.** 포털의 클래스(`sa_text_title` 같은)는 예고 없이 바뀌고,
 * 바뀌면 ②가 조용히 아무것도 안 하게 된다. 대신 **링크가 가리키는 주소**를 본다 —
 * 그 주소가 ①이 배지를 띄울 수 있는 기사면 제목 링크다. 포털이 화면을 다시 그려도
 * 기사 주소의 모양은 그대로다.
 *
 * 같은 기사를 가리키는 링크가 여럿이면 **글자가 가장 긴 것**을 제목으로 본다.
 * 썸네일 링크는 글자가 없고 제목 링크에는 제목이 통째로 들어 있다.
 */
export function collectTitles(root: ParentNode): PortalTitle[] {
  const byUrl = new Map<string, PortalTitle>()
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.href
    if (!isArticleUrl(href)) continue
    const headline = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (headline.length < MIN_HEADLINE_CHARS) continue
    let key: string
    try {
      key = normalizeUrl(href)
    } catch {
      continue
    }
    const prev = byUrl.get(key)
    if (!prev || headline.length > prev.headline.length) {
      byUrl.set(key, { url: href, headline, anchor: a })
    }
  }
  return [...byUrl.values()]
}

/**
 * 동그라미의 근거. **제목만 본 것과 본문까지 본 것을 같은 생김새로 그리면 안 된다**
 * (requirements.md 4-3절).
 */
export type MarkBasis = 'headline' | 'full'

export interface MarkLook {
  /** 어느 아이콘을 쓸 것인가 */
  icon: IconName
  color: string
  /** 진한 벌(Filled)로 그리는가. 본문까지 본 판단일 때만 채운다 */
  filled: boolean
}

/**
 * 단계와 근거를 생김새로.
 *
 * **색으로 가르지 않는다.** 단계는 **아이콘 모양**이 가르고 색은 거든다 —
 * 세모 느낌표(주의) · 눈(확인) · 가로줄(신호 없음) · 물음표(보류) · 점 셋(도는 중).
 * 근거의 세기는 **굵기**가 가른다: 테두리 벌 = 제목만, 진한 벌 = 본문까지.
 * 둘 다 색각 이상에서도 구분된다.
 *
 * 전에는 1.5px 테두리를 두른 동그라미 안에 글자 기호를 넣었다. 테두리를 없앴다 —
 * 목록 한 화면에 서른 개가 뜨는데 가는 선 서른 줄이 글자보다 먼저 보였다
 * (taste-skill tells.md 4절: 가는 선은 구조가 아니다).
 *
 * > TODO: 근거의 차이를 **글자로도** 알려 줘야 한다. 지금은 생김새뿐이라 화면을 읽어 주는
 * > 도구에는 "제목만 보았다" 가 전달되지 않는다. "제목만" 에 해당하는 문구를
 * > ChatKHU 로 받아야 한다 (GE-16 의 4차).
 */
export function markLook(level: DisplayLevel, basis: MarkBasis, dark = false): MarkLook {
  return {
    icon: LEVEL_ICON[level],
    color: inkFor(level, dark),
    // 판단 중(점 셋)은 아직 근거가 없다. 근거가 생기기 전에 진하게 그리지 않는다.
    filled: basis === 'full' && level !== 'PENDING',
  }
}

/** 목록 제목 옆 표시의 변 길이(px). 제목 글자(보통 15~17px)보다 작게 둔다. */
const MARK_SIZE = 15

/**
 * 동그라미 하나를 만든다.
 *
 * **Shadow DOM 안에 둔다** (secure-coding.md 4절) — 포털의 CSS 가 우리 표시를 망가뜨리지 않고,
 * 우리 것도 목록 화면을 망가뜨리지 않는다. `mode: 'closed'` 라 포털 스크립트가 읽을 수도 없다.
 *
 * **`<style>` 요소를 넣지 않는다.** 포털 페이지의 CSP `style-src` 에 걸릴 수 있다.
 * 스타일은 전부 CSSOM(`el.style`)으로 준다 — CSP 가 막지 않는 길이다.
 * `innerHTML` 도 쓰지 않는다. 제목에 `<img onerror=…>` 가 들어 있을 수 있다.
 *
 * **어두운 화면을 `matchMedia` 로 본다.** 여기서는 CSS 미디어 쿼리를 쓸 수 없다 —
 * 스타일이 전부 인라인이기 때문이다. 밝은 쪽 색을 그대로 쓰면 어두운 목록에서
 * `#247b50` 이 2.4:1 로 가라앉는다 (lib/item-view.ts 의 `LEVEL_INK_DARK`).
 */
export function createMark(doc: Document) {
  const host = doc.createElement('span')
  host.className = MARK_CLASS
  // 글자 흐름 안에 끼어들되 줄 높이를 밀지 않는다.
  host.style.setProperty('display', 'inline-block')
  host.style.setProperty('vertical-align', 'middle')
  host.style.setProperty('margin-inline-end', '4px')

  const shadow = host.attachShadow({ mode: 'closed' })
  const dark = doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false

  function render(level: DisplayLevel, basis: MarkBasis, label: string): void {
    const look = markLook(level, basis, dark)
    const svg = createIcon(doc, look.icon, {
      size: MARK_SIZE,
      color: look.color,
      filled: look.filled,
    })
    // 목록 화면이 주인공이다. 표시가 제목보다 세면 안 된다 (requirements.md 4-2절).
    // **Shadow DOM 안에 둔다** — host 에 걸면 포털 스크립트가 우리 표시를 읽을 수 있다.
    svg.style.setProperty('opacity', '0.95')
    shadow.replaceChildren(svg)
    // 화면을 읽어 주는 도구와 마우스를 올렸을 때. **문구는 packages/content 가 원본이다.**
    host.setAttribute('role', 'img')
    host.setAttribute('aria-label', label)
    host.title = label
  }

  return { host, render }
}
