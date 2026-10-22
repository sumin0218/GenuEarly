// 네이버 뉴스에서 기사를 모은다. 본문 정제는 clean.mjs 가 따로 한다 (다시 받지 않으려고).
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const OUT = resolve(process.argv[2]); mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } }); if (!r.ok) throw new Error(r.status); return r.text() }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SECTIONS = { 100: '정치', 101: '경제', 102: '사회', 103: '생활문화', 104: '세계', 105: 'IT과학' }

const found = []
for (const [sid, name] of Object.entries(SECTIONS)) {
  const html = await get(`https://news.naver.com/section/${sid}`)
  const ids = [...new Set([...html.matchAll(/n\.news\.naver\.com\/(?:mnews\/)?article\/(\d+)\/(\d+)/g)].map((m) => `${m[1]}/${m[2]}`))]
  for (const id of ids.slice(0, 14)) found.push({ id, section: name })
  await sleep(400)
}

const out = []
for (const { id, section } of found) {
  try {
    const html = await get(`https://n.news.naver.com/article/${id}`)
    const h = /<h2[^>]*id="title_area"[^>]*>([\s\S]*?)<\/h2>/i.exec(html)
    const b = /<article[^>]*id="dic_area"[^>]*>([\s\S]*?)<\/article>/i.exec(html)
    const press = /"PRESS_NM"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? /<meta property="og:site_name" content="([^"]*)"/.exec(html)?.[1] ?? ''
    if (!h || !b) { await sleep(250); continue }
    out.push({ id, section, press, url: `https://n.news.naver.com/article/${id}`, headlineHtml: h[1], bodyHtml: b[1] })
    await sleep(250)
  } catch { /* 넘어간다 */ }
}
writeFileSync(resolve(OUT, 'raw.json'), JSON.stringify(out), 'utf8')
console.log(`원본 ${out.length}건 저장`)
