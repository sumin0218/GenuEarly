// 1단계: 정상 60건을 고정 씨앗으로 뽑고, 나머지를 경계·신호 뚜렷 후보로 엑셀에 펼친다.
// 사람이 후보 시트의 '묶음' 칸을 고른다. 고른 결과는 build-label-sheets.mjs 가 읽는다.
//
//   node eval/eval-set/build-candidates.mjs
//   → eval/data/private/ge13/후보선정.xlsx
import { readFileSync, readdirSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { SOURCE_LABEL } from './sheet-meta.mjs'

const REAL = new URL('../data/private/ge13/real/', import.meta.url)
const latest = readdirSync(REAL).filter((f) => /^articles-.*\.json$/.test(f)).sort().at(-1)
if (!latest) throw new Error('collect.mjs 를 먼저 돌린다')
const arts = JSON.parse(readFileSync(new URL(latest, REAL), 'utf8'))
  .filter((a) => !a.hints.opinion && a.body_chars >= 100)

let seed = 20261023
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const shuffle = (a) => a.map((v) => [rnd(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1])
const band = (n) => (n <= 10 ? '짧음' : n <= 22 ? '보통' : '긺')
const WANT = { 짧음: 3, 보통: 4, 긺: 3 }

// 정상: 섹션마다 10건, 길이대 3/4/3. 모자라면 다른 길이대에서 채운다
const normal = []
for (const sec of ['정치', '경제', '사회', '생활문화', '세계', 'IT과학']) {
  const pool = shuffle(arts.filter((a) => a.section === sec))
  const got = []
  for (const [b, w] of Object.entries(WANT)) got.push(...pool.filter((a) => band(a.n_sentences) === b).slice(0, w))
  for (const a of pool) if (got.length < 10 && !got.includes(a)) got.push(a)
  if (got.length < 10) console.warn(`${sec}: ${got.length}건뿐`)
  normal.push(...got)
}
const taken = new Set(normal.map((a) => a.id))
const pool = arts.filter((a) => !taken.has(a.id))
  .sort((x, y) => Object.values(y.hints).filter(Boolean).length - Object.values(x.hints).filter(Boolean).length)

const wb = new ExcelJS.Workbook()
const head = (ws, cols) => {
  ws.columns = cols
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}
const guide = wb.addWorksheet('읽어 주세요')
guide.getColumn(1).width = 110
;[
  '평가 세트 후보 선정 시트 (eval/data/README.md 1·2절)',
  '',
  "'정상' 시트: 섹션별로 자동으로 뽑은 60건. 의견글(사설·칼럼)이 섞였으면 '제외'에 표시한다. 고르지는 않는다.",
  "'후보' 시트: 나머지 기사. '묶음' 칸에서 고른다. 필요한 수: 경계-자극적 제목 10, 경계-출처 없는 정상 10, 경계-기계 작성 10, 신호 뚜렷 15, 연습용 10",
  "'힌트' 칸은 키워드로 붙인 참고일 뿐 정답이 아니다. 기사를 열어 보고 고른다.",
  '라벨은 여기서 붙이지 않는다. 고르는 사람이 무슨 신호가 있는지 미리 판단해 적지 않는다.',
  '이 파일에는 기사 제목이 들어 있다. 저장소에 커밋하지 않는다 (private/).',
  '',
  `${SOURCE_LABEL} ${latest}`,
].forEach((t, i) => { guide.getCell(i + 1, 1).value = t })
guide.getRow(1).font = { bold: true, size: 13 }

const ns = wb.addWorksheet('정상')
head(ns, [
  { header: 'id', key: 'id', width: 22 }, { header: '섹션', key: 'section', width: 10 }, { header: '길이', key: 'band', width: 7 },
  { header: '문장', key: 'n', width: 6 }, { header: '언론사', key: 'press', width: 12 }, { header: '제목', key: 'headline', width: 70 },
  { header: 'URL', key: 'url', width: 45 }, { header: '제외', key: 'exclude', width: 8 },
])
for (const a of normal) ns.addRow({ id: a.id, section: a.section, band: band(a.n_sentences), n: a.n_sentences, press: a.press, headline: a.headline, url: { text: a.url, hyperlink: a.url } })
for (let r = 2; r <= normal.length + 1; r++) ns.getCell(`H${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"제외"'] }

const GROUPS = ['경계-자극적 제목', '경계-출처 없는 정상', '경계-기계 작성', '신호 뚜렷', '연습용']
const cs = wb.addWorksheet('후보')
head(cs, [
  { header: 'id', key: 'id', width: 22 }, { header: '묶음', key: 'group', width: 20 }, { header: '출처', key: 'src', width: 12 },
  { header: '문장', key: 'n', width: 6 }, { header: '언론사', key: 'press', width: 12 }, { header: '힌트', key: 'hints', width: 26 },
  { header: '제목', key: 'headline', width: 70 }, { header: 'URL', key: 'url', width: 45 },
])
const HINT = { sensational_headline: '자극적 제목', machine_written: '정형/자동', unsourced: '출처 표현 없음' }
for (const a of pool) {
  cs.addRow({
    id: a.id, src: a.section ?? '랭킹', n: a.n_sentences, press: a.press, headline: a.headline,
    hints: Object.entries(HINT).filter(([k]) => a.hints[k]).map(([, v]) => v).join(', '),
    url: { text: a.url, hyperlink: a.url },
  })
}
for (let r = 2; r <= pool.length + 1; r++) cs.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${GROUPS.join(',')}"`] }
cs.autoFilter = { from: 'A1', to: `H${pool.length + 1}` }

const out = new URL('../data/private/ge13/후보선정.xlsx', import.meta.url)
await wb.xlsx.writeFile(out)
const n = (k) => pool.filter((a) => a.hints[k]).length
console.log(`원본 ${latest} · 의견글 뺀 ${arts.length}건`)
console.log(`정상 ${normal.length}건 · 후보 ${pool.length}건 (자극적 제목 ${n('sensational_headline')} · 정형/자동 ${n('machine_written')} · 출처 표현 없음 ${n('unsourced')})`)
console.log(`→ ${decodeURIComponent(out.pathname)}`)
