// 판단 결과를 **화면에 어떻게 보일지**. 기사 위 배지와 팝업이 같이 쓴다.
//
// 두 화면이 각자 계산하면 같은 기사가 자리에 따라 다르게 보인다.
// **판정 규칙이 아니다** — 판정은 `@genuearly/shared` 하나가 원본이고, 여기는 그 결과를
// 사람이 읽는 줄로 바꾸는 일만 한다.
//
// **사용자에게 보이는 말은 여기서 쓰지 않는다.** `packages/content` 가 원본이고
// 그 글은 ChatKHU 가 썼다 (GE-16, docs/product.md 6절).
// 여기 두는 것은 **글이 아닌 것** — 표시용 기호와 순서뿐이다.
import { ITEM_CAUTION_AT, SIGNAL_SCORE, type ItemResult } from '@genuearly/shared'
import content from '../../../packages/content/ui.ko.json'
import type { ArticleVerdict, DisplayLevel } from './protocol'

export const MARK: Record<DisplayLevel, string> = {
  PENDING: '⋯', SAFE: '🟢', CHECK: '🟡', CAUTION: '🔴', UNDETERMINED: '⚪',
}

/**
 * 항목 하나를 화면에 어떻게 보일지.
 *
 * `@genuearly/shared` 는 **기사 단계만** 정하고 항목별 단계는 두지 않는다 — 판정에 쓰이지 않기 때문이다.
 * 여기서만 쓰는 표시용 구분이라 같은 상수(`ITEM_CAUTION_AT`, 중간 보기 값)를 보고 가른다.
 */
export function itemLevel(r: ItemResult): DisplayLevel {
  if (r.score === null) return 'UNDETERMINED'
  if (r.score >= ITEM_CAUTION_AT) return 'CAUTION'
  return r.score >= SIGNAL_SCORE.neutral ? 'CHECK' : 'SAFE'
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
