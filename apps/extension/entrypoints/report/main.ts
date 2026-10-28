// 공개 기록 리포트 화면.
//
// **마크업 문자열을 쓰지 않는다.** 여기 올라가는 것은 기사 본문 인용과 바깥에서 찾아온
// 기록이다 — 남이 쓴 글이다. `innerHTML` 로 그리면 그 글이 코드가 되는 길이 열린다
// (docs/security/secure-coding.md 4절). 전부 `createElement` 와 `textContent` 다.
//
// **여기서 판단하지 않는다.** 판정은 기사를 열었을 때 이미 났고, 기록 대조는 중계 서버가
// Jev 에 물어 둔 것이다. 이 파일은 받은 것을 그리기만 한다.
//
// 화면은 `storage.session` 을 읽는다. 만드는 쪽(background)이 단계마다 적고, 여기서는
// 그 변화를 들으며 채운다 — 스무 초를 빈 화면으로 두지 않기 위해서다 (lib/report.ts).
import './style.css'
import content from '../../../../packages/content/ui.ko.json'
import { clearArchive, listArchive, removeArchived } from '../../lib/archive'
import { createIcon } from '../../lib/icon'
import { LEVEL_ICON, LEVEL_INK_DARK } from '../../lib/item-view'
import { peekReport, REPORT_KEY, type Report, type ReportClaim, type ReportRecord } from '../../lib/report'
import type { DisplayLevel } from '../../lib/protocol'

const C = content.report
const A = C.archive

/** 요소 하나 만들기. 글은 **언제나 `textContent`** 로 넣는다. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (className) n.className = className
  if (text !== undefined) n.textContent = text
  return n
}

/** 카드 하나. 머리말과 본문을 가르는 선 하나만 쓴다 (docs/design.md 4절). */
function card(title?: string, lede?: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'ge-card')
  if (title) root.append(el('h2', 'ge-card__title', title))
  if (lede) root.append(el('p', 'ge-card__lede', lede))
  const body = el('div', 'ge-card__rule')
  root.append(body)
  return { root, body }
}

/** 단계 표시. 걸린 줄에만 색이 들어간다 (docs/design.md 3절). */
function mark(level: DisplayLevel): SVGSVGElement {
  const loud = level === 'CAUTION' || level === 'CHECK'
  const svg = createIcon(document, LEVEL_ICON[level], { size: 14 })
  svg.setAttribute('class', 'ge-item__mark')
  svg.style.color = loud ? LEVEL_INK_DARK[level] : 'var(--ge-quiet)'
  return svg
}

/** 바깥 링크. **새 탭으로 연다.** 리포트를 잃지 않게 한다. */
function link(href: string, text: string, className?: string): HTMLAnchorElement {
  const a = el('a', className, text)
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  return a
}

// ── ① 조사 개요 ──────────────────────────────────────────
function drawOverview(r: Report): HTMLElement {
  const root = el('section', 'ge-card')
  root.append(el('div', 'ge-card__accent'))
  root.append(el('h1', 'ge-report__headline', r.headline))

  const source = el('p', 'ge-report__source')
  let host = ''
  try {
    host = new URL(r.url).host
  } catch {
    host = ''
  }
  source.append(document.createTextNode(`${r.date} · `), link(r.url, host || r.url))
  root.append(source)

  const 조사한문장 = r.claims.length
  const 찾은기록 = r.claims.reduce((n, c) => n + c.records.length, 0)
  const facts: [string, string, boolean][] = [
    [C.facts.claims, String(조사한문장), false],
    [C.facts.records, String(찾은기록), true],
    [C.facts.at, new Date(r.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }), false],
  ]
  const box = el('div', 'ge-facts')
  for (const [label, value, brand] of facts) {
    const one = el('div')
    one.append(el('div', 'ge-fact__label', label))
    one.append(el('div', `ge-fact__value${brand ? ' ge-fact__value--brand' : ''}`, value))
    box.append(one)
  }
  root.append(box)
  root.append(el('p', 'ge-note', C.disclaimer))
  return root
}

// ── ② 기사를 열었을 때의 신호 ────────────────────────────
function drawSignals(r: Report): HTMLElement | null {
  if (r.rows.length === 0) return null
  const { root, body } = card(C.sections.signals, C.lede.signals)
  const list = el('ul', 'ge-items')
  for (const row of r.rows) {
    const li = el('li', 'ge-item')
    li.append(mark(row.level))
    const span = el('span')
    const loud = row.level === 'CAUTION' || row.level === 'CHECK'
    span.append(el('span', `ge-item__name${loud ? '' : ' ge-item__name--quiet'}`, row.name))
    span.append(el('br'))
    span.append(el('span', 'ge-item__desc', row.text))
    li.append(span)
    list.append(li)
  }
  body.replaceWith(list)
  list.classList.add('ge-card__rule')
  root.append(list)
  return root
}

