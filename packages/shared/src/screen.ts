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
//   3. `</기사>` 같은 닫는 태그 — 구분자 탈출. 태그 뒤의 문장이 진짜 지시라서 **뒤 한 문장까지** 걷어낸다
//
// **걷어내는 범위는 늘 짧게 묶는다.** 확장 프로그램은 본문을 한 줄로 합쳐 보낸다(extract.ts).
// "문단 끝까지"는 곧 "기사 끝까지"라서, 본문 첫머리에 `</x>` 하나만 넣어도 기사 전체가 빠지고
// 본문 항목이 모두 ⚪가 된다 (PR #24 리뷰). 그래서
//   - 닫는 태그·닫지 않은 역할 태그는 그 문장과 **뒤 한 문장**만 (FOLLOWING)
//   - 짝이 맞는 역할 태그 묶음도 **300자 안**일 때만 통째로 (ROLE_BLOCK_MAX). 더 길면 태그가 든 문장만
//
// 일부러 찾지 않는 것:
//   - `matches`, `strong`, `mild` 같은 한 단어 보기 이름. 영어 인용문에 흔하다.
//     필드 위장 문장에는 항목 키가 같이 들어 있어서 키로 잡힌다
//   - `출처판정=명시됨`, `<<시스템>>` 같은 한국어·변형 표기. 정상 기사와 가르기 어렵다 (README "한계")
//
// **제목은 걷어내 보되, 비면 원문을 쓴다.** 제목 하나를 지우면 판단할 글이 남지 않는데,
// 그렇다고 아예 안 보면 `clickbait_headline` 과 `headline_body_match` 가 공격 문장을
// 그대로 본다 (GE-47). 둘 사이에 한 칸이 있다 — 걷어내 보고 **남은 글이 있을 때만** 쓰는 것.
// 제목이 통째로 공격 문장이면 지금까지처럼 원문이 가고, 다른 말이 함께 있으면 그것만 빠진다.
//
// DOM·브라우저 API·네트워크를 쓰지 않는다. 중계 서버와 eval 스크립트(node)가 같은 함수를 부른다.
// node 가 타입만 지우고 바로 읽을 수 있게, 이 파일은 다른 파일을 import 하지 않는다. 항목 정의는 인자로 받는다.

/** 규칙을 바꾸면 올린다. eval 결과에 함께 남는다. */
export const SCREEN_VERSION = '1.2.0'

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
  /** 걷어낸 덩어리 수 (문장, 역할 태그 묶음) */
  removed: number
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 영문 단어 경계. 한국어 조사가 바로 붙어도(`source_citation은`) 잡힌다 */
const wordRe = (words: string[]) =>
  new RegExp(`(?<![A-Za-z0-9_])(?:${words.map(escape).join('|')})(?![A-Za-z0-9_])`, 'i')

