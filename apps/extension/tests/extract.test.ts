// 기사 추출 규칙을 검사한다.
//
// **실제 기사 본문을 쓰지 않는다** (eval/README.md 규칙). 네이버·다음의 **구조**만 흉내 낸
// 가짜 기사로 선택자와 걷어내기 규칙을 본다. 선택자가 실제 페이지와 맞는지는
// 별도로 실제 페이지를 받아 확인한다 (저장소 밖).
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { extractArticle } from '../lib/extract'

/** 호스트를 바꿔 가며 문서를 세운다. */
function load(host: string, html: string) {
  globalThis.location = new URL(`https://${host}/article/001/000`) as unknown as Location
  document.documentElement.innerHTML = `<head></head><body>${html}</body>`
}

const 긴본문 = '이것은 본문이다. '.repeat(20)

describe('네이버', () => {
  beforeEach(() => {
    load('n.news.naver.com', `
      <h2 id="title_area"><span>  충격!  전문가가 경고한 식품  </span></h2>
      <article id="dic_area">
        (서울=연합뉴스) 윤민혁 기자 = 첫 문장이다.
        ${긴본문}
        <span class="end_photo_org">사진 설명은 본문이 아니다</span>
        <em class="img_desc">이미지 캡션도 아니다</em>
        <script>var ad = 1</script>
      </article>`)
  })

  it('제목의 빈칸을 정리해서 꺼낸다', () => {
    expect(extractArticle()?.headline).toBe('충격! 전문가가 경고한 식품')
  })

  it('바이라인을 본문에서 걷어낸다', () => {
    // 안 걷어내면 "(서울=연합뉴스) 윤민혁 기자 = 첫 문장이다." 가 한 문장이 된다.
    const a = extractArticle()!
    expect(a.body).not.toContain('연합뉴스')
    expect(a.body).not.toContain('기자')
    expect(a.body.startsWith('첫 문장이다.')).toBe(true)
  })

  it('사진 설명·캡션·스크립트를 걷어낸다', () => {
    const a = extractArticle()!
    expect(a.body).not.toContain('사진 설명')
    expect(a.body).not.toContain('이미지 캡션')
    expect(a.body).not.toContain('var ad')
  })

  it('문장으로 나눈다', () => {
    const a = extractArticle()!
    expect(a.sentences.length).toBeGreaterThan(5)
    expect(a.sentences[0]).toBe('첫 문장이다.')
  })

  it('원본 DOM 을 건드리지 않는다', () => {
    // 복제본에서 걷어낸다. 기사 화면이 바뀌면 안 된다.
    extractArticle()
    expect(document.querySelector('.end_photo_org')).not.toBeNull()
    expect(document.querySelector('#dic_area script')).not.toBeNull()
  })
})

describe('다음', () => {
  it('다음 선택자로도 꺼낸다', () => {
    load('v.daum.net', `
      <h3 class="tit_view">다음 기사 제목</h3>
      <div class="article_view" data-translation-body="true">
        <p>첫 문장이다.</p><p>${긴본문}</p>
        <figcaption>캡션은 본문이 아니다</figcaption>
      </div>`)
    const a = extractArticle()!
    expect(a.headline).toBe('다음 기사 제목')
    expect(a.body).not.toContain('캡션')
    expect(a.sentences.length).toBeGreaterThan(5)
  })
})

describe('꺼내지 못하는 경우', () => {
  it('모르는 사이트면 null', () => {
    load('evil.example', '<h2 id="title_area">제목</h2><article id="dic_area">본문</article>')
    expect(extractArticle()).toBeNull()
  })

  it('구조가 다르면 null — 틀린 자리에 배지를 띄우지 않는다', () => {
    load('n.news.naver.com', '<div class="some-new-layout">제목과 본문</div>')
    expect(extractArticle()).toBeNull()
  })

  it('본문이 너무 짧으면 null', () => {
    load('n.news.naver.com', '<h2 id="title_area">제목</h2><article id="dic_area">짧다.</article>')
    expect(extractArticle()).toBeNull()
  })

  it('저작권 고지는 본문에 넣지 않는다', () => {
    load('n.news.naver.com', `
      <h2 id="title_area">제목</h2>
      <article id="dic_area">${긴본문}\n무단 전재 및 재배포 금지</article>`)
    expect(extractArticle()?.body).not.toContain('재배포')
  })
})

