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
import { createIcon } from '../../lib/icon'
import { LEVEL_ICON, LEVEL_INK_DARK } from '../../lib/item-view'
import { peekReport, REPORT_KEY, type Report, type ReportClaim, type ReportRecord } from '../../lib/report'
import type { DisplayLevel } from '../../lib/protocol'

const C = content.report

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
function render(r: Report | null): void {
  const host = document.getElementById('body')
  if (!host) return
  host.replaceChildren()

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

paintChrome()
void peekReport().then(render)

// 만드는 쪽이 단계마다 적는다. 그때마다 다시 그린다.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes[REPORT_KEY]) return
  render((changes[REPORT_KEY].newValue as Report | undefined) ?? null)
})
