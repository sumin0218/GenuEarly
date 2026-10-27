// @vitest-environment happy-dom
//
// ② 포털 목록 동그라미.
//
// 여기서 보는 것은 **무엇을 기사 제목으로 보는가**와 **근거가 다른 것을 다르게 그리는가**다.
// 실제 스크롤 추적과 DOM 삽입은 entrypoints/portal.content.ts 에 있다.
import { describe, expect, it } from 'vitest'
import { MIN_HEADLINE_CHARS, collectTitles, createMark, markLook } from '../lib/portal'
import { ARTICLE_MATCHES, isArticleUrl, matchPatternToRegExp } from '../match-patterns'

/** 목록 한 조각. 포털의 클래스 이름을 흉내 내지 않는다 — 우리는 주소로 찾는다. */
function listWith(links: { href: string; text: string }[]): HTMLElement {
  const root = document.createElement('div')
  for (const l of links) {
    const a = document.createElement('a')
    a.href = l.href
    a.textContent = l.text
    root.append(a)
  }
  document.body.replaceChildren(root)
  return root
}

const NAVER = 'https://n.news.naver.com/mnews/article/001/0012345678'
const 제목 = '정부, 내년 예산안 발표했다'

describe('match pattern 을 정규식으로', () => {
  it('경로의 * 만 와일드카드다', () => {
    const re = matchPatternToRegExp('https://n.news.naver.com/article/*')
    expect(re.test('https://n.news.naver.com/article/001/0012345678')).toBe(true)
    expect(re.test('https://n.news.naver.com/mnews/article/001/0012345678')).toBe(false)
  })

  it('점을 글자 그대로 본다 — 아무 글자나 되면 다른 도메인이 통과한다', () => {
    const re = matchPatternToRegExp('https://v.daum.net/v/*')
    expect(re.test('https://vXdaum.net/v/abc'), '점이 와일드카드가 되면 안 된다').toBe(false)
  })

  it('맨 앞 `*.` 는 그 도메인과 하위 도메인을 함께 받는다', () => {
    const re = matchPatternToRegExp('https://*.naver.com/*article*')
    expect(re.test('https://n.news.naver.com/mnews/ranking/article/422/0000919981')).toBe(true)
    expect(re.test('https://m.entertain.naver.com/home/article/076/0004459769')).toBe(true)
    expect(re.test('https://m.sports.naver.com/kbaseball/article/076/0004459867')).toBe(true)
    // 도메인 자신도 받는다 (MV3 규칙).
    expect(re.test('https://naver.com/article/1')).toBe(true)
    // 다른 도메인에 붙여 넣은 것은 안 된다.
    expect(re.test('https://naver.com.evil.example/article/1')).toBe(false)
    expect(re.test('https://notnaver.com/article/1')).toBe(false)
  })

  it('가운데 와일드카드는 거절한다 — `*.com` 이 조용히 통과한다', () => {
    expect(() => matchPatternToRegExp('https://*.*.com/*')).toThrow()
    expect(() => matchPatternToRegExp('https://n.*.naver.com/*')).toThrow()
  })
})

