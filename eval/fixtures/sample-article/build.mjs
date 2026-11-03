// testJournal — 랜딩 스크린샷용 가짜 언론사 사이트를 만든다.
//
//   node eval/fixtures/sample-article/build.mjs
//
// **왜 손으로 쓰지 않고 찍어 내나.** 기사 여섯 장이 틀과 머리·바닥을 공유한다.
// 손으로 쓰면 한 곳을 고칠 때 여섯 군데를 고쳐야 하고, 한 장만 빠뜨리면 사진마다
// 다른 사이트처럼 보인다.
//
// 지켜야 하는 것 셋 — 어기면 확장 프로그램이 이 자료를 못 읽는다.
//
//   1. 기사 파일 이름은 `c-1NN.html`. 목록이 기사 링크를 그 모양으로 가려낸다
//      (apps/extension/match-patterns.ts 의 `FIXTURE_ARTICLE`)
//   2. 기사 본문은 `article#article` 안의 `h1#headline` 과 `#body`
//      (apps/extension/lib/extract.ts 의 `FIXTURE_RULE`)
//   3. 제목(`<title>`)은 `[테스트용]` 으로 시작. 목록 페이지에서 ② 가 그것을 보고
//      "자료 페이지" 로 판단한다 (apps/extension/lib/fixture.ts)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARTICLES } from './articles.mjs'

const 여기 = dirname(fileURLToPath(import.meta.url))

/**
 * 사진과 그 출처. [fetch-photos.mjs](fetch-photos.mjs) 가 받으면서 적어 둔 것이다.
 *
 * **없어도 돈다.** 사진을 받지 않은 사람도 틀은 볼 수 있어야 한다 — 그때는
 * 회색 자리만 남는다.
 */
let PHOTOS = {}
try {
  const j = JSON.parse(readFileSync(join(여기, 'photos.json'), 'utf8'))
  PHOTOS = Object.fromEntries(j.photos.map((x) => [x.id, x]))
} catch {
  console.warn('photos.json 이 없다. 사진 자리를 비워 둔다 — node fetch-photos.mjs')
}
const PRESS = 'testJournal'
const DATE = '2026-10-28'

