// 글에서 **정해진 표현**을 찾는다. 모델에게 묻지 않는다.
//
// **왜 코드가 하는가.** Jev 는 분류기라 "이 글이 어떤가" 는 재지만 "이 표현이 글에
// 있는가" 는 못 센다. 글자가 그대로 들어 있어도 0.1~0.2 를 돌려준다 (docs/jev.md 8절 실측).
// `docs/jev.md` 3절의 "피해야 할 것" 첫 줄이 **"코드가 정확히 계산할 수 있는 것을
// 모델에 묻기"** 다. 문자열 찾기가 바로 그것이다.
//
// 코드는 Jev 도 LLM 도 못 하는 일을 한다 — **어디에 있는지 정확히 짚는다.**
//
// ⚠️ **여기 있는 낱말 목록은 우리가 정하는 판단이다.** ChatKHU 가 쓴 문구도 Jev 가 낸
// 답도 아니다. 그래서 판단 기준과 똑같이 다룬다 — 바꾸는 PR 은 eval 전후 수치를 적고
// ([README.md](../README.md) "규칙"), 목록의 근거는 judgment-items.json 의 criteria 다.
// **criteria 에 적혀 있지 않은 낱말을 여기에 넣지 않는다.** 넣으면 기준을 바꾸는 것이다.

/** 찾은 자리. `text` 는 **원문 그대로**다 — 화면에 그대로 인용한다. */
export interface Span {
  start: number
  end: number
  text: string
}

/** 하위 항목 하나의 결과. `id` 는 packages/content 의 `explain.*.parts` 키와 같다. */
export interface Evidence {
  id: string
  spans: Span[]
}

/** 어느 글을 보는가. 없는 필드는 보지 않는다. */
export interface EvidenceInput {
  headline?: string
  body?: string
}

interface Rule {
  /** `explain.*.parts` 의 키 */
  id: string
  field: 'headline' | 'body'
  /** 찾을 것. **근거는 judgment-items.json 의 criteria 다** */
  pattern: RegExp
  /**
   * 이만큼 넘게 나와야 "있다" 로 본다. 기본은 1.
   * criteria 가 "되풀이" 라고 적어 둔 항목만 2 이상이다.
   */
  min?: number
}

/**
 * 찾을 것들. **전부 criteria 에 글자 그대로 적혀 있는 예시다.**
 *
 * 정규식은 `g` 를 붙여 모든 자리를 찾는다. 유니코드 낱말 경계가 한국어에 쓸모없어
 * 경계 대신 **표현 자체**로 맞춘다.
 */
const RULES: readonly Rule[] = [
  // --- 제목 표현 (clickbait_headline) ------------------------------------
  // criteria: "'충격', '경악', '역대급', '난리 났다'처럼 사안보다 큰 수식어"
  //
  // **id 가 Jev 하위 질문 id 와 같다.** 같은 것을 묻기 때문이다 — Jev 는 "큰 수식어가
  // 있는가" 를 재고(0.77, docs/jev.md 8절) 코드는 **그게 어느 낱말인지** 찾는다.
  // id 가 같으면 explainLines 가 둘을 한 줄로 합쳐, Jev 가 낸 문장 밑에 인용이 붙는다.
  //
  {
    id: 'clk_inflating',
    field: 'headline',
    pattern: /충격|경악|역대급|난리\s*났다|초유의|발칵/g,
  },
  // criteria: "말줄임표·물음표로 궁금증만 남기는 것"
  //
  // **부호가 아니라 구절을 뜬다.** 따옴표 안에 물음표 하나가 덩그러니 놓이면 설명이
  // 되지 않는다 — "금메달 따면 군 면제?" 라고 떠야 어디가 그런지 보인다.
  // 그래서 부호 앞의 한 토막(쉼표·마침표로 끊기는 데까지, 최대 스무 자)을 함께 집는다.
  {
    id: 'clk_hiding',
    field: 'headline',
    pattern: /[^\s,·…?.][^,·…?.]{1,19}(?:[?…]|\.{3})/g,
  },

  // --- 공유 유도 (spread_inducement) --------------------------------------
  // criteria: "'꼭 공유하세요', '널리 알려 주세요', '삭제되기 전에 퍼뜨리세요'"
  {
    id: 'spr_urging',
    field: 'body',
    pattern: /공유\s*(해\s*주세요|하세요|바랍니다|부탁)|널리\s*알려|퍼뜨려|퍼뜨리세요|퍼날라/g,
  },
  // criteria: "'모두가 알아야 할', '주변에도 알려야 할'"
  {
    id: 'spr_hinting',
    field: 'body',
    pattern: /모두가?\s*알아야|주변에도?\s*알려|꼭\s*알아야/g,
  },

  // --- 감정적 표현 (emotional_language) -----------------------------------
  // instructions: "연달아 쓴 느낌표"
  {
    id: 'emo_exclaim',
    field: 'body',
    pattern: /!{2,}|！{2,}/g,
  },
  // instructions: "'분노'·'경악'·'끔찍한' 같은 낱말의 반복"
  // **반복이 기준이다.** 한 번 나온 것은 신호가 아니다.
  {
    id: 'emo_repeat',
    field: 'body',
    pattern: /분노|경악|끔찍|참담|충격|소름|치를\s*떨/g,
    min: 2,
  },
  // instructions: "독자를 겨냥한 공포 조성('당신도 당할 수 있다')"
  {
    id: 'emo_fear',
    field: 'body',
    pattern: /당신도|여러분도|우리\s*모두가?\s*위험|남의\s*일이\s*아니/g,
  },

  // --- 글의 문체 (ai_style_signal) ----------------------------------------
  // instructions: "'결론적으로'·'요약하자면' 같은 정리 표현"
  {
    id: 'ai_summary_phrase',
    field: 'body',
    pattern: /결론적으로|요약하자면|정리하자면|종합하면/g,
  },
  // instructions: "양쪽을 기계적으로 맞추는 문장('장단점이 모두 있다')"
  {
    id: 'ai_both_sides',
    field: 'body',
    pattern: /장단점이\s*(모두|다)\s*있|양측\s*모두\s*일리|각각의?\s*장단/g,
  },
]

