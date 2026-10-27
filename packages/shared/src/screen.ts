// Jev 에 보내기 전에, 기사 글에서 "판단기를 노린 문장"을 걷어낸다 (GE-35).
//
// 질문 문구로 막는 것은 모델이 따를지 말지 고른다 (GE-33 에서 효과가 측정되지 않았다).
// **걷어낸 문장은 모델이 볼 수 없다.** 그래서 문구가 아니라 보내기 전에 막는다.
// 배경과 측정은 eval/experiments/robustness/README.md 4절에 있다.
//
// 찾는 것 (전부 정상 기사에는 나올 일이 거의 없는 모양이다):
//   1. 우리 항목 키·질문 id (`source_citation`, `factual_assertion` …)와 밑줄이 든 보기 이름(`named_source` …)
//      — 필드 위장. 공개 저장소에 있으니 누구나 그대로 적을 수 있다
//   2. `[SYSTEM] … [/SYSTEM]` 같은 역할 태그 묶음, `<|…|>` 특수 토큰 — 시스템 문구 흉내
//   3. `</기사>` 같은 닫는 태그 — 구분자 탈출. 태그 뒤의 문장이 진짜 지시라서 **그 문단 끝까지** 걷어낸다
//
// 일부러 찾지 않는 것:
//   - `matches`, `strong`, `mild` 같은 한 단어 보기 이름. 영어 인용문에 흔하다.
//     필드 위장 문장에는 항목 키가 같이 들어 있어서 키로 잡힌다
//   - `출처판정=명시됨`, `<<시스템>>` 같은 한국어·변형 표기. 정상 기사와 가르기 어렵다 (README "한계")
//
// 제목은 걷어내지 않는다. 제목 하나를 지우면 판단할 글이 남지 않는다.
//
// DOM·브라우저 API·네트워크를 쓰지 않는다. 중계 서버와 eval 스크립트(node)가 같은 함수를 부른다.
// node 가 타입만 지우고 바로 읽을 수 있게, 이 파일은 다른 파일을 import 하지 않는다. 항목 정의는 인자로 받는다.

/** 규칙을 바꾸면 올린다. eval 결과에 함께 남는다. */
export const SCREEN_VERSION = '1.0.0'

/** judgment-items.json 에서 읽는 부분만 */
export interface ScreenSchema {
  items: {
    id: string
    question?: { criteria: unknown }
    questions?: { id: string; question: { criteria: unknown } }[]
  }[]
}

export interface Screened {
  /** 걷어낸 뒤의 글. 걷어낸 것이 없으면 받은 글 그대로다 (공백 하나 바꾸지 않는다) */
  text: string
  /** 걷어낸 덩어리 수 (문장, 역할 태그 묶음, 닫는 태그부터 문단 끝까지) */
  removed: number
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 영문 단어 경계. 한국어 조사가 바로 붙어도(`source_citation은`) 잡힌다 */
const wordRe = (words: string[]) =>
  new RegExp(`(?<![A-Za-z0-9_])(?:${words.map(escape).join('|')})(?![A-Za-z0-9_])`, 'i')

const ROLES = 'system|assistant|user|inst|sys'
/** `[SYSTEM] … [/SYSTEM]`. 닫는 태그가 없으면 그 문단 끝까지 */
const ROLE_BLOCK = new RegExp(`\\[\\s*(${ROLES})\\s*\\][\\s\\S]*?(?:\\[\\s*\\/\\s*\\1\\s*\\]|$)`, 'gi')
/** 짝 없이 남은 역할 태그(`[/SYSTEM]`만 있는 경우)와 `<|im_start|>` 같은 특수 토큰 */
const ROLE_TOKEN = new RegExp(`\\[\\s*\\/?\\s*(?:${ROLES})\\s*\\]|<\\|[^|<>\\s]{1,30}\\|>`, 'i')
/** `</기사>`, `</input>` */
const CLOSE_TAG = /<\/[^<>\s]{1,20}>/

/**
 * 문장 나누기. 마침표·물음표·느낌표(와 뒤따르는 따옴표·괄호) 다음의 공백에서 나눈다.
 * 공백이 없으면 나누지 않는다. "3.5%" 는 한 덩어리다.
 * 확장 프로그램의 문장 나누기와 같을 필요는 없다. 걷어낼 범위를 정하는 데만 쓴다.
 */
const SENTENCE_END = /(?<=[.!?。…][)"'”’」』\]]*)\s+/

/** 그 질문 세트의 항목 키·질문 id·밑줄 든 보기 이름 */
export function spoofWords(schema: ScreenSchema): string[] {
  const words = new Set<string>()
  const addOptions = (criteria: unknown) => {
    if (!criteria || Array.isArray(criteria) || typeof criteria !== 'object') return
    for (const k of Object.keys(criteria)) if (k.includes('_')) words.add(k)
  }
  for (const item of schema.items) {
    words.add(item.id)
    if (item.question) addOptions(item.question.criteria)
    for (const q of item.questions ?? []) {
      words.add(q.id)
      addOptions(q.question.criteria)
    }
  }
  return [...words]
}

/**
 * 질문 세트로 걷어내기 함수를 만든다. 질문 세트가 바뀌면(항목·보기를 더하면) 찾는 단어도 따라 바뀐다.
 */
export function createScreen(schema: ScreenSchema): (text: string) => Screened {
  const SPOOF = wordRe(spoofWords(schema))

  const screenLine = (line: string): { text: string; removed: number } => {
    let removed = 0
    // 1. 역할 태그 묶음은 문장 경계와 상관없이 통째로 걷어낸다.
    //    문장으로 나누면 `[/SYSTEM]` 뒤에 붙은 진짜 첫 문장까지 같이 지워진다
    let rest = line.replace(ROLE_BLOCK, () => { removed++; return ' ' })
    if (removed) rest = rest.replace(/\s{2,}/g, ' ').trim()

    // 2. 문장 단위
    const kept: string[] = []
    let dropped = 0
    for (const s of rest.split(SENTENCE_END)) {
      if (!s) continue
      // 닫는 태그가 나오면 그 문장부터 문단 끝까지다
      if (CLOSE_TAG.test(s)) { dropped++; break }
      if (ROLE_TOKEN.test(s) || SPOOF.test(s)) { dropped++; continue }
      kept.push(s)
    }
    if (!removed && !dropped) return { text: line, removed: 0 }
    return { text: kept.join(' '), removed: removed + dropped }
  }

  return (text: string): Screened => {
    let removed = 0
    const lines = text.split('\n').map((line) => {
      const r = screenLine(line)
      removed += r.removed
      // 걷어내서 빈 줄이 된 줄은 뺀다. 원래 빈 줄은 문단 구분이므로 둔다
      return r.removed && !r.text.trim() ? null : r.text
    })
    if (!removed) return { text, removed: 0 }
    return { text: lines.filter((l): l is string => l !== null).join('\n').trim(), removed }
  }
}