// ── ③ 문장별로 찾은 기록 ─────────────────────────────────
function drawRecord(rec: ReportRecord): HTMLElement {
  const li = el('li', 'ge-record')
  li.append(el('span', 'ge-record__verdict', C.verdict[rec.verdict] ?? C.verdict.unrelated))

  const main = el('span', 'ge-record__main')
  const head = el('span')
  head.append(el('span', 'ge-record__press', rec.press || '—'))
  const when = el(
    'span',
    `ge-record__when${rec.when === 'other' ? ' ge-record__when--other' : ''}`,
    `${rec.date ? rec.date + ' · ' : ''}${C.when[rec.when] ?? C.when.unknown}`,
  )
  head.append(when)
  main.append(head)
  main.append(el('span', 'ge-record__text', rec.text))
  // **어긋남에는 한 줄을 더 붙인다.** 기사가 틀렸다는 선언으로 읽히면 안 된다 (ChatKHU 11차).
  if (rec.verdict === 'contradicts') main.append(el('span', 'ge-record__when', C.contradictNote))
  main.append(link(rec.url, '기사 보기 ↗', 'ge-record__link'))
  li.append(main)
  return li
}

/** 걸린 항목을 보충한 대목의 문구. packages/content 의 explain.*.reasons 에 있다. */
function 설명문구(why: string): string | undefined {
  const explain = (content as { explain?: Record<string, { reasons?: Record<string, string>; parts?: Record<string, { present?: string }> }> }).explain ?? {}
  for (const copy of Object.values(explain)) {
    const hit = copy?.reasons?.[why] ?? copy?.parts?.[why]?.present
    if (hit) return hit
  }
  return undefined
}

function drawClaim(claim: ReportClaim, index: number): HTMLElement {
  const art = el('article', 'ge-claim')
  const head = el('div', 'ge-claim__head')
  head.append(el('span', 'ge-claim__no', `${index + 1}`))
  head.append(el('q', 'ge-claim__quote', claim.text))
  art.append(head)
  // **왜 이 문장을 골랐나.** 두 곳에서 온다 —
  // 나란히 볼 문장(report.picked)과, 걸린 항목을 보충한 대목(explain.*.reasons).
  // 모델이 쓴 말이 아니라 **둘 다 ChatKHU 가 미리 쓴 문구**다.
  const 고른이유 =
    (C.picked as Record<string, string>)[claim.why] ??
    설명문구(claim.why) ??
    claim.why
  art.append(el('p', 'ge-claim__why', 고른이유))

  if (claim.pending) {
    art.append(el('p', 'ge-claim__note', C.progress.records))
    return art
  }
  if (claim.records.length === 0) {
    art.append(el('p', 'ge-claim__note', C.none))
    return art
  }

  const list = el('ul', 'ge-records')
  for (const rec of claim.records) list.append(drawRecord(rec))
  art.append(list)

  // **찾은 기록이 전부 다른 날짜면 그렇게 말한다.** 그러지 않으면 거짓 안심이 된다
  // (실측 48건 중 21%가 "뒷받침" 인데 다른 날짜였다).
  if (claim.records.every((x) => x.when !== 'same')) {
    art.append(el('p', 'ge-claim__note', C.allOtherDates))
  }
  return art
}

function drawRecords(r: Report): HTMLElement | null {
  if (r.claims.length === 0) return null
  const { root, body } = card(C.sections.records, C.lede.records)
  body.remove()
  r.claims.forEach((c, i) => root.append(drawClaim(c, i)))
  return root
}

// ── ⑤ 직접 확인해 볼 것 ──────────────────────────────────
function drawChecks(r: Report): HTMLElement | null {
  const b = r.brief
  if (!b || (!b.summary && b.checks.length === 0 && b.where.length === 0)) return null
  const { root, body } = card(C.sections.checks, C.lede.checks)
  if (b.summary) body.append(el('p', undefined, b.summary))
  for (const c of b.checks) {
    const one = el('p')
    one.append(el('q', 'ge-record__press', c.claim))
    one.append(el('br'))
    one.append(document.createTextNode(c.what))
    body.append(one)
  }
  if (b.where.length > 0) {
    const ul = el('ul', 'ge-where')
    for (const w of b.where) ul.append(el('li', undefined, w))
    body.append(ul)
  }
  return root
}

