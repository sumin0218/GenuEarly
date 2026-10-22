// 한국어 기사 문장 분리.
//
// eval/experiments/sentence-batching/split.mjs 에서 옮겼다. 그 실험에서 기사 84건으로
// 돌려 보며 세 번 고친 규칙이다. **길다고 끊지 않는다** — 한국 기사의 인용 구조
// (A는 "…"라며 "…"고 말했다)는 한 문장이 170~190자까지 간다.
const CLOSERS = '"”\'’)]»'
const OPEN_Q = '"“'
const CLOSE_Q = '"”'
const ENDERS = '.!?…'

// 닫는 따옴표 뒤에 이것들이 오면 아직 한 문장이다 (인용을 받는 말).
// 한 글자 조사(이·가·은·는…)는 넣지 않는다. 다음 문장 첫 글자("이번", "은행")에 걸린다.
const CONTINUES = /^\s*(이?라(?:고|며|는|면서|던)|며(?=\s)|고(?=\s)|하고(?=\s)|면서(?=\s)|등(?=\s))/

/** 따옴표가 어긋난 기사에서 한 문장이 끝없이 길어지지 않게 하는 안전장치. */
const QUOTE_GIVE_UP = 250

export function splitSentences(text: string): string[] {
  const out: string[] = []
  const chars = [...text]
  // tsconfig 가 noUncheckedIndexedAccess 라 chars[i] 가 string | undefined 다.
  // 범위를 벗어나면 빈 문자열로 본다 — 어느 검사에도 걸리지 않아 경계에서 안전하다.
  const at = (k: number): string => chars[k] ?? ''
  let buf = ''
  let inQuote = false

  const flush = () => {
    const s = buf.trim()
    if (s.length >= 2) out.push(s)
    buf = ''
  }

  for (let i = 0; i < chars.length; i++) {
    const c = at(i)
    buf += c

    if (!inQuote && OPEN_Q.includes(c)) { inQuote = true; continue }
    if (inQuote && CLOSE_Q.includes(c)) {
      inQuote = false
      // 종결부호 없이 닫힌 인용. 뒤가 인용을 받는 말이 아니면 여기서 끊는다.
      if (/\s/.test(at(i + 1)) && !CONTINUES.test(chars.slice(i + 1, i + 9).join(''))) flush()
      continue
    }
    if (!ENDERS.includes(c)) continue
    if (inQuote) {
      if (buf.length < QUOTE_GIVE_UP) continue   // 인용 안의 종결부호
      inQuote = false                            // 너무 길다. 따옴표 상태를 믿지 않는다
    }
    if (c === '.' && /\d/.test(at(i - 1)) && /\d/.test(at(i + 1))) continue   // 2.5

    // 종결부호 뒤에 붙는 닫는 기호는 이 문장에 데려온다.
    let j = i + 1
    while (j < chars.length && CLOSERS.includes(at(j))) {
      buf += at(j)
      if (CLOSE_Q.includes(at(j))) inQuote = false
      j++
    }
    i = j - 1
    if (j < chars.length && !/\s/.test(at(j))) continue                        // 단어 중간
    if (CONTINUES.test(chars.slice(j, j + 9).join(''))) continue               // "…"라며
    flush()
  }
  flush()
  return out
}
