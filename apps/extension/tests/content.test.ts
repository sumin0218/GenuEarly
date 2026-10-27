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
    // 빠지면 배지 상세에 그 항목만 통째로 안 보인다.
    const ids = (schema.items as { id: string }[]).map((i) => i.id)
    expect(Object.keys(content.items).sort()).toEqual([...ids].sort())
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