/** 그 항목에 딸린 규칙들. 항목 id → 규칙 id 묶음. */
// **제목·본문은 없다.** Jev 가 맞히고(0.72, docs/jev.md 8절) 어긋난 자리는 한 낱말이
// 아니라 제목과 본문의 **관계**라 떼어 올 글자가 없다.
// **출처 표시도 없다.** 기관명·실명은 사전이 있어야 하고 우리에게 없다 — LLM 몫이다.
//
// 제목 표현은 **Jev 와 코드가 같은 질문을 나눠 맡는다.** 큰 수식어가 있는지는 Jev 가
// 재고, 그게 어느 낱말인지는 코드가 찾아 같은 줄에 인용으로 붙인다.
const BY_ITEM: Readonly<Record<string, readonly string[]>> = {
  clickbait_headline: ['clk_inflating', 'clk_hiding'],
  spread_inducement: ['spr_urging', 'spr_hinting'],
  emotional_language: ['emo_exclaim', 'emo_repeat', 'emo_fear'],
  ai_style_signal: ['ai_summary_phrase', 'ai_both_sides'],
}

/** 코드가 설명할 수 있는 항목인가. */
export const hasCodeEvidence = (itemId: string): boolean => Object.hasOwn(BY_ITEM, itemId)

/** 규칙 id 전부. 문구와 짝이 맞는지 검사가 본다. */
export const evidenceRuleIds = (): string[] => Object.values(BY_ITEM).flat()

/**
 * 그 항목의 근거가 될 표현을 글에서 찾는다.
 *
 * **찾은 것만 돌려준다.** 못 찾은 규칙은 빈 `spans` 로 들어 있어, 부르는 쪽이
 * "있다" 와 "없다" 를 모두 말할 수 있다.
 *
 * 글을 고치지 않는다. 자리만 돌려준다.
 */
export function findEvidence(itemId: string, input: EvidenceInput): Evidence[] {
  const ids = BY_ITEM[itemId]
  if (!ids) return []

  const out: Evidence[] = []
  for (const id of ids) {
    const rule = RULES.find((r) => r.id === id)
    if (!rule) continue
    const text = input[rule.field]
    if (typeof text !== 'string' || text.length === 0) continue

    const spans: Span[] = []
    // 정규식에 상태가 남지 않게 매번 새로 만든다.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags)
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
      // 한 항목에서 같은 표현을 끝없이 모으지 않는다. 화면에 들어갈 만큼만.
      if (spans.length >= 5) break
    }
    out.push({ id, spans: spans.length >= (rule.min ?? 1) ? spans : [] })
  }
  return out
}
