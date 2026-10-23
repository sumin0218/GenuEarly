// 평가 세트용 실제 기사를 네이버 뉴스에서 모은다.
//   - 6개 섹션 페이지: 정상 묶음의 모집단
//   - 언론사별 랭킹 뉴스: 경계·신호 뚜렷 묶음의 후보 (사람이 고른다)
// 본문은 private/ 아래에만 쌓는다. 저장소에는 URL·해시만 남는다 (../data/README.md 2절).
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { splitSentences } from '../experiments/sentence-batching/split.mjs'
import { clean } from './clean.mjs'

const OUT = new URL('../data/private/ge13/real/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } })
  if (!r.ok) throw new Error(`${r.status} ${u}`)
  return r.text()
}
const SECTIONS = { 100: '정치', 101: '경제', 102: '사회', 103: '생활문화', 104: '세계', 105: 'IT과학' }
const idsIn = (html) => [...new Set([...html.matchAll(/n\.news\.naver\.com\/(?:mnews\/)?article\/(\d+)\/(\d+)/g)].map((m) => `${m[1]}/${m[2]}`))]

// 1. 목록
const found = new Map() // id -> { sources: Set }
const add = (id, src) => { if (!found.has(id)) found.set(id, new Set()); found.get(id).add(src) }
for (const [sid, name] of Object.entries(SECTIONS)) {
  for (const id of idsIn(await get(`https://news.naver.com/section/${sid}`))) add(id, `section:${name}`)
  await sleep(500)
}
for (const id of idsIn(await get('https://news.naver.com/main/ranking/popularDay.naver'))) add(id, 'ranking')
// 증권 하위 섹션: 기계로 쓴 정형 기사(시황) 후보
await sleep(500)
for (const id of idsIn(await get('https://news.naver.com/breakingnews/section/101/258'))) add(id, 'stocks')
console.log(`목록 ${found.size}건`)

// 2. 정제는 clean.mjs

// 3. 후보 표시 — 사람이 고를 때 참고만 한다. 정답이 아니다.
const OPINION = /^\s*[\[【<(]?\s*(사설|칼럼|기고|시론|오피니언|기자수첩|데스크|논설|만물상|기자의 눈|특별기고|인터뷰)/
// '…'는 한국 기사 제목에서 구분 기호로 흔히 쓰여서 넣지 않는다 (넣으면 75%가 걸린다)
const SENSATIONAL = /(충격|경악|결국|이유는|이것|역대급|난리|발칵|헉|분노|폭탄|대참사|소름|\?\s*$|\?…|\? )/
const MACHINE = /(로봇\s*기자|자동\s*(생성|작성)|AI\s*기자|알고리즘(이|으로)\s*작성)/
const ROUTINE = /(마감|코스피|코스닥|환율|날씨|기온|미세먼지|[0-9]+\s*:\s*[0-9]+)/
const SOURCED = /(따르면|밝혔다|말했다|전했다|발표했다|설명했다|강조했다)/

const ids = [...found.keys()]
const out = []
for (const id of ids) {
  try {
    const url = `https://n.news.naver.com/article/${id}`
    const html = await get(url)
    const h = /<h2[^>]*id="title_area"[^>]*>([\s\S]*?)<\/h2>/i.exec(html)
    const b = /<article[^>]*id="dic_area"[^>]*>([\s\S]*?)<\/article>/i.exec(html)
    const press = /<meta name="twitter:creator" content="([^"]*)"/.exec(html)?.[1]
      ?? /<meta property="og:article:author" content="([^"|]*)/.exec(html)?.[1]?.trim() ?? ''
    if (!h || !b) { await sleep(300); continue }
    const { headline, body } = clean(h[1], b[1])
    const sents = splitSentences(body)
    const sources = [...found.get(id)]
    const section = sources.find((s) => s.startsWith('section:'))?.slice(8) ?? null
    out.push({
      id, url, press, section, sources, headline, body,
      body_chars: body.length,
      body_sha256: createHash('sha256').update(body, 'utf8').digest('hex'),
      n_sentences: sents.length,
      hints: {
        opinion: OPINION.test(headline),
        sensational_headline: SENSATIONAL.test(headline),
        machine_written: MACHINE.test(body) || ROUTINE.test(headline),
        unsourced: !SOURCED.test(body),
      },
    })
    await sleep(300)
  } catch (e) { console.error(String(e)) }
}
const stamp = new Date().toISOString().slice(0, 10)
writeFileSync(new URL(`articles-${stamp}.json`, OUT), JSON.stringify(out, null, 2), 'utf8')
const n = (f) => out.filter(f).length
console.log(`본문 ${out.length}건 · 섹션 ${n((a) => a.section)} · 섹션 밖 ${n((a) => !a.section)} · 언론사 미상 ${n((a) => !a.press)}`)
console.log(`힌트  의견글 ${n((a) => a.hints.opinion)} · 자극적 제목 ${n((a) => a.hints.sensational_headline)} · 정형/자동 ${n((a) => a.hints.machine_written)} · 출처 표현 없음 ${n((a) => a.hints.unsourced)}`)
