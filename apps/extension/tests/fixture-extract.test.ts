// @vitest-environment happy-dom
//
// 수동 테스트 자료(eval/fixtures/manual-news)에서 ①이 본문을 읽어 내는가.
//
// 그 자료로는 지금까지 ③ 선택 검사만 해 볼 수 있었다. ①은 본문 추출부터 막혀서
// 판정·배지·팝업으로 이어지는 길을 로컬에서 한 번도 밟아 보지 못했다.
//
// **진짜 파일을 읽어서 검사한다.** 구조를 흉내 내면 build.cjs 가 모양을 바꿨을 때
// 검사만 통과하고 실제로는 안 되는 일이 생긴다.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractArticle } from '../lib/extract'
import { isArticleUrl } from '../match-patterns'

const 자료방 = resolve(__dirname, '../../../eval/fixtures/manual-news')
const 기사파일 = readdirSync(자료방)
  // 분류마다 접두사가 다르다 — c-(과장 제목), o-(기관·법인·지명), r-(실존 인물).
  // 목록 페이지(index·clickbait·people·organizations)는 기사가 아니라 빠진다.
  .filter((f) => /^[a-z]-\d+\.html$/.test(f))
  .sort()

/** 개발 빌드인 척한다. 자료용 규칙은 `import.meta.env.DEV` 로 가려져 있다. */
function 개발빌드로() {
  vi.stubEnv('DEV', true)
}

function 연다(file: string): void {
  document.documentElement.innerHTML = readFileSync(resolve(자료방, file), 'utf8')
}

afterEach(() => {
  vi.unstubAllEnvs()
  document.documentElement.innerHTML = ''
})

describe('테스트 자료에서 기사를 읽는다', () => {
  it('자료가 있다', () => {
    expect(기사파일.length, 'eval/fixtures/manual-news 에 기사 파일이 없다').toBeGreaterThan(40)
  })

  it.each(기사파일)('%s — 제목과 본문을 읽는다', (file) => {
    개발빌드로()
    연다(file)
    const got = extractArticle()

    expect(got, '기사 구조를 읽지 못했다').not.toBeNull()
    expect(got?.headline.length, '제목이 비었다').toBeGreaterThan(5)
    expect(got?.body.length, '본문이 너무 짧다 — 150자 밑이면 extractArticle 이 버린다').toBeGreaterThan(150)
    expect(got?.sentences.length, '문장을 못 나눴다').toBeGreaterThan(2)
  })

  it('안내문과 선택 버튼은 본문에 섞이지 않는다', () => {
    개발빌드로()
    연다(기사파일[0] as string)
    const body = extractArticle()?.body ?? ''

    for (const 섞이면안되는것 of ['제목·본문 선택', '제목만 선택', '본문만 선택', '전체 45건']) {
      expect(body, `"${섞이면안되는것}" 이 본문에 섞였다`).not.toContain(섞이면안되는것)
    }
  })

  it('**배포본에서는 읽지 않는다** — 자료용 규칙은 개발 빌드 전용이다', () => {
    vi.stubEnv('DEV', false)
    연다(기사파일[0] as string)
    expect(extractArticle(), '배포본이 아무 페이지나 기사로 읽으면 안 된다').toBeNull()
  })
})

describe('테스트 자료의 기사 주소를 알아본다 — ②가 목록에 표시를 달려면', () => {
  // ②는 목록에서 a[href] 를 훑어 `isArticleUrl` 로 기사를 가린다. 자료의 기사가
  // 여기서 걸러지면 목록에 표시가 하나도 안 붙는다.
  //
  // **주소 패턴으로 가르지 않는다.** 자료는 file:// 로도 아무 포트의 localhost 로도
  // 열리고, 경로 중간의 `manual-news` 에 붙임표가 있어 `*-*` 같은 패턴은 목록
  // 페이지까지 삼킨다. 파일 이름만 본다.
  const 기사주소 = [
    'file:///C:/work/GenuEarly/eval/fixtures/manual-news/c-001.html',
    'file:///home/me/manual-news/r-015.html',
    'http://localhost:4173/o-007',
    'http://localhost:3000/o-007.html',
  ]
  const 목록주소 = [
    'file:///C:/work/GenuEarly/eval/fixtures/manual-news/index.html',
    'file:///C:/work/GenuEarly/eval/fixtures/manual-news/clickbait.html',
    'http://localhost:4173/people',
    'http://localhost:4173/organizations.html',
    'http://localhost:4173/',
  ]

  it.each(기사주소)('%s 는 기사다', (url) => {
    vi.stubEnv('DEV', true)
    expect(isArticleUrl(url)).toBe(true)
  })

  it.each(목록주소)('%s 는 기사가 아니다 — 목록 페이지다', (url) => {
    vi.stubEnv('DEV', true)
    expect(isArticleUrl(url), '목록 페이지에 표시를 달면 안 된다').toBe(false)
  })

  it('**배포본에서는 하나도 받지 않는다**', () => {
    vi.stubEnv('DEV', false)
    for (const url of [...기사주소, ...목록주소]) {
      expect(isArticleUrl(url), `${url} 를 배포본이 기사로 보면 안 된다`).toBe(false)
    }
  })

  it('배포본의 https 기사 판단은 그대로다', () => {
    vi.stubEnv('DEV', false)
    expect(isArticleUrl('https://n.news.naver.com/article/001/0001')).toBe(true)
    expect(isArticleUrl('https://news.naver.com/section/100')).toBe(false)
  })
})
