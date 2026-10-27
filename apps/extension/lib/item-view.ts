// 판단 결과를 **화면에 어떻게 보일지**. 기사 위 배지와 팝업이 같이 쓴다.
//
// 두 화면이 각자 계산하면 같은 기사가 자리에 따라 다르게 보인다.
// **판정 규칙이 아니다** — 판정은 `@genuearly/shared` 하나가 원본이고, 여기는 그 결과를
// 사람이 읽는 줄로 바꾸는 일만 한다.
//
// **사용자에게 보이는 말은 여기서 쓰지 않는다.** `packages/content` 가 원본이고
// 그 글은 ChatKHU 가 썼다 (GE-16, docs/product.md 6절).
// 여기 두는 것은 **글이 아닌 것** — 표시용 기호와 순서뿐이다.
import { ITEM_CAUTION_AT, SAFE_BELOW, type ItemResult } from '@genuearly/shared'
import content from '../../../packages/content/ui.ko.json'
import type { IconName } from './icon-data'
import type { ArticleVerdict, DisplayLevel } from './protocol'

/**
 * 단계마다의 아이콘. **그림이 들어갈 자리가 있는 곳**이 쓴다 — 팝업 머리말, 기사 배지, 목록 동그라미.
 *
 * 전에는 색 동그라미 이모지(`🟢🟡🔴⚪`)였다. 두 가지가 잘못이었다.
 *
 *   1. **색으로만 갈렸다.** 넷이 전부 같은 동그라미라 적록색각 이상에서는 🟢 와 🔴 가
 *      같아 보인다. 색각 이상을 생각해 글자 기호를 따로 둔 `GLYPH` 가 아래 있는데,
 *      정작 사람이 가장 오래 보는 팝업과 배지가 이모지를 쓰고 있었다
 *   2. 이모지는 **글꼴이 그린다.** 윈도우·맥·안드로이드가 서로 다른 그림을 보여 주고,
 *      `🟡` 는 플랫폼에 따라 주황에 가깝다 — 우리가 단계별로 정한 색이 지켜지지 않는다
 *
 * 지금은 **모양이 서로 다른 아이콘**이다. 색은 거들 뿐이다.
 *
 * | 단계 | 아이콘 | 왜 |
 * |---|---|---|
 * | CAUTION | 세모 느낌표 | 모양 자체가 다르다. 색을 못 봐도 가장 먼저 눈에 띈다 |
 * | CHECK | 눈 | 문구가 "확인해 볼 점 있음" 이다 — **보라**는 뜻이다 |
 * | SAFE | 동그라미 안 가로줄 | **체크표(✓)를 쓰지 않는다.** 아래를 본다 |
 * | UNDETERMINED | 동그라미 안 물음표 | 판단을 못 했다 |
 * | PENDING | 점 셋 | 도는 중 |
 *
 * **SAFE 에 체크표를 쓰지 않는 것이 중요하다.** 체크표는 "확인했다 · 맞다 · 검증됨" 으로
 * 읽힌다. 우리는 참·거짓을 말하지 않는다 (docs/product.md 2절). ChatKHU 가 쓴 문구도
 * 그래서 SAFE 를 **"눈에 띄는 신호 없음"** 으로 썼다 — 신호를 못 찾았다는 말이지
 * 기사가 사실이라는 말이 아니다. 아이콘이 문구보다 먼저 읽히므로 아이콘이 그 선을 넘으면
 * 문구를 아무리 조심해 써도 소용없다.
 */
export const LEVEL_ICON: Record<DisplayLevel, IconName> = {
  PENDING: 'more-h',
  SAFE: 'minus-circle',
  CHECK: 'eye',
  CAUTION: 'alert-triangle',
  UNDETERMINED: 'help-circle',
}

/**
 * **글자밖에 못 넣는 곳**에서 쓰는 기호.
 *
 * 지금은 한 곳뿐이다 — 크롬 툴바의 아이콘 배지. `chrome.action.setBadgeText` 는
 * 글자만 받는다. SVG 도 이모지도 넣을 수 없다.
 *
 * **여기에 사용자에게 보이는 말을 쓰지 않는다.** 한때 `'안심'` 이라고 적어 두었는데,
 * ChatKHU 가 쓴 문구는 SAFE 를 일부러 "눈에 띄는 신호 없음" 으로 썼다 (위와 같은 이유).
 *
 * **모양이 서로 다르다.** 색만으로는 색각 이상에서 구분되지 않는다.
 */
export const GLYPH: Record<DisplayLevel, string> = {
  PENDING: '…', SAFE: '○', CHECK: '△', CAUTION: '!', UNDETERMINED: '?',
}

