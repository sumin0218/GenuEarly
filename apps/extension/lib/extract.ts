// 기사 페이지에서 제목과 본문을 꺼낸다.
//
// **사이트별 선택자를 쓴다.** 일반적인 본문 추출기를 만들지 않는다 — 대상이 손에 꼽히고,
// 범용 추출기는 무엇을 집어 올지 예측할 수 없다. 광고나 추천 기사가 섞여 들어가면
// 판단이 통째로 틀어진다 (docs/requirements.md 3-2).
//
// 선택자는 **예고 없이 바뀐다.** 바뀌면 `extractArticle` 이 `null` 을 돌려주고
// 배지는 ⚪ 가 된다 — 조용히 틀린 판단을 내는 것보다 낫지만, 그래도 사용자는
// 아무것도 못 본다. 사이트를 늘릴 때마다 깨질 자리가 하나씩 는다.
import { splitSentences } from './sentences'

export interface Article {
  headline: string
  body: string
  sentences: string[]
}

interface SiteRule {
  host: RegExp
  headline: string[]
  body: string[]
  /** 본문 안에서 걷어낼 것 — 사진 설명, 기자 정보, 관련 기사 */
  drop: string[]
}

const RULES: SiteRule[] = [
  {
    host: /(^|\.)n\.news\.naver\.com$/,
    headline: ['h2#title_area', '#title_area'],
    body: ['article#dic_area', '#dic_area'],
    drop: ['.end_photo_org', '.img_desc', '.media_end_summary', 'script', 'style', 'table'],
  },
  {
    host: /(^|\.)v\.daum\.net$/,
    headline: ['h3.tit_view', '.head_view .tit_view'],
    body: ['div.article_view[data-translation-body="true"]', 'div.article_view', '#harmonyContainer'],
    drop: ['figure', 'figcaption', '.link_figure', '.txt_caption', 'script', 'style', 'table'],
  },
  {
    // 인사이트. 본문은 `<p>` 단락이고 사진 설명만 `<p class="image">` 로 따로 있다.
    host: /(^|\.)insight\.co\.kr$/,
    headline: ['h1.main-news-header-title'],
    body: ['.main-news-article-body'],
    // `p.image` 가 사진 설명이다 — "…2026.10.27/뉴스1" 처럼 날짜와 통신사가 붙어 있어
    // 걷어내지 않으면 문장 하나를 차지하고 출처 판단에도 섞인다.
    drop: ['p.image', 'figure', 'figcaption', 'script', 'style', 'table'],
  },
  {
    // 위키트리. **`.article_body` 가 아니라 그 안의 `.wikitree_content` 를 집는다.**
    // `.article_body` 에는 부제(`h2.lead`), 키워드 목록, 저작권 안내가 함께 들어 있다.
    // 안쪽을 바로 집으면 걷어낼 것이 줄어든다.
    //
    // 부제를 버리는 것은 네이버와 같은 결정이다 (아래 "맨 앞의 부제를 버린다").
    // 같은 글을 어디서 읽느냐에 따라 다르게 판단하면 안 된다.
    host: /(^|\.)wikitree\.co\.kr$/,
    headline: ['h1#article', '.article_head h1'],
    body: ['.article_body .wikitree_content', '.article_body'],
    drop: [
      '.keyword_wrap', '.article_bottom', '.article_images_wrap', '.rel_articles',
      'figure', 'figcaption', 'script', 'style', 'table',
    ],
  },
]

const pick = (sels: string[]): Element | null => {
  for (const s of sels) {
    const el = document.querySelector(s)
    if (el) return el
  }
  return null
}

// 바이라인을 본문에서 걷어낸다.
//
// 안 걷어내면 "(서울=연합뉴스) 윤민혁 기자 = 첫 문장이다." 가 통째로 한 문장이 되고,
// 부제가 함께 붙어 오는 매체에서는 180자짜리 가짜 문장이 생긴다.
// 실제 기사에서 본 모양들 — 기자가 여럿이고 "수습기자" 가 섞이기도 한다.
//   (서울=연합뉴스) 윤민혁 기자 =
//   [서울=뉴시스]조수원 신유림 기자, 임다빈 수습기자 =
//   [OO일보 김철수 기자]
// **`String.raw` 로 묶는다.** 보통 템플릿 리터럴은 `\s` 를 `s` 로 죽여서
// 정규식이 조용히 다른 뜻이 된다 (이 저장소에서 같은 함정을 여러 번 밟았다).
const NAME = String.raw`[가-힣]{2,5}`
const ROLE = String.raw`(?:수습|객원|사진)?(?:기자|특파원|통신원)`
const ONE = String.raw`(?:${NAME}\s*)+${ROLE}`

