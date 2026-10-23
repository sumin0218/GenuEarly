// labeling.md 를 ChatKHU 에 보여 주고 라벨러 사이에 해석이 갈릴 자리를 묻는다.
// 원문 응답은 증빙이므로 private/ 에 날짜별로 쌓는다 (커밋하지 않는다).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chat, MODEL } from './chatkhu.mjs'

const root = new URL('../', import.meta.url)
const doc = readFileSync(new URL('data/labeling.md', root), 'utf8')
const prompt = `아래는 한국어 뉴스 기사에 '주의 신호' 라벨을 붙이는 기준 문서다. 라벨러 두 명이 서로 보지 않고 따로 라벨을 붙인다.

이 문서를 그대로 따를 때 **두 라벨러의 판단이 갈릴 만한 자리**를 찾아 달라.
- 문서 안에서 서로 어긋나는 규칙
- 경계가 모호해 사람마다 다르게 읽을 정의
- 기준이 없어서 라벨러가 감으로 정하게 되는 경우 (구체적인 기사 유형을 예로)
각 지적마다 문서의 어느 절인지, 왜 갈리는지, 고칠 문장 제안을 적는다. 중요한 것부터 최대 10개.
문서가 이미 다룬 것을 다시 지적하지 않는다.

---
${doc}`

const res = await chat([{ role: 'user', content: prompt }], { temperature: 0.3 })
const dir = new URL('data/private/ge13/chatkhu/', root)
mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
writeFileSync(new URL(`review-labeling-${stamp}.md`, dir), `<!-- model: ${res.model} (requested ${MODEL}) -->\n\n${res.text}\n`, 'utf8')
console.log(`model=${res.model} finish=${res.finish} usage=${JSON.stringify(res.usage)}\n`)
console.log(res.text)
