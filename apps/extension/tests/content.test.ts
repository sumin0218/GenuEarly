// 사용자에게 보이는 문구의 규칙을 검사한다.
//
// **문구 하나가 단정적으로 쓰여 있으면 제품의 전제가 무너진다** (docs/product.md 2절).
// 사람이 읽고 넘기는 것에 기대지 않는다. 문구는 앞으로 ChatKHU 로 다시 만들 수도 있고,
// 그때 이 검사가 유일한 관문이다.
import { describe, expect, it } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import schema from '../../../packages/shared/judgment-items.json'

/** 문구 안의 모든 문자열을 자리 이름과 함께 편다. */
function strings(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

/**
 * `$comment`·`source` 는 사용자에게 보이지 않는다. 규칙 검사에서 뺀다.
 *
 * **어느 깊이에 있든 뺀다.** 맨 위만 보면 `app.$comment` 같은 중간 주석이
 * 사용자 문구로 세어져 길이·말투 검사에 걸린다.
 */
const visible = strings(content).filter(
  ([p]) => !p.split('.').includes('$comment') && !p.startsWith('source'),
)

describe('단정하지 않는다', () => {
  // docs/product.md 2절. 이 제품은 기사가 참인지 거짓인지 말하지 않는다.
  const 금지 = [
    '가짜', '허위', '거짓', '사실이 아', '사실무근', '조작',
    '신뢰할 수 있', '믿을 만', '믿어도', '안전한 기사', '검증된',
    // **신호가 없는 항목(safe)의 문구가 합격 판정으로 읽히면 안 된다.**
    // 우리는 신호를 찾지 못한 것이지 그 점에서 옳다고 확인한 것이 아니다.
    '문제없', '이상 없', '적절합', '타당합', '정확합', '충분합',
  ]

  it.each(금지)('"%s" 를 쓰지 않는다', (word) => {
    const hit = visible.filter(([, v]) => v.includes(word))
    expect(hit.map(([p, v]) => `${p}: ${v}`)).toEqual([])
  })

  it('점수를 숫자로 보여 주지 않는다', () => {
    // 정밀해 보이는 숫자는 단정으로 읽힌다 (docs/product.md 5절).
    const hit = visible.filter(([, v]) => /\d+(\.\d+)?\s*(%|점|퍼센트)/.test(v))
    expect(hit.map(([p, v]) => `${p}: ${v}`)).toEqual([])
  })
})

describe('⚪ 는 사과가 아니라 설명이다', () => {
  const 사과 = ['죄송', '미안', '실패했', '오류가', '에러']

  it.each(사과)('"%s" 를 쓰지 않는다', (word) => {
    const hit = visible.filter(([, v]) => v.includes(word))
    expect(hit.map(([p, v]) => `${p}: ${v}`)).toEqual([])
  })
})

describe('공유를 막지 않는다', () => {
  it('막거나 겁주는 말투를 쓰지 않는다', () => {
    const 금지 = ['공유하지 마', '위험합니다', '차단', '중단하세요', '정말 공유']
    const hit = 금지.filter((w) => content.share.message.includes(w))
    expect(hit).toEqual([])
  })

  it('닫기 버튼이 공유를 되돌리는 말이 아니다', () => {
    // 알림일 뿐이다. 취소 버튼이 아니다.
    expect(content.share.dismiss).not.toContain('취소')
  })
})

describe('말투가 한 가지다', () => {
  it('해요체를 섞지 않는다', () => {
    // 배지는 습니다체인데 알림만 해요체면 다른 제품처럼 읽힌다.
    const hit = visible.filter(([p, v]) => !p.includes('accept') && !p.includes('decline') && !p.includes('dismiss'))
      .filter(([, v]) => /(보여요|해요|예요|이에요|네요|거든요)[.!?]?(\s|$)/.test(v))
    expect(hit.map(([p, v]) => `${p}: ${v}`)).toEqual([])
  })
})

describe('빠진 문구가 없다', () => {
  it('배지 5단계가 모두 있다', () => {
    expect(Object.keys(content.badge).sort())
      .toEqual(['CAUTION', 'CHECK', 'PENDING', 'SAFE', 'UNDETERMINED'])
  })

  it('판단 항목 전부에 문구가 있다', () => {
    // 빠지면 상세에 그 항목만 통째로 안 보인다.
    //
    // 설명 전용 항목은 `items` 가 아니라 `explain_items` 에 있다. 여기 걸리지 않는다.
    const ids = (schema.items as { id: string }[]).map((i) => i.id)
    expect(Object.keys(content.items).sort()).toEqual([...ids].sort())
  })

  it('설명 전용 항목은 점수에 들어가지 않는다', () => {
    // **배지가 바뀌면 안 된다.** request_group 에 점수를 내는 기능이 있으면
    // plan() 이 집어 가서 가중평균에 섞인다.
    const 점수내는기능 = ['page', 'portal_list', 'selection']
    const 설명전용 = ((schema as { explain_items?: unknown[] }).explain_items ?? []) as
      { id: string; request_group: Record<string, string> }[]
    expect(설명전용.length, '설명 전용 항목이 하나는 있어야 이 검사가 산다').toBeGreaterThan(0)
    for (const i of 설명전용) {
      const 샌것 = Object.keys(i.request_group).filter((f) => 점수내는기능.includes(f))
      expect(샌것, `${i.id} 가 ${샌것.join(',')} 에서도 불린다`).toEqual([])
    }
  })

  it('항목마다 이름·신호없음·신호·보류 네 가지가 다 있다', () => {
    for (const [id, c] of Object.entries(content.items)) {
      expect(c.name, `${id}.name`).toBeTruthy()
      expect(c.safe, `${id}.safe`).toBeTruthy()
      expect(c.signal, `${id}.signal`).toBeTruthy()
      expect(c.undetermined, `${id}.undetermined`).toBeTruthy()
    }
  })

  it('신호 없음 문구가 신호 있음 문구와 다르다', () => {
    // 복사해 붙이다 같아지면 상태를 구분할 수 없다.
    const same = Object.entries(content.items).filter(([, c]) => c.safe === c.signal)
    expect(same.map(([id]) => id)).toEqual([])
  })

  it('피드백 안내가 보내는 것과 보내지 않는 것을 모두 적는다', () => {
    const joined = content.feedback.notice.join(' ')
    expect(joined).toContain('보내는')
    expect(joined, '무엇을 안 보내는지도 적어야 한다').toContain('보내지 않는')
    expect(joined, '기사 본문을 보내지 않는다는 것이 핵심이다').toContain('기사 본문')
  })
})

describe('길이', () => {
  const len = (s: string) => [...s].length

  it('배지 이름이 12자를 넘지 않는다', () => {
    // 기사 위 작은 상자 안에서 한 줄에 들어가야 한다.
    const long = Object.entries(content.badge).filter(([, v]) => len(v.name) > 12)
    expect(long.map(([k, v]) => `${k}: ${v.name} (${len(v.name)}자)`)).toEqual([])
  })

  it('항목 이름이 12자를 넘지 않는다', () => {
    const long = Object.entries(content.items).filter(([, v]) => len(v.name) > 12)
    expect(long.map(([k, v]) => `${k}: ${v.name} (${len(v.name)}자)`)).toEqual([])
  })

  it('한 줄 설명이 50자를 넘지 않는다', () => {
    const long = visible.filter(([p, v]) => !p.startsWith('feedback.notice') && len(v) > 50)
    expect(long.map(([p, v]) => `${p} (${len(v)}자)`)).toEqual([])
  })
})

describe('출처를 밝힌다', () => {
  it('어느 도구로 만들었는지 적혀 있다', () => {
    // 서식4 의 증빙이다. 문구는 ChatKHU 의 주 역할이다.
    expect(content.source.tool).toBe('ChatKHU')
    expect(content.source.model).toBeTruthy()
    expect(content.source.prompt).toBeTruthy()
  })
})

describe('설명 문구가 질문과 짝이 맞는다', () => {
  // 질문을 더해 놓고 문구를 안 쓰면 화면에 빈 줄이 생기고,
  // 문구만 써 놓고 질문을 안 보내면 영영 안 보인다.
  const explainItems = ((schema as { explain_items?: unknown[] }).explain_items ?? []) as {
    id: string
    explain_for: string
    questions: { id: string }[]
  }[]

  /**
   * **아직 ChatKHU 문구를 받지 못한 항목.** 받으면 여기서 지운다.
   *
   * 질문은 먼저 넣고 문구는 뒤에 받는다 — 코딩 도구가 한국어를 지어내지 않기 때문이다
   * (tools/content-gen/README.md). 문구가 없는 항목은 화면에 펼침이 붙지 않는다.
   * **이 목록은 줄어들기만 해야 한다.**
   */
  const 문구_대기 = [
    'clickbait_headline',
    'headline_body_match',
    'spread_inducement',
    'emotional_language',
    'ai_style_signal',
  ]

  it('설명 항목마다 문구가 있거나, 대기 목록에 있다', () => {
    const 빠진것 = explainItems
      .filter((i) => !(content.explain as unknown as Record<string, unknown>)[i.explain_for])
      .map((i) => i.explain_for)
      .filter((id) => !문구_대기.includes(id))
    expect(빠진것, 'ChatKHU 문구를 받아 넣거나 대기 목록에 적는다').toEqual([])
  })

  it('대기 목록에 이미 받은 것이 남아 있지 않다', () => {
    const 이미받음 = 문구_대기.filter((id) => (content.explain as unknown as Record<string, unknown>)[id])
    expect(이미받음, '문구를 받았으면 대기 목록에서 지운다').toEqual([])
  })

  it('하위 질문마다 "찾았다"와 "못 찾았다"가 둘 다 있다', () => {
    for (const item of explainItems) {
      if (문구_대기.includes(item.explain_for)) continue
      const parts = (content.explain as unknown as Record<string, { parts: Record<string, { present?: string; absent?: string }> }>)
        [item.explain_for]?.parts ?? {}
      for (const q of item.questions) {
        expect(parts[q.id]?.present, `${q.id}.present`).toBeTruthy()
        expect(parts[q.id]?.absent, `${q.id}.absent`).toBeTruthy()
      }
    }
  })

  it('쓰지 않는 문구가 남아 있지 않다', () => {
    const 질문 = new Set(explainItems.flatMap((i) => i.questions.map((q) => q.id)))
    for (const [itemId, copy] of Object.entries(content.explain as unknown as Record<string, unknown>)) {
      if (itemId.startsWith('$')) continue
      const parts = (copy as { parts?: Record<string, unknown> }).parts ?? {}
      for (const id of Object.keys(parts)) {
        expect(질문.has(id), `${id} 문구는 있는데 묻는 질문이 없다`).toBe(true)
      }
    }
  })

  it('찾았다와 못 찾았다가 서로 다른 말이다', () => {
    for (const [itemId, copy] of Object.entries(content.explain as unknown as Record<string, unknown>)) {
      if (itemId.startsWith('$')) continue
      const parts = (copy as { parts: Record<string, { present: string; absent: string }> }).parts
      for (const [id, v] of Object.entries(parts)) {
        expect(v.present, `${id}`).not.toBe(v.absent)
      }
    }
  })
})
