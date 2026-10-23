// 인젝션·보기 순서 검사를 Jev 에 실제로 보낸다. 답만 모으고 판정은 report.mjs 가 한다.
//
//   node --env-file=<.env> run.mjs <작업 디렉터리> [--limit N] [--sentences K]
//
// 입력: <작업 디렉터리>/articles.json — [{ id, headline, body, sents?, url?, kind? }]
// 출력: <작업 디렉터리>/runs.jsonl — 기사 하나가 한 줄. 이미 있는 기사는 건너뛰므로 끊겨도 이어서 돌린다.
// 작업 디렉터리는 저장소 밖으로 잡는다. 기사 본문과 심은 기사가 거기 있다.
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { post } from '../sentence-batching/jev.mjs'
import { splitSentences } from '../sentence-batching/split.mjs'
import { INJECTIONS,groupRequest, sentenceRequest, permutations, SCHEMA } from './lib.mjs'

const W = resolve(process.argv[2] ?? '')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d }
const LIMIT = arg('--limit', Infinity)
const K = arg('--sentences', 3)
if (!process.env.CHATKHU_API_KEY || !process.env.CHATKHU_API_BASE_URL) throw new Error('CHATKHU_API_KEY, CHATKHU_API_BASE_URL 이 필요하다 (--env-file)')

const articles = JSON.parse(readFileSync(resolve(W, 'articles.json'), 'utf8')).slice(0, LIMIT)
const OUT = resolve(W, 'runs.jsonl')
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [])

const PERMS = permutations(3) // Choice 보기는 모두 3개다. 첫 원소가 원래 순서
const inject = (text, add, position) => (position === 'start' ? `${add} ${text}` : `${text} ${add}`)
const pick = (arr, k) => (arr.length <= k ? arr.map((_, i) => i) : [...Array(k).keys()].map((j) => Math.round((j * (arr.length - 1)) / (k - 1 || 1))))

let model = null, requests = 0, errors = 0
async function call(body) {
  requests++
  try { const j = await post(body); model ??= j.model; return { answers: j.answers, tokens: j.usage?.input_tokens, model: j.model } }
  catch (e) { errors++; return { error: String(e.message ?? e) } }
}

for (const a of articles) {
  if (done.has(a.id)) continue
  const hb = { headline: a.headline, body: a.body }, ho = { headline: a.headline }
  const sents = a.sents ?? splitSentences(a.body)
  const jobs = {}

  // 보기 순서: 6가지 순서 + 원래 순서를 한 번 더 (같은 요청이 얼마나 흔들리는지 재는 기준)
  for (const [g, state] of [['headline_body', hb], ['headline_only', ho]]) {
    PERMS.forEach((p, k) => { jobs[`order:${g}:${k}`] = call(groupRequest(g, state, p)) })
    jobs[`order:${g}:repeat`] = call(groupRequest(g, state, PERMS[0]))
  }
  // 인젝션: 원래 보기 순서로, 심은 글만 바꾼다. 기준선은 위의 order:*:0 과 order:*:repeat 이다
  for (const inj of INJECTIONS.items) {
    if (inj.field === 'body') jobs[`inj:${inj.id}`] = call(groupRequest('headline_body', { ...hb, body: inject(a.body, inj.text, inj.position) }))
    if (inj.field === 'headline') jobs[`inj:${inj.id}`] = call(groupRequest('headline_only', { headline: inject(a.headline, inj.text, inj.position) }))
  }
  // 문장: 본문에서 고르게 K 개를 골라 기준선 두 번 + 문장 인젝션
  for (const i of pick(sents, K)) {
    jobs[`sent:${i}:base`] = call(sentenceRequest(sents[i]))
    jobs[`sent:${i}:repeat`] = call(sentenceRequest(sents[i]))
    for (const inj of INJECTIONS.items.filter((x) => x.field === 'sentence')) jobs[`sent:${i}:${inj.id}`] = call(sentenceRequest(inject(sents[i], inj.text, inj.position)))
  }

  const res = {}
  for (const [k, p] of Object.entries(jobs)) res[k] = await p
  // 기사 글은 남기지 않는다. 답만 남긴다
  appendFileSync(OUT, JSON.stringify({ id: a.id, url: a.url ?? null, kind: a.kind ?? (a.url ? 'real' : null), n_sents: sents.length, res }) + '\n', 'utf8')
  console.log(`${a.id}  요청 ${Object.keys(jobs).length}건  (누적 ${requests}, 실패 ${errors})`)
}

console.log(`끝. 요청 ${requests}건, 실패 ${errors}건, 응답 model=${model}, 질문 세트 ${SCHEMA.version}, 인젝션 ${INJECTIONS.version}`)
