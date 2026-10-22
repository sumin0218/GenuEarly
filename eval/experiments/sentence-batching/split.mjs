// 한국어 기사 문장 분리. 중계 서버가 쓸 규칙의 원형이다.
//
// 한국 기사의 인용 구조(A는 "…"라며 "…"고 말했다)는 한 문장이 170~190자까지 간다.
// 길다고 끊지 않는다. 끊는 자리는 종결부호와 따옴표의 상태로만 정한다.
const CLOSERS = '"”\'’)]»'
const OPEN_Q = '"“'
const CLOSE_Q = '"”'
// 닫는 따옴표 뒤에 이것들이 오면 아직 한 문장이다 (인용을 받는 말)
// 한 글자 조사(이·가·은·는…)는 넣지 않는다. 다음 문장 첫 글자("이번", "은행")에 걸린다.
const CONTINUES = /^\s*(이?라(?:고|며|는|면서|던)|며(?=\s)|고(?=\s)|하고(?=\s)|면서(?=\s)|등(?=\s))/

export function splitSentences(text) {
  const out = []
  const chars = [...text]
  let buf = ''
  let depth = 0 // 큰따옴표 안이면 1

  const flush = () => { const s = buf.trim(); if (s.length >= 2) out.push(s); buf = '' }
  const eat = (from) => { // 종결부호 뒤에 붙는 닫는 기호를 이 문장에 데려온다
    let j = from
    while (j < chars.length && CLOSERS.includes(chars[j])) { buf += chars[j]; if (CLOSE_Q.includes(chars[j])) depth = 0; j++ }
    return j
  }

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    buf += c
    if (OPEN_Q.includes(c) && depth === 0) { depth = 1; continue }
    if (CLOSE_Q.includes(c) && depth === 1) {
      depth = 0
      // 종결부호 없이 닫힌 인용. 뒤가 인용을 받는 말이 아니면 여기서 끊는다
      const tail = chars.slice(i + 1, i + 8).join('')
      if (/\s/.test(chars[i + 1] ?? '') && !CONTINUES.test(tail)) flush()
      continue
    }
    if (!'.!?…'.includes(c)) continue
    // 기사 쪽 따옴표가 어긋나면(' 로 열고 " 로 닫는 등) 인용이 안 닫혀 한 문장이 끝없이 길어진다.
    // 250자를 넘겼으면 따옴표 상태를 믿지 않는다.
    if (depth === 1 && buf.length < 250) continue                    // 인용 안의 종결부호
    if (depth === 1) depth = 0
    if (c === '.' && /\d/.test(chars[i - 1] ?? '') && /\d/.test(chars[i + 1] ?? '')) continue // 2.5
    const j = eat(i + 1)
    i = j - 1
    if (j < chars.length && !/\s/.test(chars[j])) continue           // 단어 중간
    if (CONTINUES.test(chars.slice(j, j + 8).join(''))) continue     // "…"라며
    flush()
  }
  flush()
  return out
}