// ── ⑥ 이 리포트가 하지 못하는 일 ─────────────────────────
function drawLimits(): HTMLElement {
  const root = el('section', 'ge-card ge-limits')
  root.append(el('h2', 'ge-card__title', C.sections.limits))
  const ul = el('ul')
  for (const line of C.limits) ul.append(el('li', undefined, line))
  root.append(ul)
  const schemaVersion = (content as { version?: string }).version ?? ''
  root.append(el('div', 'ge-versions', `문구 ChatKHU ${schemaVersion}`))
  return root
}

// ── 그리기 ───────────────────────────────────────────────
function render(r: Report | null, archived = false): void {
  const host = document.getElementById('body')
  if (!host) return
  host.replaceChildren()

  // **보관해 둔 것은 그때의 모습이다.** 그 뒤에 기사도 주변 보도도 달라졌을 수 있다 —
  // 말하지 않으면 사용자는 방금 조사한 결과로 읽는다 (ChatKHU 14차).
  if (archived && r) host.append(el('p', 'ge-archive__restored', A.restored))

  if (!r) {
    host.append(el('p', 'ge-waiting', C.empty))
    return
  }
  if (r.stage === 'failed') {
    host.append(el('p', 'ge-waiting', r.reason === 'no_claims' ? C.noClaims : C.failed))
    return
  }

  host.append(drawOverview(r))
  const signals = drawSignals(r)
  if (signals) host.append(signals)
  const records = drawRecords(r)
  if (records) host.append(records)
  const checks = drawChecks(r)
  if (checks) host.append(checks)

  // 아직 만드는 중이면 어디까지 왔는지 알린다.
  if (r.stage !== 'done') {
    host.append(el('p', 'ge-waiting', r.stage === 'brief' ? C.progress.brief : C.progress.claims))
  }
  host.append(drawLimits())
}

function paintChrome(): void {
  const logo = document.querySelector<HTMLImageElement>('.ge-report__logo')
  if (logo) {
    try {
      logo.src = browser.runtime.getURL('/icon/48.png')
      logo.hidden = false
    } catch {
      logo.remove()
    }
  }
  const kind = document.querySelector('.ge-report__kind')
  if (kind) kind.textContent = C.sections.overview

  // **아직 아무것도 보내지 않는다** (GE-26). 자리만 둔다.
  const wrong = document.getElementById('report-wrong')
  if (wrong) {
    wrong.textContent = C.wrong
    wrong.addEventListener('click', () => {
      wrong.textContent = C.wrongSoon
    })
  }
}

// ── 지난 리포트 보관함 ───────────────────────────────────
//
// 보관되는 것은 **사용자가 버튼을 눌러 만든 리포트뿐**이고, 여기서 전부 지울 수 있다
// (lib/archive.ts 머리말의 세 조건 중 둘째가 이 화면이다).

/** 지금 화면에 띄워 둔 보관본의 주소. 없으면 `null` — 그때는 session 을 따라간다. */
let 보는중: string | null = null

/** 목록 한 줄. 제목을 누르면 열리고, 옆 단추로 지운다. */
function archiveRow(r: Report, redraw: () => Promise<void>): HTMLElement {
  const li = el('li', 'ge-archive__row')

  const openBtn = el('button', 'ge-archive__open')
  openBtn.type = 'button'
  openBtn.append(el('span', 'ge-archive__title', r.headline))
  const meta = el('span', 'ge-archive__meta')
  meta.textContent = `${r.date} · ${new Date(r.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}`
  openBtn.append(meta)
  if (보는중 === r.url) openBtn.append(el('span', 'ge-archive__now', A.viewing))
  openBtn.onclick = () => {
    보는중 = r.url
    render(r, true)
    void redraw()
    // **열었으면 서랍을 닫는다.** 고르자마자 가린 것을 치워 줘야 읽을 수 있다.
    closeArchive()
    window.scrollTo({ top: 0 })
  }
  li.append(openBtn)

  const del = el('button', 'ge-archive__del', A.remove)
  del.type = 'button'
  del.onclick = () => {
    void removeArchived(r.url).then(() => {
      // 지운 것을 보고 있었다면 더는 "현재 열림" 이 아니다. 화면은 그대로 둔다 —
      // 읽던 글이 눈앞에서 사라지는 편이 더 당황스럽다.
      if (보는중 === r.url) 보는중 = null
      void redraw()
    })
  }
  li.append(del)
  return li
}