/**
 * 단계의 색. **밝은 바탕 위**의 값이다.
 *
 * 전부 흰 바탕에서 **4.5:1 이상**이다. 전에 쓰던 값은 그렇지 않았다 —
 * `#f29900`(CHECK)은 2.25:1, `#9aa0a6`(PENDING)은 2.64:1 로 그래픽 기준 3:1 에도
 * 못 미쳤다. 목록 동그라미는 이 색이 곧 글자 색이라 흐린 화면에서 보이지 않았다.
 *
 * 아이콘 배지(`setBadgeBackgroundColor`)는 이 값을 **바탕**으로 쓰고 글자는 흰색이다.
 * 흰 글자가 얹히므로 여기 값이 어두워야 읽힌다 — 같은 수치가 양쪽을 만족한다.
 */
export const LEVEL_INK: Record<DisplayLevel, string> = {
  PENDING: '#6b6b6b',        // 5.33:1
  SAFE: '#247b50',           // 5.22:1
  CHECK: '#9a5b00',          // 5.43:1
  CAUTION: '#c4242a',        // 5.78:1
  UNDETERMINED: '#5f6368',   // 6.05:1
}

/**
 * **어두운 바탕 위**의 같은 색. `#111` 기준으로 전부 4.5:1 이상이다.
 *
 * 밝은 쪽 값을 그대로 쓰면 어두운 바탕에서 가라앉는다 (`#247b50` 은 `#111` 위에서 2.4:1).
 * 어두운 화면은 **흐린 글자에서 먼저 무너진다** (taste-skill colour.md 6절).
 */
export const LEVEL_INK_DARK: Record<DisplayLevel, string> = {
  PENDING: '#949494',        // 6.22:1
  SAFE: '#3fc07a',           // 8.12:1
  CHECK: '#f0b429',          // 10.13:1
  CAUTION: '#f87171',        // 6.83:1
  UNDETERMINED: '#b4b4b4',   // 9.11:1
}

/** 지금 화면이 어두운가. 목록 동그라미처럼 **CSS 미디어 쿼리를 쓸 수 없는 곳**이 쓴다. */
export function inkFor(level: DisplayLevel, dark: boolean): string {
  return (dark ? LEVEL_INK_DARK : LEVEL_INK)[level]
}

/**
 * 항목 하나를 화면에 어떻게 보일지.
 *
 * `@genuearly/shared` 는 **기사 단계만** 정하고 항목별 단계는 두지 않는다 — 판정에 쓰이지 않기 때문이다.
 * 여기서만 쓰는 표시용 구분이라 판정이 쓰는 상수를 그대로 보고 가른다.
 *
 * **🟡 의 경계가 `SAFE_BELOW` 다.** 한때 중간 보기 값(0.5)을 썼는데, 그러면 기사 배지와
 * 항목 줄이 **서로 다른 말을 한다** — 가중평균이 0.3~0.5 사이면 배지는 🟡 "확인해 볼 점 있음"
 * 인데 일곱 줄이 전부 🟢 "…가 보이지 않습니다" 가 된다. 사용자는 무엇을 확인하라는 것인지
 * 알 수 없다. 배지가 🟢 를 그만두는 자리와 항목이 🟢 를 그만두는 자리는 같아야 한다.
 */
export function itemLevel(r: ItemResult): DisplayLevel {
  if (r.score === null) return 'UNDETERMINED'
  if (r.score >= ITEM_CAUTION_AT) return 'CAUTION'
  return r.score >= SAFE_BELOW ? 'CHECK' : 'SAFE'
}

/** 걸린 것이 위로 온다. */
const ORDER: Record<DisplayLevel, number> = {
  CAUTION: 0, CHECK: 1, UNDETERMINED: 2, SAFE: 3, PENDING: 4,
}

export interface ItemRow {
  id: string
  level: DisplayLevel
  icon: IconName
  name: string
  text: string
}

/**
 * 판정 하나를 화면에 그릴 줄들로.
 *
 * **일곱 항목을 전부 돌려준다.** 걸린 것만 보여 주면 무엇을 검사했는지 알 수 없고,
 * 그러면 ⚪ 항목도 맥락 없이 읽힌다 (docs/requirements.md 3-4절).
 *
 * **점수 숫자는 넣지 않는다.** 정밀해 보이는 숫자는 단정으로 읽힌다 (docs/product.md 6절).
 */
export function toRows(verdict: ArticleVerdict | undefined): ItemRow[] {
  return (verdict?.items ?? [])
    .flatMap((it): ItemRow[] => {
      const c = content.items[it.id as keyof typeof content.items] as
        | { name: string; safe: string; signal: string; undetermined: string }
        | undefined
      if (!c) return []
      const level = itemLevel(it)
      const text = level === 'UNDETERMINED' ? c.undetermined : level === 'SAFE' ? c.safe : c.signal
      return [{ id: it.id, level, icon: LEVEL_ICON[level], name: c.name, text }]
    })
    .sort((a, b) => ORDER[a.level] - ORDER[b.level])
}