/** `(매체) 이름 기자 =` 형태. 이름이 여럿일 수 있다. */
const BYLINE = new RegExp(
  String.raw`^[\s\S]{0,400}?[([][^)\]]{2,40}[)\]]\s*(?:${ONE})(?:\s*[,·및]\s*(?:${ONE}))*\s*[=:]\s*`,
)
/** `[OO일보 김철수 기자]` 처럼 대괄호 안에 들어간 형태. 본문 맨 앞일 때만 걷는다. */
const BYLINE_IN_BRACKET = new RegExp(String.raw`^\s*[([][^)\]]{2,40}${ROLE}[)\]]\s*`)

const TAIL = /(무단\s*전재|재배포\s*금지|저작권자|ⓒ|Copyright|▶|☞)/i

/**
 * 본문 **끝**에 이어 붙은 괄호 크레딧. `(취재보조: 김지수 통신원)` 같은 것.
 *
 * 줄 단위 필터는 크레딧이 **따로 한 줄**일 때만 걸러서, 마지막 문단 끝에 붙어 있으면
 * 줄을 합친 뒤 한 문장으로 남는다. 그러면 요청 하나를 쓰고 문장 비율 점수에도 섞인다.
 */
const CREDIT_TAIL = new RegExp(
  String.raw`\s*[([（][^)\]）]{0,40}(?:취재\s*보조|사진|영상|그래픽|기자|특파원|통신원)[^)\]）]{0,20}[)\]）]\s*$`,
)

/** 맨 앞에서 부제로 보고 버릴 수 있는 최대 줄 수. 넘으면 본문으로 본다. */
const MAX_SUBTITLE_LINES = 4
/** 이보다 길면 부제가 아니라 본문으로 본다. */
const SUBTITLE_MAX_CHARS = 80

/** 지금 페이지가 우리가 아는 기사 페이지면 제목·본문·문장을 돌려준다. */
export function extractArticle(): Article | null {
  const rule = RULES.find((r) => r.host.test(location.hostname))
  if (!rule) return null

  const headlineEl = pick(rule.headline)
  const bodyEl = pick(rule.body)
  if (!headlineEl || !bodyEl) return null

  const headline = (headlineEl.textContent ?? '').replace(/\s+/g, ' ').trim()

  // 원본 DOM 을 건드리지 않으려고 복제본에서 걷어낸다.
  const clone = bodyEl.cloneNode(true) as Element
  for (const sel of rule.drop) clone.querySelectorAll(sel).forEach((n) => n.remove())

  // **`textContent` 는 <br> 과 단락 경계를 아무것도 아닌 것으로 본다.**
  // 그대로 쓰면 "…권고했다.과학기술정보통신부는…" 처럼 마침표 뒤에 공백이 없어
  // 문장 분리가 통째로 실패한다 (실제 네이버 기사에서 확인했다).
  // 그래서 줄을 나누는 요소 자리에 개행을 심고 읽는다.
  for (const br of clone.querySelectorAll('br')) br.replaceWith('\n')
  for (const block of clone.querySelectorAll('p, div, section, li, h1, h2, h3, h4, blockquote')) {
    block.append('\n')
  }

  let lines = (clone.textContent ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // **맨 앞의 부제를 버린다.**
  // 바이라인이 없는 매체는 부제를 본문 첫머리에 `<br>` 로 나열한다. 그대로 두면
  // "화면 최적화 완료 모바일 게임도 UI 개편 … 애플의 첫 폴더블…" 처럼 부제 세 줄과
  // 첫 문장이 한 덩어리가 되어 그 덩어리가 통째로 판단 대상이 된다 (실제 기사에서 봤다).
  //
  // 부제는 종결부호로 끝나지 않는다. 그것으로 가른다. 본문 첫 줄을 잘못 버리지 않도록
  // **짧은 줄만, 앞에서 몇 줄만** 본다.
  let head = 0
  while (head < lines.length && head < MAX_SUBTITLE_LINES) {
    const l = lines[head] ?? ''
    // 종결부호 뒤에 닫는 따옴표·괄호가 올 수 있다. 마지막 글자만 보면
    // 한국 기사에 흔한 인용 리드("이번 조치는 효과가 없다.")가 부제로 오인돼
    // **본문 첫 문장이 통째로 버려진다.** 첫 문장은 대개 기사의 핵심 주장이다.
    if (/[.!?…]["'”’)\]]*$/.test(l) || l.length > SUBTITLE_MAX_CHARS) break
    head++
  }
  if (head < lines.length) lines = lines.slice(head)

  let body = lines
    .filter((l) => !TAIL.test(l))
    .filter((l) => !/^[[(][^\])]{0,40}[\])]$/.test(l))       // [사진] 한 줄
    .filter((l) => !/^[가-힣]{2,5}\s*(기자|특파원|통신원)$/.test(l)) // 이름만 있는 줄
    .filter((l) => !/@[\w.]+\.(com|co\.kr|net|kr)/.test(l))   // 메일 줄
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(BYLINE, '')
    .replace(BYLINE_IN_BRACKET, '')
    .replace(CREDIT_TAIL, '')

  if (!headline || body.length < 150) return null
  return { headline, body, sentences: splitSentences(body) }
}