describe('어떤 링크가 기사인가', () => {
  // **①이 판단할 수 있는 기사에만 동그라미를 단다.** 어긋나면 사용자가 목록에서
  // 표시를 보고 눌러 들어갔는데 아무것도 없는 상태가 된다.
  it('match pattern 과 같은 것을 받아들인다', () => {
    for (const p of ARTICLE_MATCHES) {
      // 호스트의 `*.` 와 경로의 `*` 를 그럴듯한 값으로 채워 본다.
      const sample = p
        .replace('https://*.', 'https://n.news.')
        .replace('/*article*', '/mnews/article/001/0012345678')
        .replace('*', '001/0012345678')
      expect(isArticleUrl(sample), `${p} 가 기사로 안 보인다`).toBe(true)
    }
  })

  it('article 이 든 네이버 주소는 호스트를 가리지 않고 받는다', () => {
    // 호스트를 하나씩 세다 보면 반드시 빠뜨린다 (GE-42).
    for (const u of [
      'https://n.news.naver.com/mnews/ranking/article/422/0000919981',
      'https://n.news.naver.com/mnews/hotissue/article/001/0001',
      'https://m.entertain.naver.com/home/article/076/0004459769',
      'https://m.sports.naver.com/kbaseball/article/076/0004459867',
    ]) {
      expect(isArticleUrl(u), `${u} 가 기사로 안 보인다`).toBe(true)
    }
  })

  it('article 이 없으면 받지 않는다', () => {
    expect(isArticleUrl('https://news.naver.com/section/100')).toBe(false)
    expect(isArticleUrl('https://www.naver.com/')).toBe(false)
  })

  it('댓글 페이지는 받지 않는다 — 주소에 article 이 있지만 본문이 없다', () => {
    expect(isArticleUrl('https://n.news.naver.com/mnews/article/comment/422/0000919981')).toBe(
      false,
    )
  })

  it('쿼리가 붙어도 기사다 — 포털 목록 링크에는 늘 붙어 있다', () => {
    expect(isArticleUrl(`${NAVER}?sid=100&cds=news_edit`)).toBe(true)
  })

  it('목록·섹션 페이지는 기사가 아니다', () => {
    expect(isArticleUrl('https://news.naver.com/section/100')).toBe(false)
  })

  it('https 가 아니면 기사가 아니다', () => {
    // javascript: 같은 스킴을 여기서 떨어뜨린다 (secure-coding.md 4절).
    expect(isArticleUrl('javascript:alert(1)')).toBe(false)
    expect(isArticleUrl('http://n.news.naver.com/article/001/0012345678')).toBe(false)
  })

  it('주소가 아니면 던지지 않고 거짓을 준다', () => {
    expect(isArticleUrl('#')).toBe(false)
    expect(isArticleUrl('')).toBe(false)
  })

  // 섹션 한 페이지(news.naver.com/section/100)에서 실제로 센 값이다 (2026-10-27).
  // 기사 링크 354개 중 랭킹이 170개, hotissue 가 16개였다 — **절반 가까이**를
  // 받지 못하고 있었다 (GE-42).
  describe('네이버가 같은 기사를 거는 네 경로', () => {
    it.each([
      ['https://n.news.naver.com/article/056/0012281659', '기본'],
      ['https://n.news.naver.com/mnews/article/056/0012281659', '모바일'],
      ['https://n.news.naver.com/mnews/ranking/article/056/0012281954', '랭킹'],
      ['https://n.news.naver.com/mnews/hotissue/article/662/0000107048', 'hotissue'],
    ])('%s (%s) 는 기사다', (url) => {
      expect(isArticleUrl(url)).toBe(true)
    })

    it('랭킹 주소에 붙는 ntype 쿼리를 떼고 본다', () => {
      expect(isArticleUrl('https://n.news.naver.com/mnews/ranking/article/056/0012281954?ntype=RANKING'))
        .toBe(true)
    })

    it('언론사 자체 도메인도 기사다', () => {
      // 포털을 거치지 않고 링크를 받아 바로 들어오는 길 (GE-41).
      expect(isArticleUrl('https://www.insight.co.kr/news/579405')).toBe(true)
      expect(isArticleUrl('https://www.wikitree.co.kr/articles/1169622')).toBe(true)
      expect(isArticleUrl('https://m.wikitree.co.kr/articles/1169622')).toBe(true)
    })

    it('네이버 스포츠·연예도 기사다 — 분류가 경로 가운데 들어간다', () => {
      expect(isArticleUrl('https://m.sports.naver.com/kbaseball/article/076/0004459867')).toBe(true)
      expect(isArticleUrl('https://m.sports.naver.com/wfootball/article/076/0004459867')).toBe(true)
      expect(isArticleUrl('https://m.entertain.naver.com/home/article/076/0004459769')).toBe(true)
    })

    it('그 사이트의 목록 페이지는 기사가 아니다', () => {
      // 기사와 모양이 달라 구분된다 — 숫자가 없거나 경로가 다르다.
      expect(isArticleUrl('https://www.insight.co.kr/economy/')).toBe(false)
      expect(isArticleUrl('https://www.wikitree.co.kr/categories/1')).toBe(false)
      expect(isArticleUrl('https://m.sports.naver.com/kbaseball/index')).toBe(false)
      expect(isArticleUrl('https://m.entertain.naver.com/home')).toBe(false)
    })

    it('댓글 화면은 기사가 아니다 — 본문이 없다', () => {
      // `/mnews/article/*` 의 `*` 가 경로 나머지를 전부 덮어서 여기까지 잡힌다.
      // 지금까지 이 화면에 ⚪ 배지가 떴다. 판단해 보고 실패한 것처럼 보이지만
      // 애초에 기사 페이지가 아니다.
      expect(isArticleUrl('https://n.news.naver.com/mnews/article/comment/056/0012281659'))
        .toBe(false)
    })
  })
})

