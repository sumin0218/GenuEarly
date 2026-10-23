// 인젝션·보기 순서 검사를 Jev 에 실제로 보낸다. 답만 모으고 판정은 report.mjs 가 한다.
//
//   node --env-file=<.env> run.mjs <작업 디렉터리> [--limit N] [--sentences K] [--adopt-unhashed]
//
// 입력: <작업 디렉터리>/articles.json — [{ id, headline, body, sents?, url?, kind? }]
// 출력: <작업 디렉터리>/runs.jsonl — 기사 하나가 한 줄. 답마다 요청 본문의 해시(h)와 받은 시각(at)을 남긴다.
//       **같은 요청을 이미 받았으면 다시 보내지 않는다.** "같은 요청" 은 키가 아니라 요청 본문 해시로 가린다.
//       그래서 질문 문구, 유도 문장, 기사 글 중 하나라도 바뀌면 그 요청은 다시 보낸다. 실패했던 요청도 다시 보낸다.
//       --adopt-unhashed: 해시가 없는 옛 답(2026-10-23 첫 측정)에 지금 요청의 해시를 붙이고 다시 보내지 않는다.
//         그 답이 지금과 같은 질문 세트·문장·기사로 받은 것이 확실할 때만 쓴다. 이 옵션이 없으면 해시 없는 답은 다시 보낸다.
// 작업 디렉터리는 저장소 밖으로 잡는다. 기사 본문과 심은 기사가 거기 있다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { post } from '../sentence-batching/jev.mjs'
import { splitSentences } from '../sentence-batching/split.mjs'
import { INJECTIONS, groupRequest, sentenceRequest, permutations, SCHEMA } from './lib.mjs'

const W = resolve(process.argv[2] ?? '')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d }
const LIMIT = arg('--limit', Infinity)
const K = arg('--sentences', 3)
const ADOPT = process.argv.includes('--adopt-unhashed')
const hash = (body) => createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
if (!ADOPT && (!process.env.CHATKHU_API_KEY || !process.env.CHATKHU_API_BASE_URL)) throw new Error('CHATKHU_API_KEY, CHATKHU_API_BASE_URL 이 필요하다 (--env-file)')

const articles = JSON.parse(readFileSync(resolve(W, 'articles.json'), 'utf8')).slice(0, LIMIT)
const OUT = resolve(W, 'runs.jsonl')
const prev = new Map((existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []).map((r) => [r.id, r]))
const save = () => writeFileSync(OUT, [...prev.values()].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

const PERMS = permutations(3) // Choice 보기는 모두 3개다. 첫 원소가 원래 순서
const inject = (text, add, position) => (position === 'start' ? `${add} ${text}` : `${text} ${add}`)
const pick = (arr, k) => (arr.length <= k ? arr.map((_, i) => i) : [...Array(k).keys()].map((j) => Math.round((j * (arr.length - 1)) / (k - 1 || 1))))

let model = null, requests = 0, errors = 0, adopted = 0, stale = 0
async function call(body, h) {
  requests++
  const at = new Date().toISOString()
  try { const j = await post(body); model ??= j.model; return { answers: j.answers, tokens: j.usage?.input_tokens, model: j.model, h, at } }
  catch (e) { errors++; return { error: String(e.message ?? e), h, at } }
}

for (const a of articles) {
  const old = prev.get(a.id)?.res ?? {}
  const hb = { headline: a.headline, body: a.body }, ho = { headline: a.headline }
  const sents = a.sents ?? splitSentences(a.body)
  const jobs = {}
  let touched = false
  const want = (key, make) => {
    const body = make(), h = hash(body), o = old[key]
    if (o && !o.error && o.h === h) return
    if (o && !o.error && !o.h && ADOPT) { o.h = h; adopted++; touched = true; return }
    if (o && !o.error) stale++
    if (!ADOPT) jobs[key] = call(body, h)
  }

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

  if (!Object.keys(jobs).length) { if (touched) { prev.get(a.id).res = old; save() } continue }
  const res = { ...old }
  for (const [k, p] of Object.entries(jobs)) res[k] = await p
  // 기사 글은 남기지 않는다. 답만 남긴다
  prev.set(a.id, { id: a.id, url: a.url ?? null, kind: a.kind ?? (a.url ? 'real' : null), n_sents: sents.length, res })
  save()
  console.log(`${a.id}  요청 ${Object.keys(jobs).length}건  (누적 ${requests}, 실패 ${errors})`)
}

console.log(`끝. 요청 ${requests}건, 실패 ${errors}건, 바뀌어서 다시 보냄 ${stale}건, 해시를 붙인 옛 답 ${adopted}건, 응답 model=${model}, 질문 세트 ${SCHEMA.version}, 인젝션 ${INJECTIONS.version}`)
