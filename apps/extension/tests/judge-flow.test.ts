// 판단 흐름 — 캐시가 실제로 요청을 줄이는가.
//
// 중계 서버를 가짜로 세우고 **호출 횟수를 센다.** 캐시가 도는지는 그것으로만 알 수 있다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { judgeArticle, judgeHeadline } from '../lib/judge'
import { writeScores, type CachedItem } from '../lib/cache'

/** 캐시 값이 숫자에서 항목 결과 조각으로 바뀌었다. 테스트에서 짧게 쓰려고 둔다. */
const item = (score: number | null, isConfident = true): CachedItem => ({ score, isConfident })
import type { JudgeRequest } from '../lib/protocol'
import schema from '@genuearly/shared/judgment-items.json'

const store = new Map<string, unknown>()
const badge: { text: string[]; } = { text: [] }

/** 보낸 요청을 모아 둔다. */
let sent: JudgeRequest[] = []

function stubBrowser() {
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: (k: string | null) =>
          Promise.resolve(k === null ? Object.fromEntries(store) : { [k]: store.get(k) }),
        set: (o: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(o)) store.set(k, v)
          return Promise.resolve()
        },
        remove: (keys: string[]) => { for (const k of keys) store.delete(k); return Promise.resolve() },
      },
    },
    action: {
      setBadgeText: (o: { text: string }) => { badge.text.push(o.text); return Promise.resolve() },
      setBadgeBackgroundColor: () => Promise.resolve(),
    },
    runtime: { id: 'test-extension-id' },
  })
}

/**
 * 항목 하나에 대한 **스키마가 실제로 받아들이는** 답.
 *
 * 전에는 보기 이름을 손으로 적어 두어 `clickbait_headline` 말고는 모르는 보기가 갔고,
 * 점수가 전부 ⚪ 로 떨어져도 캐시 동작은 같다고 보고 넘겼다. 지금은 **중계가 실패한 항목을
 * 캐시하지 않으므로** 가짜 답이 틀리면 캐시가 통째로 비어 테스트가 캐시를 못 본다.
 * 보기 이름을 스키마에서 읽어 두 번 다시 갈라지지 않게 한다.
 */
function answerFor(id: string) {
  const def = (schema.items as { id: string; type: string; signals?: Record<string, string>; question: { criteria?: unknown } }[])
    .find((i) => i.id === id)
  if (!def) throw new Error(`스키마에 없는 항목: ${id}`)
  if (def.type === 'score') return { type: 'score', score: 1, confidence: 0.9 }
  // 'clear' 쪽 보기를 고른다 — 캐시가 도는지를 보는 테스트라 어느 쪽이든 되지만 하나로 고정한다.
  const choice = Object.entries(def.signals ?? {}).find(([, dir]) => dir === 'clear')?.[0]
  if (!choice) throw new Error(`clear 보기가 없는 항목: ${id}`)
  return { type: 'choice', choice, confidence: 0.9 }
}

/** 모든 질문에 그럴듯한 답을 돌려주는 가짜 중계 서버. */
function stubProxy() {
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as JudgeRequest
    sent.push(body)
    const answers: Record<string, unknown> = {}
    if (body.group === 'sentence') {
      answers.factual_assertion = { type: 'noul', noul: 0.9 }
      answers.named_basis = { type: 'noul', noul: 0.05 }
    } else {
      for (const id of body.items) answers[id] = answerFor(id)
    }
    return Promise.resolve(new Response(JSON.stringify({ model: 'jev-1.13.0', answers }), { status: 200 }))
  })
}

const article = {
  kind: 'judge-article' as const,
  url: 'https://n.news.naver.com/article/001/0001',
  headline: '제목이다',
  body: '본문이다. '.repeat(30),
  sentences: ['첫 문장이다.', '둘째 문장이다.', '셋째 문장이다.'],
}

beforeEach(() => {
  store.clear()
  sent = []
  badge.text = []
  stubBrowser()
  stubProxy()
})

describe('처음 열 때', () => {
  it('그룹 요청과 문장 요청을 모두 보낸다', async () => {
    await judgeArticle(article, 1)
    const groups = sent.filter((r) => r.group !== 'sentence')
    const sentences = sent.filter((r) => r.group === 'sentence')
    expect(groups.map((g) => g.group).sort()).toEqual(['headline_body', 'headline_only'])
    expect(sentences, '문장마다 하나씩').toHaveLength(3)
  })

  it('PENDING 을 먼저 보여 준다', async () => {
    await judgeArticle(article, 1)
    expect(badge.text[0]).toBe('…')
    expect(badge.text.length).toBeGreaterThan(1)
  })
})

describe('같은 기사를 다시 열 때', () => {
  it('중계 서버를 한 번도 부르지 않는다', async () => {
    await judgeArticle(article, 1)
    const first = sent.length
    expect(first).toBeGreaterThan(0)

    sent = []
    await judgeArticle(article, 1)
    expect(sent, '캐시가 있으면 호출이 없어야 한다').toHaveLength(0)
  })

  it('PENDING 을 거치지 않고 바로 결과를 보여 준다', async () => {
    await judgeArticle(article, 1)
    badge.text = []
    await judgeArticle(article, 1)
    expect(badge.text, 'PENDING 없이 한 번만').toHaveLength(1)
    expect(badge.text[0]).not.toBe('…')
  })

  it('쿼리만 다른 주소도 같은 기사로 본다', async () => {
    await judgeArticle(article, 1)
    sent = []
    await judgeArticle({ ...article, url: `${article.url}?sid=105&utm_source=x` }, 1)
    expect(sent).toHaveLength(0)
  })

  it('다른 기사는 다시 묻는다', async () => {
    await judgeArticle(article, 1)
    sent = []
    await judgeArticle({ ...article, url: 'https://n.news.naver.com/article/001/0002' }, 1)
    expect(sent.length).toBeGreaterThan(0)
  })
})