/** `<` 와 `&` 만 막으면 된다. 우리가 쓴 글이라 따옴표는 그대로 둔다. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const 머리 = (섹션) => `<header class="masthead">
  <div class="masthead__top">
    <a class="wordmark" href="./index.html">test<em>Journal</em></a>
    <span class="masthead__meta">2026년 10월 28일 수요일</span>
  </div>
  <nav class="gnb" aria-label="섹션">
    <ul>
      ${['정치', '사회', '경제', '생활', '문화', '스포츠']
        .map((s) => `<li><a class="${s === 섹션 ? 'on' : ''}" href="./index.html">${s}</a></li>`)
        .join('\n      ')}
    </ul>
  </nav>
</header>`

const 바닥 = `<footer class="site">
  <div>${PRESS} · 시험용으로 만든 가상의 언론사입니다. 실제로 존재하지 않습니다.</div>
</footer>`

const 안내 = `<p class="notice">
  이 페이지는 <b>GenuEarly 를 시험하려고 만든 가짜 기사</b>입니다.
  언론사 <b>${PRESS}</b>, 지명, 인물, 사건이 모두 지어낸 것입니다.
</p>`

const 틀 = ({ title, body, cls = '' }) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>[테스트용] ${esc(title)}</title>
<meta property="article:published_time" content="${DATE}">
<link rel="stylesheet" href="./press.css">
</head>
<body class="${cls}">
${안내}
${body}
${바닥}
</body>
</html>
`

// ── 기사 ──────────────────────────────────────────────────────────────

function 기사(a) {
  const 섹션 = a.section.split(' · ')[0]
  const 본문 = a.body.map((p) => `      <p>${esc(p)}</p>`)
  // 사진은 둘째 문단 뒤에 넣는다. 맨 위에 두면 제목과 본문이 멀어진다.
  const 사진 = PHOTOS[a.id]
  const 그림 = 사진
    ? `<img src="./${사진.file}" alt="${esc(a.photo)}" loading="lazy" decoding="async">`
    : '<div class="ph">사진 자리</div>'
  // **원본 라이선스를 사진 밑에 적는다.** 캡션의 "ⓒ testJournal" 은 가짜 언론사의
  // 것이라 출처 표기가 아니다 — 진짜 출처는 이 줄이다.
  const 출처 = 사진
    ? `<span class="credit">원본 ${esc(사진.license)} · Wikimedia Commons</span>`
    : ''
  본문.splice(2, 0, `      <figure class="photo">
        ${그림}
        <figcaption>${esc(a.photo)} ⓒ ${PRESS}${출처}</figcaption>
      </figure>`)

  return 틀({
    title: a.headline,
    body: `${머리(섹션)}
<main class="sheet">
  <article id="article">
    <p class="crumb"><b>${esc(섹션)}</b>${esc(a.section.replace(섹션, ''))}</p>
    <h1 id="headline">${esc(a.headline)}</h1>
    <p class="standfirst">${esc(a.standfirst)}</p>

    <div class="byline">
      <span><b>${esc(a.reporter.name)}</b> 기자</span>
      <span class="sep">|</span>
      <span>입력 ${esc(a.at.pub)}</span>
      ${a.at.mod ? `<span class="sep">|</span>\n      <span>수정 ${esc(a.at.mod)}</span>` : ''}

      <!-- **④ 공유 직전 알림이 여기를 듣는다.** 클래스와 aria-label 이 단서가 된다
           (apps/extension/lib/share.ts 의 isShareControl) -->
      <div class="share">
        <button type="button" class="btn_share" aria-label="공유하기">공유</button>
        <button type="button" class="btn_copy_url" aria-label="URL 복사">주소 복사</button>
      </div>
    </div>

    <div id="body">
${본문.join('\n')}
    </div>

    <p class="reporter">${esc(a.reporter.name)} 기자 ${a.reporter.mail}@testjournal.example</p>
    <p class="copyright">ⓒ ${PRESS}. 무단 전재 및 재배포 금지.</p>
  </article>
</main>

<aside class="related">
  <h2>함께 본 기사</h2>
  <ul>
    ${ARTICLES.filter((x) => x.id !== a.id)
      .slice(0, 3)
      .map((x) => `<li><a href="./${x.id}.html">${esc(x.headline)}</a></li>`)
      .join('\n    ')}
  </ul>
</aside>`,
  })
}

// ── 목록 ──────────────────────────────────────────────────────────────
//
// **② 목록 표시를 찍는 자리다.** 제목 링크가 `c-1NN.html` 을 가리켜야 ② 가 기사로
// 알아본다. 제목 옆에 동그라미가 붙고, 오른쪽 아래에 범례가 뜬다.

const 목록 = 틀({
  cls: 'is-list',
  title: `${PRESS} — 사회`,
  body: `${머리('사회')}
<main class="list">
  <h1 class="list__title">사회</h1>

  <ol class="feed">
    ${ARTICLES.map(
      (a) => `<li class="feed__item">
      <a class="feed__thumb" href="./${a.id}.html" aria-hidden="true" tabindex="-1">${
        PHOTOS[a.id] ? `<img src="./${PHOTOS[a.id].file}" alt="" loading="lazy">` : '<span>사진</span>'
      }</a>
      <div class="feed__text">
        <a class="feed__head" href="./${a.id}.html">${esc(a.headline)}</a>
        <p class="feed__lede">${esc(a.standfirst)}</p>
        <p class="feed__meta">${PRESS} · ${esc(a.reporter.name)} 기자 · ${esc(a.at.pub.slice(0, 10))}</p>
      </div>
    </li>`,
    ).join('\n    ')}
  </ol>
</main>`,
})

// ── 쓰기 ──────────────────────────────────────────────────────────────

let n = 0
for (const a of ARTICLES) {
  writeFileSync(join(여기, `${a.id}.html`), 기사(a))
  n += 1
}
writeFileSync(join(여기, 'index.html'), 목록)
console.log(`목록 1장 + 기사 ${n}장`)
