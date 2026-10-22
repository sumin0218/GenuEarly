// 판단 흐름 — 캐시가 실제로 요청을 줄이는가.
//
// 중계 서버를 가짜로 세우고 **호출 횟수를 센다.** 캐시가 도는지는 그것으로만 알 수 있다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { judgeArticle } from '../lib/judge'
import { writeScores } from '../lib/cache'
import type { JudgeRequest } from '../lib/protocol'

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
      for (const id of body.items) {
        answers[id] = id === 'emotional_language' || id === 'ai_style_signal'
          ? { type: 'score', score: 0.5, confidence: 0.9 }
          : { type: 'choice', choice: id === 'source_citation' ? 'named_source' : 'plain', confidence: 0.9 }
      }
    }
    // clickbait_headline 의 'plain' 과 달리 보기 이름이 항목마다 달라서,
    // 아는 보기가 아니면 점수가 null 이 된다. 그래도 캐시 동작은 같다.
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
  it('① 은 나머지만 묻는다', async () => {
    // ② 포털 목록이 제목만 보는 항목을 채워 뒀다고 두자.
    await writeScores(article.url, { clickbait_headline: 1, spread_inducement: 0 })

    await judgeArticle(article, 1)
    const asked = sent.flatMap((r) => r.items)
    expect(asked, '②가 채운 것은 다시 묻지 않는다').not.toContain('clickbait_headline')
    expect(asked).toContain('source_citation')
    expect(asked).toContain('unverifiable_claim')
  })

  it('제목만 있는 캐시로 "캐시 있음" 처리하지 않는다', async () => {
    // 이걸 놓치면 제목만 본 결과가 6시간 동안 기사 배지로 나간다.
    await writeScores(article.url, { clickbait_headline: 1, spread_inducement: 0 })
    await judgeArticle(article, 1)
    expect(sent.length, '본문·문장 판단을 건너뛰면 안 된다').toBeGreaterThan(0)
  })

  it('헤드라인 그룹은 통째로 건너뛴다', async () => {
    await writeScores(article.url, { clickbait_headline: 1 })
    await judgeArticle(article, 1)
    // headline_only 그룹에는 clickbait_headline 하나뿐이다. 다 찼으면 요청이 없어야 한다.
    expect(sent.some((r) => r.group === 'headline_only')).toBe(false)
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