describe('② 가 제목 항목만 채워 둔 상태', () => {
  const list = { kind: 'judge-headline' as const, url: article.url, headline: article.headline }

  it('제목만 있는 캐시로 "캐시 있음" 처리하지 않는다', async () => {
    // 이걸 놓치면 제목만 본 결과가 6시간 동안 기사 배지로 나간다.
    await judgeHeadline(list)
    sent = []
    await judgeArticle(article, 1)
    expect(sent.length, '본문·문장 판단을 건너뛰면 안 된다').toBeGreaterThan(0)
  })

  it('제목만 보는 항목은 다시 묻지 않는다', async () => {
    await judgeHeadline(list)
    sent = []
    await judgeArticle(article, 1)
    expect(sent.flatMap((r) => r.items), '두 기능이 같은 질문을 한 항목이다')
      .not.toContain('clickbait_headline')
  })

  it('②가 제목만 보고 낸 spread_inducement 를 ①이 본문으로 다시 묻는다', async () => {
    // 리뷰(#22)가 짚은 것. 이 항목은 ①에서 headline_body, ②에서 headline_only 다.
    // 재사용하면 **본문 끝의 "꼭 공유해 주세요" 를 6시간 동안 못 본다.**
    await judgeHeadline(list)
    sent = []
    await judgeArticle(article, 1)
    const asked = sent.filter((r) => r.group === 'headline_body').flatMap((r) => r.items)
    expect(asked, '근거가 다른 판단을 물려받으면 안 된다').toContain('spread_inducement')
  })

  it('목록 글자가 기사 제목과 다르면 제목 항목도 다시 묻는다', async () => {
    // 목록 링크에는 "동영상"·재생 시간이 섞이거나 제목이 줄여져 있다.
    // 그 글자로 낸 판단을 기사 제목에 대한 판단으로 쓰면 안 된다 (리뷰 #22).
    await judgeHeadline({ ...list, headline: '제목이다 02:31 동영상' })
    sent = []
    await judgeArticle(article, 1)
    expect(sent.flatMap((r) => r.items)).toContain('clickbait_headline')
  })
})

describe('중계가 실패해도', () => {
  it('판단 보류를 돌려주고 던지지 않는다', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('연결 안 됨')))
    const v = await judgeArticle(article, 1)
    expect(v.level).toBe('UNDETERMINED')
  })

  it('실패한 판단을 캐시에 남기지 않는다', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('연결 안 됨')))
    await judgeArticle(article, 1)
    expect(store.size, '실패를 6시간 동안 들고 있으면 안 된다').toBe(0)
  })
})

describe('② 목록에서 제목만 볼 때', () => {
  const headline = {
    kind: 'judge-headline' as const,
    url: 'https://n.news.naver.com/mnews/article/001/0001',
    headline: '제목이다',
  }

  it('제목만 보는 그룹 하나만 보낸다', async () => {
    await judgeHeadline(headline)
    expect(sent.map((r) => r.group)).toEqual(['headline_only'])
    expect(sent[0]?.feature).toBe('portal_list')
    expect(sent[0]?.state, '본문을 보내지 않는다 — 목록에는 본문이 없다').toEqual({ headline: '제목이다' })
  })

  it('아이콘 배지를 건드리지 않는다', async () => {
    // 목록 페이지에는 기사가 서른 개 있다. 그중 하나의 판정을 탭 전체의 상태로 올리면
    // 그 목록이 주의 대상인 것처럼 보인다 (requirements.md 2-1절).
    await judgeHeadline(headline)
    expect(badge.text, '목록에서는 아이콘 배지가 바뀌면 안 된다').toEqual([])
  })

  it('제목만 본 것은 근거를 제목으로 밝힌다', async () => {
    expect((await judgeHeadline(headline)).basis).toBe('headline')
  })

  it('같은 제목을 다시 보면 부르지 않는다', async () => {
    await judgeHeadline(headline)
    sent = []
    await judgeHeadline(headline)
    expect(sent).toHaveLength(0)
  })
})

describe('②와 ①이 같은 캐시를 쓴다', () => {
  const url = 'https://n.news.naver.com/mnews/article/001/0001'

  it('②가 채운 제목 항목을 ①이 다시 묻지 않는다', async () => {
    await judgeHeadline({ kind: 'judge-headline', url, headline: '제목이다' })
    sent = []
    // 경로가 다르지만 normalizeUrl 이 같은 키로 모은다.
    await judgeArticle({ ...article, url: 'https://n.news.naver.com/article/001/0001' }, 1)
    expect(sent.map((r) => r.group), '제목만 보는 그룹은 캐시에 있다').not.toContain('headline_only')
    expect(sent.map((r) => r.group), '본문 그룹은 여전히 물어야 한다').toContain('headline_body')
  })

  it('①이 이미 본 기사는 ②가 공짜로 진한 동그라미를 준다', async () => {
    await judgeArticle({ ...article, url }, 1)
    sent = []
    const got = await judgeHeadline({ kind: 'judge-headline', url, headline: '제목이다' })
    expect(sent, '캐시에 다 있으면 호출이 없어야 한다').toHaveLength(0)
    expect(got.basis, '본문까지 본 결과다').toBe('full')
  })

  it('제목 항목만 있으면 진한 동그라미가 아니다', async () => {
    // 여기서 느슨하게 보면 제목만 본 결과가 "본문까지 봤다" 로 나간다.
    await judgeHeadline({ kind: 'judge-headline', url, headline: '제목이다' })
    const got = await judgeHeadline({ kind: 'judge-headline', url, headline: '제목이다' })
    expect(got.basis).toBe('headline')
  })
})