describe('바이라인 모양들 — 실제 기사에서 본 것', () => {
  const 긴글 = '본문 문장이다. '.repeat(20)
  const body = (head: string) => {
    load('n.news.naver.com', `
      <h2 id="title_area">제목</h2>
      <article id="dic_area">${head}${긴글}</article>`)
    return extractArticle()?.body ?? ''
  }

  it('기자 한 명', () => {
    expect(body('(서울=연합뉴스) 윤민혁 기자 = ')).toMatch(/^본문 문장이다\./)
  })

  it('기자 여러 명과 수습기자', () => {
    // [서울=뉴시스]조수원 신유림 기자, 임다빈 수습기자 = — 실제 다음 기사에서 봤다
    expect(body('[서울=뉴시스]조수원 신유림 기자, 임다빈 수습기자 = ')).toMatch(/^본문 문장이다\./)
  })

  it('대괄호 안에 들어간 형태', () => {
    expect(body('[OO일보 김철수 기자] ')).toMatch(/^본문 문장이다\./)
  })

  it('바이라인이 없으면 본문을 깎지 않는다', () => {
    // BYLINE 은 앞 400자까지 훑으므로, 잘못 맞으면 본문 앞부분이 통째로 사라진다.
    const out = body('')
    expect(out).toMatch(/^본문 문장이다\./)
    expect(out.match(/본문 문장이다\./g)).toHaveLength(20)
  })

  it('사진 출처 괄호를 바이라인으로 오해하지 않는다', () => {
    // (사진=연합뉴스) 뒤에는 = 로 끝나는 기자 이름이 없다. 본문이 날아가면 안 된다.
    expect(body('(사진=연합뉴스) ')).toContain('본문 문장이다.')
  })
})

describe('부제 — 바이라인 없이 본문 앞에 나열되는 매체', () => {
  it('종결부호 없는 앞줄들을 버린다', () => {
    // 그대로 두면 부제 세 줄과 첫 문장이 한 덩어리가 되어 통째로 판단 대상이 된다.
    load('n.news.naver.com', `
      <h2 id="title_area">제목</h2>
      <article id="dic_area">
        카카오톡·밴드 화면 최적화 완료<br>
        모바일 게임도 화면비 맞춰 UI 개편<br>
        하단 내비게이션 바 오른쪽으로<br>
        애플의 첫 폴더블에서 카카오톡을 켜자 새로운 화면이 나왔다.
        ${'그다음 문장이다. '.repeat(15)}
      </article>`)
    const a = extractArticle()!
    expect(a.sentences[0]).toBe('애플의 첫 폴더블에서 카카오톡을 켜자 새로운 화면이 나왔다.')
    expect(a.body).not.toContain('화면 최적화 완료')
  })

  it('본문 첫 줄이 길면 부제로 보지 않는다', () => {
    // SUBTITLE_MAX_CHARS(80) 보다 길어야 부제가 아니라 본문으로 본다.
    const 긴첫줄 = '이것은 종결부호가 없는 아주 긴 첫 줄이고 부제라기에는 너무 길어서 본문으로 보아야 하는 줄이며 길이로 갈라야 한다는 것을 보이려고 일부러 여든 자를 넘겼다'
    load('n.news.naver.com', `
      <h2 id="title_area">제목</h2>
      <article id="dic_area">${긴첫줄}<br>${'다음 문장이다. '.repeat(25)}</article>`)
    expect(extractArticle()?.body).toContain('아주 긴 첫 줄')
  })

  it('첫 줄이 제대로 끝나면 아무것도 버리지 않는다', () => {
    load('n.news.naver.com', `
      <h2 id="title_area">제목</h2>
      <article id="dic_area">첫 문장이다.<br>${'다음 문장이다. '.repeat(25)}</article>`)
    expect(extractArticle()?.sentences[0]).toBe('첫 문장이다.')
  })
})
