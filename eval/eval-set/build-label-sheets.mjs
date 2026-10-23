// 2단계: 사람이 고른 후보와 가상 기사를 합쳐 120건을 확정하고, 라벨러별 입력 시트를 만든다.
//
//   node eval/eval-set/build-label-sheets.mjs
//   → private/ge13/manifest.v1.json   (id ↔ 기사, 묶음, 튜닝/확인 분할, 문장 라벨 대상)
//   → private/ge13/라벨-A.xlsx, 라벨-B.xlsx
//
// 라벨러 시트에는 묶음(정상·경계·신호 뚜렷)을 보여 주지 않고 순서도 섞는다. 묶음을 알면 판단이 기운다.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { splitSentences } from '../experiments/sentence-batching/split.mjs'

const P = new URL('../data/private/ge13/', import.meta.url)
const SCHEMA = JSON.parse(readFileSync(new URL('../../packages/shared/judgment-items.json', import.meta.url), 'utf8'))
const REAL = new URL('real/', P)
const latest = readdirSync(REAL).filter((f) => /^articles-.*\.json$/.test(f)).sort().at(-1)
const byId = new Map(JSON.parse(readFileSync(new URL(latest, REAL), 'utf8')).map((a) => [a.id, a]))

// 사람이 고른 것 읽기
const pick = new ExcelJS.Workbook()
await pick.xlsx.readFile(new URL('후보선정.xlsx', P))
const rows = (ws) => { const out = []; ws.eachRow((r, i) => { if (i > 1) out.push(r.values) }); return out }
const GROUP = {
  '경계-자극적 제목': ['borderline', 'sensational_headline'],
  '경계-출처 없는 정상': ['borderline', 'unsourced_true'],
  '경계-기계 작성': ['borderline', 'machine_written'],
  '신호 뚜렷': ['signal', null],
}
const chosen = []
for (const v of rows(pick.getWorksheet('정상'))) if (v[8] !== '제외') chosen.push({ src: v[1], group: 'normal', borderline_type: null })
const practice = []
for (const v of rows(pick.getWorksheet('후보'))) {
  if (v[2] === '연습용') practice.push(v[1])
  else if (GROUP[v[2]]) chosen.push({ src: v[1], group: GROUP[v[2]][0], borderline_type: GROUP[v[2]][1] })
}

// 가상 기사
const FIC = new URL('fictional/', P)
const fictional = readdirSync(FIC).filter((f) => /^f-\d+\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(new URL(f, FIC), 'utf8')))
const notRewritten = fictional.filter((f) => f.human_rewrite && !f.rewritten_by)
if (notRewritten.length) console.warn(`사람이 고쳐 쓰지 않은 초안: ${notRewritten.map((f) => f.id).join(', ')} (rewritten_by 를 채운다)`)

// 건수 확인
const count = (g, t) => chosen.filter((c) => c.group === g && (t === undefined || c.borderline_type === t)).length
const WANT = [['normal', undefined, 60], ['borderline', 'sensational_headline', 10], ['borderline', 'unsourced_true', 10], ['borderline', 'machine_written', 10], ['signal', undefined, 15]]
for (const [g, t, w] of WANT) if (count(g, t) !== w) console.warn(`${g}${t ? `/${t}` : ''}: ${count(g, t)}건 (목표 ${w})`)
if (fictional.length !== 15) console.warn(`가상 기사 ${fictional.length}건 (목표 15)`)

