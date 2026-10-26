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
import type { ArticleVerdict, DisplayLevel } from './protocol'

export const MARK: Record<DisplayLevel, string> = {
  PENDING: '⋯', SAFE: '🟢', CHECK: '🟡', CAUTION: '🔴', UNDETERMINED: '⚪',
}

/**
 * **글자가 들어갈 자리가 없는 곳**에서 쓰는 기호와 색.
 *
 * 아이콘 배지(네 글자 남짓)와 포털 목록 동그라미(제목 옆 한 칸)가 함께 쓴다.
 * 배지 상세·팝업처럼 설명 문구를 옆에 붙일 수 있는 곳은 위의 `MARK` 를 쓴다.
 *
 * **여기에 사용자에게 보이는 말을 쓰지 않는다.** 한때 아이콘 배지에 `'안심'` 이라고 적어
 * 두었는데, ChatKHU 가 쓴 문구는 SAFE 를 일부러 **"눈에 띄는 신호 없음"** 으로 썼다 —
 * 우리는 신호를 못 찾은 것이지 안심해도 된다고 말한 적이 없다 (docs/product.md 2절).
 *
 * **모양이 서로 다르다.** 색만으로는 색각 이상에서 구분되지 않는다.
 */
export const GLYPH: Record<DisplayLevel, string> = {
  PENDING: '…', SAFE: '○', CHECK: '△', CAUTION: '!', UNDETERMINED: '?',
}
export const LEVEL_COLOR: Record<DisplayLevel, string> = {
  PENDING: '#9aa0a6', SAFE: '#1e8e3e', CHECK: '#f29900', CAUTION: '#d93025', UNDETERMINED: '#5f6368',
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
  mark: string
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
      return [{ id: it.id, level, mark: MARK[level], name: c.name, text }]
    })
    .sort((a, b) => ORDER[a.level] - ORDER[b.level])
}