describe('목록에서 제목을 고른다', () => {
  it('기사 링크만 고른다', () => {
    const root = listWith([
      { href: NAVER, text: 제목 },
      { href: 'https://news.naver.com/section/100', text: '정치 섹션 더보기' },
      { href: 'https://blog.naver.com/someone', text: '관련 없는 아주 긴 링크 글자' },
    ])
    expect(collectTitles(root).map((t) => t.headline)).toEqual([제목])
  })

  it('같은 기사를 가리키는 링크가 여럿이면 글자가 가장 긴 것을 쓴다', () => {
    // 포털은 썸네일과 제목을 따로 건다. 썸네일에 동그라미를 달면 이미지 위에 점이 뜬다.
    const root = listWith([
      { href: NAVER, text: '사진' },
      { href: NAVER, text: 제목 },
    ])
    const got = collectTitles(root)
    expect(got).toHaveLength(1)
    expect(got[0]?.headline).toBe(제목)
  })

  it('경로가 달라도 같은 기사면 하나로 본다', () => {
    // normalizeUrl 이 /mnews/article/ 과 /article/ 을 같은 키로 모은다 (lib/cache.ts).
    const root = listWith([
      { href: NAVER, text: 제목 },
      { href: 'https://n.news.naver.com/article/001/0012345678?sid=100', text: `${제목} 전문` },
    ])
    expect(collectTitles(root)).toHaveLength(1)
  })

  it('글자가 거의 없는 링크는 제목이 아니다', () => {
    const root = listWith([{ href: NAVER, text: '사진' }])
    expect(collectTitles(root)).toEqual([])
  })

  it(`${MIN_HEADLINE_CHARS}자 미만을 버린다`, () => {
    const root = listWith([{ href: NAVER, text: 'ㄱ'.repeat(MIN_HEADLINE_CHARS - 1) }])
    expect(collectTitles(root)).toEqual([])
    const ok = listWith([{ href: NAVER, text: 'ㄱ'.repeat(MIN_HEADLINE_CHARS) }])
    expect(collectTitles(ok)).toHaveLength(1)
  })

  it('원래 주소를 그대로 들고 간다 — 판단과 캐시가 그것을 쓴다', () => {
    const withQuery = `${NAVER}?sid=100`
    const root = listWith([{ href: withQuery, text: 제목 }])
    expect(collectTitles(root)[0]?.url).toBe(withQuery)
  })
})

describe('근거가 다르면 다르게 그린다', () => {
  // requirements.md 4-3절. 제목만 보고 낸 판단과 본문까지 보고 낸 판단은
  // 같은 🔴 이라도 무게가 다르다. 같게 그리면 "모르면 모른다고 한다" 를 어긴다.
  it('제목만 본 것은 옅고, 본문까지 본 것은 진하다', () => {
    expect(markLook('CAUTION', 'headline').filled).toBe(false)
    expect(markLook('CAUTION', 'full').filled).toBe(true)
  })

  it('판단 중은 근거가 없으므로 진해지지 않는다', () => {
    expect(markLook('PENDING', 'full').filled).toBe(false)
  })

  it('단계를 색이 아니라 모양이 가른다 — 색각 이상에서도 구분된다', () => {
    const icons = (['SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED'] as const)
      .map((l) => markLook(l, 'headline').icon)
    expect(new Set(icons).size, '모양이 겹치면 색으로만 구분된다').toBe(4)
  })

  it('신호 없음에 체크표를 쓰지 않는다 — "검증됨" 으로 읽힌다', () => {
    // 우리는 참·거짓을 말하지 않는다 (docs/product.md 2절). 아이콘은 문구보다 먼저
    // 읽히므로, 아이콘이 그 선을 넘으면 문구를 아무리 조심해 써도 소용없다.
    expect(markLook('SAFE', 'full').icon).not.toMatch(/check|verif|tick|shield/i)
  })
})

describe('동그라미를 페이지에 넣을 때', () => {
  it('Shadow DOM 안에 둔다 — 포털이 읽지도 망가뜨리지도 못한다', () => {
    const mark = createMark(document)
    // mode: 'closed' 라 바깥에서 shadowRoot 가 보이지 않는다 (secure-coding.md 4절).
    expect(mark.host.shadowRoot).toBeNull()
    expect(mark.host.childNodes).toHaveLength(0)
  })

  it('페이지와 겹치지 않는 이름을 쓴다', () => {
    expect(createMark(document).host.className).toContain('genuearly')
  })

  it('화면을 읽어 주는 도구에도 글로 알려 준다', () => {
    const mark = createMark(document)
    mark.render('CAUTION', 'headline', '주의할 신호 있음')
    expect(mark.host.getAttribute('role')).toBe('img')
    expect(mark.host.getAttribute('aria-label')).toBe('주의할 신호 있음')
  })

  it('판정 점수가 DOM 에 새지 않는다', () => {
    const mark = createMark(document)
    mark.render('CAUTION', 'full', '주의할 신호 있음')
    // **마크업이 아니라 사람이 읽는 것을 본다.** 아이콘 `path` 의 좌표에는 소수점이
    // 잔뜩 있지만 그것은 그림이지 점수가 아니다. 새면 안 되는 자리는 글자와 aria-label 이다.
    const words = [
      mark.host.textContent ?? '',
      mark.host.getAttribute('aria-label') ?? '',
      mark.host.title,
    ].join(' ')
    expect(words).not.toMatch(/0\.\d|\d+%|\d+점/)
  })
})
