// 원본 HTML 에서 제목·본문을 뽑는다. 확장 프로그램이 할 일의 원형이다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitSentences } from './split.mjs'

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
  .replace(/&#(d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/&amp;/g, '&')

// 바이라인: "(서울=연합뉴스) 윤민혁 기자 =" / "[OO일보 김철수 기자]" 등
const BYLINE = /^[\s\S]{0,400}?[(\[][^)\]]{2,40}[)\]]\s*[가-힣]{2,5}\s*(기자|특파원|객원기자)\s*[=:]\s*/
const TAIL = /(무단\s*전재|재배포\s*금지|저작권자|ⓒ|Copyright|▶|☞|구독|제보)/i

const arts = JSON.parse(readFileSync(resolve(process.argv[2], 'raw.json'), 'utf8'))
const out = []
for (const a of arts) {
  const headline = text(a.headlineHtml).replace(/\s+/g, ' ').trim()
  let lines = text(a.bodyHtml).split('\n').map((l) => l.trim()).filter(Boolean)
  lines = lines.filter((l) => !TAIL.test(l))
  lines = lines.filter((l) => !/^[\[(][^\])]{0,40}[\])]$/.test(l))        // [사진] 한 줄
  lines = lines.filter((l) => !/^[가-힣]{2,5}\s*(기자|특파원)$/.test(l))   // 이름만 있는 줄
  lines = lines.filter((l) => !/@[\w.]+\.(com|co\.kr|net|kr)/.test(l))     // 메일 줄
  let body = lines.join(' ').replace(/\s+/g, ' ').trim()
  body = body.replace(BYLINE, '')                                          // 부제 + 바이라인 통째로
  if (body.length < 150) continue
  const sents = splitSentences(body)
  if (sents.length < 3) continue
  out.push({ ...a, headline, body, sents, n: sents.length, headlineHtml: undefined, bodyHtml: undefined })
}
writeFileSync(resolve(process.argv[2], 'articles.json'), JSON.stringify(out, null, 2), 'utf8')
const ns = out.map((a) => a.n).sort((x, y) => x - y)
console.log(`기사 ${out.length}건`)
console.log(`문장 수  최소 ${ns[0]}  중앙 ${ns[Math.floor(ns.length / 2)]}  최대 ${ns.at(-1)}`)
console.log(`  3~7문장 ${ns.filter((n) => n <= 7).length}건 · 8~14 ${ns.filter((n) => n > 7 && n < 15).length}건 · 15~25 ${ns.filter((n) => n >= 15 && n <= 25).length}건 · 26+ ${ns.filter((n) => n > 25).length}건`)
const bad = out.filter((a) => a.sents.some((s) => s.length > 160))
console.log(`160자 넘는 문장이 있는 기사: ${bad.length}건 ${bad.length ? '(분리 의심 — 확인 필요)' : ''}`)
