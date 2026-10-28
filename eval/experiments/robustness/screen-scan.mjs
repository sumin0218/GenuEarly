// 보내기 전 걷어내기(GE-35)가 **심지 않은 기사**에서 무엇을 걷어내는지 센다. Jev 를 부르지 않는다 (크레딧 0).
//
//   node screen-scan.mjs <articles.json> [<결과 폴더>]
//
// 정상 기사에서 걷어낸 것은 모두 오탐이다. 기사 id 와 걷어낸 덩어리 수만 남기고 글은 남기지 않는다.
// 본문(body), 문장(sents 또는 나눈 문장)을 중계 서버와 같은 함수로 본다. 제목은 중계 서버가 보지 않으므로 보지 않는다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitSentences } from '../sentence-batching/split.mjs'
import { SCHEMA } from './lib.mjs'
import { createScreen, SCREEN_VERSION } from '../../../packages/shared/src/screen.ts'

const [input, outdir] = process.argv.slice(2)
if (!input) throw new Error('사용법: node screen-scan.mjs <articles.json> [<결과 폴더>]')
const screen = createScreen(SCHEMA)
const articles = JSON.parse(readFileSync(resolve(input), 'utf8'))

const hits = []
let sentences = 0
for (const a of articles) {
  const sents = a.sents ?? splitSentences(a.body)
  sentences += sents.length
  const body = screen(a.body).removed
  const sent = sents.filter((s) => screen(s).removed).length
  if (body || sent) hits.push({ id: a.id, kind: a.kind ?? (a.url ? 'real' : null), body_removed: body, sentences_hit: sent })
}
const summary = {
  date: new Date().toISOString().slice(0, 10),
  screen: SCREEN_VERSION,
  question_set: SCHEMA.version,
  articles: articles.length,
  by_kind: articles.reduce((m, a) => ((m[a.kind ?? (a.url ? 'real' : 'unknown')] = (m[a.kind ?? (a.url ? 'real' : 'unknown')] ?? 0) + 1), m), {}),
  sentences,
  articles_hit: hits.length,
  hits,
}
console.log(`걷어내기 ${SCREEN_VERSION}: 기사 ${articles.length}건, 문장 ${sentences}개 중 걷어낸 기사 ${hits.length}건`)
for (const h of hits) console.log(`  ${h.id}  본문 ${h.body_removed}, 문장 ${h.sentences_hit}`)
if (outdir) {
  mkdirSync(resolve(outdir), { recursive: true })
  writeFileSync(resolve(outdir, 'screen-scan.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8')
}