/** 목록을 그린다. **다 그린 뒤에 할 일이 있어서** 약속을 돌려준다 (포커스). */
function drawArchive(): Promise<void> {
  const host = document.getElementById('archive')
  if (!host) return Promise.resolve()
  return listArchive().then((items) => {
    // **여는 것은 `openArchive` 뿐이다.** 여기서 `hidden` 을 건드리면 목록이
    // 바뀔 때마다 (지우기 등) 닫아 둔 서랍이 저절로 열린다.
    host.replaceChildren()

    const head = el('div', 'ge-archive__head')
    const title = el('h2', 'ge-card__title', A.title)
    title.id = 'archive-title' // index.html 의 aria-labelledby 가 이것을 가리킨다
    head.append(title)
    const spacer = el('span', 'ge-archive__spacer')
    head.append(spacer)

    // 닫기. 서랍은 막을 눌러도 Esc 로도 닫히지만, **보이는 길이 하나는 있어야 한다.**
    const close = el('button', 'ge-archive__close', '✕')
    close.type = 'button'
    close.setAttribute('aria-label', A.close)
    close.onclick = () => closeArchive()
    head.append(close)

    if (items.length > 0) {
      // **두 번 묻는다.** 한 번에 지워지면 되돌릴 길이 없다.
      const all = el('button', 'ge-report__ghost', A.removeAll)
      all.type = 'button'
      all.onclick = () => {
        all.textContent = A.confirmAll
        all.classList.add('ge-archive__danger')
        const no = el('button', 'ge-report__ghost', A.cancel)
        no.type = 'button'
        no.onclick = () => drawArchive()
        head.append(no)
        all.onclick = () => {
          void clearArchive().then(() => {
            보는중 = null
            drawArchive()
          })
        }
      }
      head.append(all)
    }
    host.append(head)
    host.append(el('p', 'ge-archive__note', A.note))

    if (items.length === 0) {
      host.append(el('p', 'ge-archive__empty', A.empty))
      return
    }
    const ul = el('ul', 'ge-archive__list')
    for (const r of items) ul.append(archiveRow(r, drawArchive))
    host.append(ul)
  })
}

// ── 서랍 여닫기 ──────────────────────────────────────────
//
// 막(scrim)과 Esc 와 ✕ 셋 다로 닫힌다. **포커스를 되돌려 준다** — 키보드로 연
// 사람이 닫은 뒤 문서 맨 위로 튕기면 읽던 자리를 잃는다.

const 서랍 = () => document.getElementById('archive')
const 막 = () => document.getElementById('archive-scrim')
const 여는단추 = () => document.getElementById('archive-toggle')

function archiveOpen(): boolean {
  return 서랍()?.hidden === false
}

function openArchive(): void {
  const box = 서랍()
  if (!box) return
  box.hidden = false
  const scrim = 막()
  if (scrim) scrim.hidden = false
  여는단추()?.setAttribute('aria-expanded', 'true')
  // **다 그린 뒤에** 포커스를 옮긴다. 그리기는 저장소를 읽으므로 한 박자 늦다 —
  // 먼저 옮기면 아직 없는 단추를 찾다가 빈 서랍에 포커스를 두고 만다.
  void drawArchive().then(() => {
    if (box.hidden) return // 그리는 사이에 닫혔다
    const first = box.querySelector<HTMLElement>('button')
    if (first) first.focus()
    else {
      box.tabIndex = -1
      box.focus()
    }
  })
}

function closeArchive(): void {
  const box = 서랍()
  if (!box || box.hidden) return
  box.hidden = true
  const scrim = 막()
  if (scrim) scrim.hidden = true
  여는단추()?.setAttribute('aria-expanded', 'false')
  여는단추()?.focus()
}

function wireArchive(): void {
  const btn = 여는단추()
  if (btn) {
    btn.setAttribute('aria-label', A.title)
    btn.onclick = () => (archiveOpen() ? closeArchive() : openArchive())
  }
  const scrim = 막()
  if (scrim) scrim.onclick = () => closeArchive()
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeArchive()
  })
}

paintChrome()
wireArchive()
void peekReport().then((r) => render(r))

// 만드는 쪽이 단계마다 적는다. 그때마다 다시 그린다.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes[REPORT_KEY]) return
  // **보관본을 보고 있으면 끼어들지 않는다.** 읽던 글이 눈앞에서 바뀌면 안 된다.
  if (보는중 !== null) return
  const next = (changes[REPORT_KEY].newValue as Report | undefined) ?? null
  render(next)
  // 다 됐으면 보관함에 한 줄이 늘었다. **열려 있을 때만 다시 그린다** —
  // 닫혀 있으면 다음에 열 때 어차피 새로 그린다.
  if (next?.stage === 'done' && archiveOpen()) void drawArchive()
})