const ROLES = 'system|assistant|user|inst|sys'
/** 짝이 맞는 역할 태그 묶음을 통째로 걷어내는 최대 길이. 넘으면 기사 본문을 감싼 것으로 보고 태그가 든 문장만 뺀다 */
const ROLE_BLOCK_MAX = 300
/** 닫는 태그·닫지 않은 역할 태그 뒤로 함께 걷어내는 문장 수. 구분자 탈출은 태그 뒤 한 문장이 지시다 */
const FOLLOWING = 1
/** `[SYSTEM] … [/SYSTEM]`, 사이가 ROLE_BLOCK_MAX 자 이하일 때만 */
const ROLE_BLOCK = new RegExp(`\\[\\s*(${ROLES})\\s*\\][\\s\\S]{0,${ROLE_BLOCK_MAX}}?\\[\\s*\\/\\s*\\1\\s*\\]`, 'gi')
/** 여는 역할 태그 (`[SYSTEM]`). 묶음으로 걷히지 않고 남았으면 뒤 문장도 지시로 본다 */
const ROLE_OPEN = new RegExp(`\\[\\s*(?:${ROLES})\\s*\\]`, 'i')
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
    //    문장으로 나누면 `[/SYSTEM]` 뒤에 붙은 진짜 첫 문장까지 같이 지워진다.
    //    묶음 앞뒤 공백도 같이 지운다. 줄 가운데였으면 공백 하나를 남긴다
    let rest = line.replace(ROLE_BLOCK, () => { removed++; return '\u0000' })
    if (removed) {
      rest = rest.replace(/\s*\u0000\s*/g, (m, off: number, str: string) =>
        off === 0 || off + m.length === str.length ? '' : ' ')
    }

    // 2. 문장 단위. 나눈 자리의 공백을 그대로 들고 다녀서, 남은 문장 사이의 공백은 원래 글과 같다.
    //    걷어낸 문장은 **앞의** 공백과 함께 지운다 (첫 문장이면 뒤의 공백과 함께).
    //    그래서 끝에 심은 문장을 걷어내면 심기 전 글과 글자 하나까지 같아진다
    const parts = rest.split(new RegExp(`(${SENTENCE_END.source})`))
    let out = ''
    let dropped = 0
    let carry = 0 // 앞 문장의 태그 때문에 함께 걷어낼 남은 문장 수
    for (let i = 0; i < parts.length; i += 2) {
      const s = parts[i] ?? ''
      const sep = parts[i + 1] ?? ''
      let drop = false
      if (s && (CLOSE_TAG.test(s) || ROLE_OPEN.test(s))) { drop = true; carry = FOLLOWING }
      else if (s && (ROLE_TOKEN.test(s) || SPOOF.test(s))) {
        // **이 문장도 "뒤 한 문장" 을 쓴 것이다.** 안 줄이면 다음 멀쩡한 문장까지 걷힌다 —
        // 태그 문장 뒤에 항목 키 문장이 오면 셋이 사라졌다 (GE-46).
        drop = true
        if (carry > 0) carry--
      } else if (s && carry > 0) { drop = true; carry-- }
      if (drop) {
        dropped++
        if (out) out = out.replace(/\s+$/, '')   // 앞의 공백과 함께 지운다
        continue
      }
      out += out && /\S$/.test(out) && !/^\s/.test(s) ? ' ' + s : s
      out += sep
    }
    if (!removed && !dropped) return { text: line, removed: 0 }
    return { text: dropped ? out.replace(/\s+$/, '') : out, removed: removed + dropped }
  }

  return (text: string): Screened => {
    let removed = 0
    const lines = text.split('\n').map((line) => {
      // \r\n 줄이면 \r 를 떼고 보고 다시 붙인다. 끝 공백을 지울 때 \r 까지 지우지 않게 (PR #24 리뷰)
      const cr = line.endsWith('\r') ? '\r' : ''
      const r = screenLine(cr ? line.slice(0, -1) : line)
      removed += r.removed
      if (!r.removed) return line
      // 걷어내서 빈 줄이 된 줄은 뺀다. 원래 빈 줄은 문단 구분이므로 둔다
      return r.text.trim() ? r.text + cr : null
    })
    if (!removed) return { text, removed: 0 }
    return { text: lines.filter((l): l is string => l !== null).join('\n').trim(), removed }
  }
}

/**
 * 요청의 `state` 에서 걷어내는 필드. **제목은 걷어내지 않는다.** 제목 하나를 지우면 판단할 글이 남지 않는다.
 * 본문(① 기사 본문, ③ 고른 글)과 문장 요청의 문장만 본다.
 */
export const SCREENED_FIELDS = ['body', 'sentence'] as const

/**
 * **비울 수 없는 필드.** 걷어내 보고 남은 글이 있을 때만 쓴다.
 *
 * 제목이 그렇다. 지우면 판단할 글이 없어지지만, 안 보면 제목을 보는 질문 둘이
 * 공격 문장을 그대로 본다 (GE-47). 비면 원문을 쓰므로 **지금보다 나빠지는 경우가 없다.**
 */
export const KEPT_FIELDS = ['headline'] as const

export type StateScreenResult =
  | { ok: true; state: Record<string, string>; removed: number }
  /** 걷어내고 나니 그 필드에 남은 글이 없다. Jev 에 물을 것이 없다 */
  | { ok: false; removed: number }

/**
 * 요청의 `state` 를 걷어내는 함수를 만든다. 중계 서버와 eval(`run.mjs --screen`)이 같은 함수를 부른다.
 * 걷어낸 것이 없으면 받은 `state` 객체를 그대로 돌려준다.
 */
export function createStateScreen(schema: ScreenSchema): (state: Record<string, string>) => StateScreenResult {
  const screen = createScreen(schema)
  return (state) => {
    let out = state
    let removed = 0
    for (const f of SCREENED_FIELDS) {
      if (!Object.hasOwn(out, f)) continue
      const r = screen(out[f] ?? '')
      if (!r.removed) continue
      removed += r.removed
      if (!r.text) return { ok: false, removed }
      out = { ...out, [f]: r.text }
    }
    for (const f of KEPT_FIELDS) {
      if (!Object.hasOwn(out, f)) continue
      const r = screen(out[f] ?? '')
      // 걷어낸 것이 없거나, 걷어내고 나니 남은 글이 없으면 **원문을 그대로 둔다.**
      if (!r.removed || !r.text) continue
      removed += r.removed
      out = { ...out, [f]: r.text }
    }
    return { ok: true, state: out, removed }
  }
}