// id 부여, 분할, 문장 라벨 대상 — 씨앗 고정
let seed = 20261024
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const shuffle = (a) => a.map((v) => [rnd(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1])
const items = [
  ...chosen.map((c, i) => {
    const a = byId.get(c.src)
    return { id: `r-${String(i + 1).padStart(3, '0')}`, kind: 'real', url: a.url, private_path: `real/${latest}#${a.id}`, group: c.group, borderline_type: c.borderline_type, section: a.section, collected_at: latest.slice(9, 19), body_sha256: a.body_sha256, body_chars: a.body_chars, headline: a.headline, body: a.body }
  }),
  ...fictional.map((f) => ({ id: f.id, kind: 'fictional', url: null, private_path: `fictional/${f.id}.json`, group: 'fictional', borderline_type: null, section: null, collected_at: f.generated_at.slice(0, 10), body_sha256: null, body_chars: f.body.length, headline: f.headline, body: f.body })),
]
const SENT = { normal: 12, borderline: 9, signal: 4, fictional: 5 }
for (const g of ['normal', 'borderline', 'signal', 'fictional']) {
  const gi = shuffle(items.filter((x) => x.group === g))
  const nHold = Math.round(gi.length * 0.3)
  gi.forEach((x, k) => { x.split = k < nHold ? 'holdout' : 'tune' })
  shuffle(gi).forEach((x, k) => { x.sentence_labels = k < SENT[g] })
}

writeFileSync(new URL('manifest.v1.json', P), JSON.stringify({
  version: 1, created_at: new Date().toISOString(), splitter: 'sentence-batching/split.mjs@83faf82', source_file: latest,
  practice, items: items.map(({ headline, body, ...m }) => m),
}, null, 2), 'utf8')

// 라벨러 시트
const ITEMS = SCHEMA.items.filter((i) => i.id !== 'unverifiable_claim')
const choices = (it) => (it.type === 'choice' ? Object.keys(it.question.criteria) : ['0', '1', '2', '3']).concat('na')
const order = shuffle(items)
const byIdAll = new Map(items.map((x) => [x.id, x]))

for (const who of ['A', 'B']) {
  const wb = new ExcelJS.Workbook()
  const g = wb.addWorksheet('읽어 주세요'); g.getColumn(1).width = 120
  ;[
    `라벨러 ${who} 시트 — 기준: eval/data/labeling.md 1.0.0 · 질문 세트 ${SCHEMA.version}`,
    '',
    '1. 다른 라벨러의 시트와 Jev 결과를 보지 않는다. 기사 내용이 사실인지 검색하지 않는다.',
    "2. '기사' 시트: 한 줄이 기사 하나. URL이 있으면 열어서 읽고, 없으면 '가상 기사 본문' 시트에서 읽는다.",
    '3. 배지 하나와 항목 6개를 드롭다운에서 고른다. 애매했거나 두 층이 어긋나면 메모에 적는다 (labeling.md 5절).',
    "4. '문장' 시트: 표시된 기사의 문장마다 예/아니오 두 개. 문장이 잘못 쪼개졌으면 na.",
    "5. '연습' 시트는 라벨러 두 명이 함께 먼저 해 본다. 세트에 들어가지 않는다.",
    '',
    '배지: clear 🟢 · neutral 🟡 · caution 🔴',
    ...ITEMS.map((it) => `${it.id}: ${choices(it).join(' / ')}`),
    '',
    '이 파일에는 기사 제목과 문장이 들어 있다. 저장소에 커밋하지 않는다.',
  ].forEach((t, i) => { g.getCell(i + 1, 1).value = t })
  g.getRow(1).font = { bold: true, size: 13 }

  const sheetFor = (name, list, linkOf) => {
    const ws = wb.addWorksheet(name)
    ws.columns = [
      { header: 'id', key: 'id', width: 10 }, { header: '제목', key: 'h', width: 50 }, { header: '열기', key: 'url', width: 18 },
      { header: '배지', key: 'badge', width: 10 },
      ...ITEMS.map((it) => ({ header: it.id, key: it.id, width: 18 })),
      { header: '메모', key: 'note', width: 50 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
    list.forEach((x, k) => {
      ws.addRow({ id: x.id, h: x.headline, url: linkOf(x) })
      const r = k + 2
      ws.getCell(r, 4).dataValidation = { type: 'list', allowBlank: true, formulae: ['"clear,neutral,caution"'] }
      ITEMS.forEach((it, j) => { ws.getCell(r, 5 + j).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${choices(it).join(',')}"`] } })
    })
  }
  sheetFor('기사', order, (x) => (x.url ? { text: '기사 열기', hyperlink: x.url } : '가상 기사 본문 시트'))
  sheetFor('연습', practice.map((src, k) => { const a = byId.get(src); return { id: `p-${String(k + 1).padStart(2, '0')}`, headline: a.headline, url: a.url } }), (x) => ({ text: '기사 열기', hyperlink: x.url }))

  const fs = wb.addWorksheet('가상 기사 본문')
  fs.columns = [{ header: 'id', key: 'id', width: 8 }, { header: '제목', key: 'h', width: 50 }, { header: '본문', key: 'b', width: 120 }]
  fs.getRow(1).font = { bold: true }
  for (const x of order.filter((x) => x.kind === 'fictional')) {
    const row = fs.addRow({ id: x.id, h: x.headline, b: x.body })
    row.alignment = { wrapText: true, vertical: 'top' }
  }

  const ss = wb.addWorksheet('문장')
  ss.columns = [
    { header: 'id', key: 'id', width: 8 }, { header: 'i', key: 'i', width: 5 }, { header: '문장', key: 's', width: 100 },
    { header: 'factual_assertion', key: 'fa', width: 16 }, { header: 'named_basis', key: 'nb', width: 13 }, { header: '메모', key: 'note', width: 40 },
  ]
  ss.getRow(1).font = { bold: true }
  ss.views = [{ state: 'frozen', ySplit: 1 }]
  let r = 2
  for (const x of order.filter((x) => x.sentence_labels)) {
    splitSentences(byIdAll.get(x.id).body).forEach((s, i) => {
      const row = ss.addRow({ id: x.id, i, s })
      row.alignment = { wrapText: true, vertical: 'top' }
      for (const c of [4, 5]) ss.getCell(r, c).dataValidation = { type: 'list', allowBlank: true, formulae: ['"true,false,na"'] }
      r++
    })
  }
  await wb.xlsx.writeFile(new URL(`라벨-${who}.xlsx`, P))
}
const sentN = items.filter((x) => x.sentence_labels).reduce((t, x) => t + splitSentences(x.body).length, 0)
console.log(`세트 ${items.length}건 (튜닝 ${items.filter((x) => x.split === 'tune').length} · 확인 ${items.filter((x) => x.split === 'holdout').length}) · 문장 라벨 ${items.filter((x) => x.sentence_labels).length}건 ${sentN}문장 · 연습 ${practice.length}건`)
