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

describe('리뷰에서 나온 추출 경계', () => {
  const 긴글 = '본문 문장이다. '.repeat(20)
  const body = (inner: string) => {
    load('n.news.naver.com', `<h2 id="title_area">제목</h2><article id="dic_area">${inner}</article>`)
    return extractArticle()?.body ?? ''
  }

  it('따옴표로 끝나는 인용 리드를 부제로 오해하지 않는다', () => {
    // 종결부호 뒤에 닫는 따옴표가 와서 마지막 글자만 보면 부제로 걸러진다.
    // 첫 문장은 대개 기사의 핵심 주장이라 통째로 사라지면 판단이 달라진다.
    const out = body(`"이번 조치는 효과가 없다."<br>${긴글}`)
    expect(out).toContain('이번 조치는 효과가 없다')
  })

  it('작은따옴표·괄호로 끝나도 같다', () => {
    expect(body(`그는 '어렵다'고 말했다.<br>${긴글}`)).toContain('어렵다')
  })

  it('본문 끝에 이어 붙은 괄호 크레딧을 걷어낸다', () => {
    // 줄 단위 필터는 따로 한 줄일 때만 걸러서, 이어 붙으면 한 문장으로 남는다.
    const a = body(`${긴글}(취재보조: 김지수 통신원)`)
    expect(a).not.toContain('취재보조')
    expect(a).not.toContain('김지수')
  })

  it('본문 중간의 괄호는 건드리지 않는다', () => {
    // 끝에 있는 것만 크레딧으로 본다.
    const out = body(`회의(기자 간담회)가 열렸다. ${긴글}`)
    expect(out).toContain('기자 간담회')
  })

  it('이름만 있는 줄에 통신원도 걸러진다', () => {
    const out = body(`${긴글}<br>김지수 통신원`)
    expect(out).not.toContain('김지수')
  })
})

// 포털을 거치지 않고 들어오는 길. 구조는 2026-10-27 에 실제 페이지에서 확인했고,
// **여기에는 구조만 흉내 낸다** — 실제 기사 본문은 저장소에 넣지 않는다.
describe('인사이트', () => {
  beforeEach(() => {
    load('www.insight.co.kr', `
      <h1 class="main-news-header-title">  구룡마을에서  불이 났다  </h1>
      <div class="main-news-article-body news-read-content-memo">
        <p>첫 문장이다.</p>
        <p></p>
        <p>${긴본문}</p>
        <p class="image">27일 현장에서 소방대원들이 불길을 잡고 있다. 2026.10.27/뉴스1</p>
        <p>마지막 문장이다.</p>
        <script>var ad = 1</script>
      </div>`)
  })

  it('제목을 꺼낸다', () => {
    expect(extractArticle()?.headline).toBe('구룡마을에서 불이 났다')
  })

  it('사진 설명을 걷어낸다 — 문장 하나를 차지하고 출처 판단에도 섞인다', () => {
    const a = extractArticle()!
    expect(a.body).not.toContain('소방대원들이')
    expect(a.body).not.toContain('뉴스1')
    expect(a.body).not.toContain('var ad')
  })

  it('본문은 남긴다', () => {
    const a = extractArticle()!
    expect(a.body.startsWith('첫 문장이다.')).toBe(true)
    expect(a.body).toContain('마지막 문장이다.')
  })
})

describe('위키트리', () => {
  beforeEach(() => {
    load('www.wikitree.co.kr', `
      <div class="article_head"><h1 id="article" data-idx="1169622">  비상식량을  준비하라  </h1></div>
      <div class="article_body">
        <h2 class="lead">'무슨 일 있나' 국민 불안에 두 정부의 답은?</h2>
        <div class="wikitree_content ar_content">
          <p>첫 문장이다.</p>
          <p>${긴본문}</p>
        </div>
        <div class="keyword_wrap">비상물품비축 방재청 국난급재해</div>
        <footer class="article_bottom">기사제보 copyright 위키트리의 콘텐츠는 무단 전재·배포를 금합니다.</footer>
      </div>`)
  })

  it('제목을 꺼낸다', () => {
    expect(extractArticle()?.headline).toBe('비상식량을 준비하라')
  })

  it('부제를 본문에 넣지 않는다 — 네이버와 같은 결정이다', () => {
    // 같은 글을 어디서 읽느냐에 따라 다르게 판단하면 안 된다.
    expect(extractArticle()!.body).not.toContain('무슨 일 있나')
  })

  it('키워드 목록과 저작권 안내를 넣지 않는다', () => {
    const a = extractArticle()!
    expect(a.body).not.toContain('비상물품비축')
    expect(a.body).not.toContain('기사제보')
    expect(a.body).not.toContain('무단 전재')
  })

  it('본문은 남긴다', () => {
    expect(extractArticle()!.body.startsWith('첫 문장이다.')).toBe(true)
  })
})
