// 기사 HTML 에서 제목·본문을 뽑는다.
// ../experiments/sentence-batching/clean.mjs 의 규칙을 옮기고 바이라인 처리를 보강했다. 그쪽은 실험 기록이라 손대지 않는다.
const text = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<span class="end_photo_org">[\s\S]*?<\/span>/gi, '')
  .replace(/<em class="img_desc">[\s\S]*?<\/em>/gi, '')
  .replace(/<strong class="media_end_summary">[\s\S]*?<\/strong>/gi, '')
  .replace(/<div class="vod_player_wrap[\s\S]*?<\/div>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div)[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&amp;/g, '&')
  .replace(/&[a-z]+;/gi, ' ')
const BYLINE = /^[\s\S]{0,400}?[(\[][^)\]]{2,40}[)\]]\s*[가-힣]{2,5}\s*(기자|특파원|객원기자)\s*[=:]\s*/
// clean.mjs 의 BYLINE 이 놓치는 바이라인: 기자 여럿, 선임·수습, '[언론사 이름 기자]', '[언론사｜이름 기자]'.
// 바이라인 앞의 부제·사진 설명도 함께 걷힌다 (200자 이내). 처음 모은 본문의 9%에 남아 있었다.
const ONE = String.raw`(?:[가-힣]{2,5}(?:\s*수습)?[\s·]*){1,6}(?:선임|수석|객원|인턴|전문)?\s*(?:기자|특파원)`
const NAMES = String.raw`${ONE}(?:\s*${ONE})?`
const B_PAREN = new RegExp(String.raw`^[\s\S]{0,200}?[\[(【][^\])】]{1,40}[\])】]\s*${NAMES}\s*[=:]\s*`)
const B_BRACKET = new RegExp(String.raw`^[\s\S]{0,200}?[\[【][^\]】]{0,25}?[\s=｜ㅣ|]${NAMES}\s*[\]】]\s*`)
export const stripByline = (b) => b.replace(B_PAREN, '').replace(B_BRACKET, '')
const TAIL = /(무단\s*전재|재배포\s*금지|저작권자|ⓒ|Copyright|▶|☞|구독|제보)/i
export const clean = (headlineHtml, bodyHtml) => {
  const headline = text(headlineHtml).replace(/\s+/g, ' ').trim()
  let lines = text(bodyHtml).split('\n').map((l) => l.trim()).filter(Boolean)
  lines = lines.filter((l) => !TAIL.test(l))
    .filter((l) => !/^[\[(][^\])]{0,40}[\])]$/.test(l))
    .filter((l) => !/^[가-힣]{2,5}\s*(기자|특파원)$/.test(l))
    .filter((l) => !/@[\w.]+\.(com|co\.kr|net|kr)/.test(l))
  const body = stripByline(lines.join(' ').replace(/\s+/g, ' ').trim().replace(BYLINE, ''))
  return { headline, body }
}

