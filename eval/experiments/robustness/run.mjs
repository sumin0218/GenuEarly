// 인젝션·보기 순서 검사를 Jev 에 실제로 보낸다. 답만 모으고 판정은 report.mjs 가 한다.
//
//   node --env-file=<.env> run.mjs <작업 디렉터리> [--limit N] [--sentences K]
//
// 입력: <작업 디렉터리>/articles.json — [{ id, headline, body, sents?, url?, kind? }]
// 출력: <작업 디렉터리>/runs.jsonl — 기사 하나가 한 줄. **이미 받은 요청은 다시 보내지 않는다.**
//       끊겨도 이어서 돌리고, injections.json 에 문장을 더하면 그 문장의 요청만 보낸다. 실패했던 요청은 다시 보낸다.
// 작업 디렉터리는 저장소 밖으로 잡는다. 기사 본문과 심은 기사가 거기 있다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { post } from '../sentence-batching/jev.mjs'
import { splitSentences } from '../sentence-batching/split.mjs'
import { INJECTIONS, groupRequest, sentenceRequest, permutations, SCHEMA } from './lib.mjs'

const W = resolve(process.argv[2] ?? '')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d }
const LIMIT = arg('--limit', Infinity)
const K = arg('--sentences', 3)
if (!process.env.CHATKHU_API_KEY || !process.env.CHATKHU_API_BASE_URL) throw new Error('CHATKHU_API_KEY, CHATKHU_API_BASE_URL 이 필요하다 (--env-file)')

const articles = JSON.parse(readFileSync(resolve(W, 'articles.json'), 'utf8')).slice(0, LIMIT)
const OUT = resolve(W, 'runs.jsonl')
const prev = new Map((existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []).map((r) => [r.id, r]))
const save = () => writeFileSync(OUT, [...prev.values()].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

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
  const old = prev.get(a.id)?.res ?? {}
  const hb = { headline: a.headline, body: a.body }, ho = { headline: a.headline }
  const sents = a.sents ?? splitSentences(a.body)
  const jobs = {}
  const want = (key, body) => { if (!old[key] || old[key].error) jobs[key] = call(body()) }

  // 보기 순서: 6가지 순서 + 원래 순서를 한 번 더 (같은 요청이 얼마나 흔들리는지 재는 기준)
  for (const [g, state] of [['headline_body', hb], ['headline_only', ho]]) {
    PERMS.forEach((p, k) => want(`order:${g}:${k}`, () => groupRequest(g, state, p)))
    want(`order:${g}:repeat`, () => groupRequest(g, state, PERMS[0]))
  }
  // 인젝션: 원래 보기 순서로, 심은 글만 바꾼다. 기준선은 위의 order:*:0 과 order:*:repeat 이다
  for (const inj of INJECTIONS.items) {
    if (inj.field === 'body') want(`inj:${inj.id}`, () => groupRequest('headline_body', { ...hb, body: inject(a.body, inj.text, inj.position) }))
    if (inj.field === 'headline') want(`inj:${inj.id}`, () => groupRequest('headline_only', { headline: inject(a.headline, inj.text, inj.position) }))
  }
  // 문장: 본문에서 고르게 K 개를 골라 기준선 두 번 + 문장 인젝션
  for (const i of pick(sents, K)) {
    want(`sent:${i}:base`, () => sentenceRequest(sents[i]))
    want(`sent:${i}:repeat`, () => sentenceRequest(sents[i]))
    for (const inj of INJECTIONS.items.filter((x) => x.field === 'sentence')) want(`sent:${i}:${inj.id}`, () => sentenceRequest(inject(sents[i], inj.text, inj.position)))
  }

  if (!Object.keys(jobs).length) continue
  const res = { ...old }
  for (const [k, p] of Object.entries(jobs)) res[k] = await p
  // 기사 글은 남기지 않는다. 답만 남긴다
  prev.set(a.id, { id: a.id, url: a.url ?? null, kind: a.kind ?? (a.url ? 'real' : null), n_sents: sents.length, res })
  save()
  console.log(`${a.id}  요청 ${Object.keys(jobs).length}건  (누적 ${requests}, 실패 ${errors})`)
}

console.log(`끝. 요청 ${requests}건, 실패 ${errors}건, 응답 model=${model}, 질문 세트 ${SCHEMA.version}, 인젝션 ${INJECTIONS.version}`)
