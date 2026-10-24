// 점수 합산과 배지 단계 결정에 쓰는 숫자는 **전부 여기 있다.** 다른 파일에 숫자를 적지 않는다.
//
// ⚠️ **측정으로 정한 값은 `NOISE` 하나뿐이다.** 나머지는 평가 세트(GE-13)의 1차 측정(GE-17) 전에
// 문서의 원칙에서 끌어낸 임시값이다. 값마다 어느 원칙에서 나왔는지 적었다.
// 바꾸는 PR 은 eval 전후 수치를 적는다 (packages/shared/README.md "규칙").
//
// 모양은 GE-17 이 값만 바꾸면 되게 잡았다. 항목별로 다르게 둘 수 있는 값은 처음부터
// 항목 id → 값 맵으로 두고, 지금은 모든 항목에 같은 값을 넣었다.

/** 판단 항목 id. judgment-items.json 의 `items[].id` 와 글자 그대로 같다. */
export type ItemId =
  | 'source_citation'
  | 'headline_body_match'
  | 'clickbait_headline'
  | 'spread_inducement'
  | 'emotional_language'
  | 'ai_style_signal'
  | 'unverifiable_claim'

/**
 * 모델 자체의 흔들림. **이것만 측정값이다.**
 * 같은 입력 3회, 396자리에서 평균 0.018 · 95% 0.06 · 최대 0.15 (2026-10-22,
 * eval/experiments/sentence-batching). 경계를 이보다 좁게 잡으면 같은 기사가 새로고침마다 바뀐다.
 * 판정 코드는 이 값을 쓰지 않는다. 아래 경계들이 이보다 넉넉한지 테스트가 본다.
 */
export const NOISE = 0.02

// --- 항목 점수 ------------------------------------------------------------------

/**
 * Choice 보기의 방향(judgment-items.json 의 `signals`)을 0(안심) ~ 1(주의) 점수로.
 * 보기가 셋이고 방향이 셋이라 등간격으로 두었다. 보기 순서가 아니라 이 값을 읽는다.
 */
export const SIGNAL_SCORE = { clear: 0, neutral: 0.5, caution: 1 } as const

/**
 * 항목별 가중치. **합이 1 일 필요는 없다.** 판단된 항목의 가중치로 나눠 가중평균을 낸다
 * (판단 보류된 항목이 0점으로 끌어내리지 않게 하기 위해서다).
 *
 * - 근거 있는 차등이 없어서 **기본은 모두 1** 이다. 측정 전에 차등을 두면 그 차등이 곧 추측이다
 * - `ai_style_signal` 만 **0.5** 다. 기계로 쓴 진짜 기사가 많아서 **단독으로 🔴 을 만들지 못하게**
 *   낮게 둔다 (docs/product.md 4절 "원칙"). 단독으로 못 만드는 것 자체는 `MIN_CAUTION_ITEMS` 가
 *   보장하고, 이 값은 다른 신호와 섞일 때 끌어올리는 힘을 줄인다
 */
export const ITEM_WEIGHTS: Record<ItemId, number> = {
  source_citation: 1,
  headline_body_match: 1,
  clickbait_headline: 1,
  spread_inducement: 1,
  emotional_language: 1,
  ai_style_signal: 0.5,
  unverifiable_claim: 1,
}

// --- 확신도 -----------------------------------------------------------------------

/**
 * Choice·Score 의 `confidence` 가 이 **아래**면 그 항목은 ⚪ 다.
 * 0.5 는 Jev 문서가 "모델이 진짜로 불확실하다고 말하는" 바닥선으로 설명하는 값이다
 * (docs/jev.md 5절). 그 위의 값은 틀렸을 때의 대가에 따라 잡으라고 하므로 측정 뒤에 올린다.
 * 항목마다 다르게 둘 수 있게 맵으로 둔다 (같은 절 "우리 규칙").
 */
export const CONFIDENCE_FLOOR: Record<ItemId, number> = {
  source_citation: 0.5,
  headline_body_match: 0.5,
  clickbait_headline: 0.5,
  spread_inducement: 0.5,
  emotional_language: 0.5,
  ai_style_signal: 0.5,
  unverifiable_claim: 0.5, // Noul 이라 쓰지 않는다. 자리만 맞춘다 (아래 UNDETERMINED_BAND)
}

/**
 * 🔴 을 받쳐 주는 항목은 `confidence` 가 이 **이상**이어야 한다.
 * **🔴 은 🟢 보다 높은 확신도를 요구한다** (docs/product.md 5절, docs/jev.md 5절).
 * 바닥선과 이 값 사이는 문서의 "중간" 구간이다. 그 구간의 주의 신호는 🟡 까지만 올린다.
 * 0.7 은 바닥선(0.5)과 1 사이를 대략 나눈 자리다. 측정 근거는 없다.
 */
export const CAUTION_CONFIDENCE: Record<ItemId, number> = {
  source_citation: 0.7,
  headline_body_match: 0.7,
  clickbait_headline: 0.7,
  spread_inducement: 0.7,
  emotional_language: 0.7,
  ai_style_signal: 0.7,
  unverifiable_claim: 0.7, // Noul 이라 쓰지 않는다. 밴드 밖이면 확신한 것으로 본다
}

/**
 * Noul 확률이 이 구간 **안**(양 끝 포함)이면 그 질문은 "모름" 이다. Noul 에는 `confidence` 가 없어서
 * 이 구간이 확신도 임계값 자리를 맡는다 (packages/shared/README.md "⚪ 판단 보류를 만드는 곳").
 *
 * judgment-items.json 의 `undetermined_band` 가 정해지면(`null` 이 아니면) **그 값이 이긴다.**
 * 이 값은 그 전까지 쓰는 기본값이다. 0.5 에서 ±0.1 로, 같은 입력의 95% 흔들림(0.06)은 덮고
 * 꼬리(최대 0.15)는 못 덮는다. 꼬리까지 덮으려면 [0.35, 0.65] 인데 그만큼 ⚪ 가 늘어서,
 * 어느 쪽이 나은지는 측정 뒤에 정한다 (packages/shared/README.md "모델 노이즈 바닥").
 */
export const UNDETERMINED_BAND: readonly [number, number] = [0.4, 0.6]

// --- 배지 단계 ----------------------------------------------------------------------

/**
 * 항목 점수가 이 **이상**이면 그 항목은 "주의 신호" 다.
 * Choice 의 주의 보기(1)와 Score 의 위쪽 절반(4등급이면 2·3 → 0.67·1)이 들어오고,
 * Choice 의 중간 보기(0.5)와 Score 1등급(0.33)은 들어오지 않는다.
 */
export const ITEM_CAUTION_AT = 0.65

/**
 * 🔴 이 되려면 **확신도 높은 주의 신호가 이만큼 따로 있어야 한다**
 * (점수 `ITEM_CAUTION_AT` 이상, 확신도 `CAUTION_CONFIDENCE` 이상).
 * - docs/product.md 3절의 🔴 정의가 "주의가 필요한 신호가 **여럿**이다" 다
 * - 2 이면 `ai_style_signal` 이 단독으로 🔴 을 만들 수 없다 (같은 문서 4절 "원칙")
 * - 모든 항목이 중간 보기(평균 0.5)여도 주의 신호가 없으니 🔴 이 아니다
 */
export const MIN_CAUTION_ITEMS = 2

/**
 * 가중평균 점수(0~1)를 단계로 가르는 경계. 위의 신호 개수 조건과 **함께** 본다.
 * - `CAUTION_AT` **이상**이고 주의 신호가 `MIN_CAUTION_ITEMS` 이상이면 🔴.
 *   주의 신호 둘에 나머지가 전부 안심이면(항목 7개에서 평균 약 0.31) 🟡 에 머물고,
 *   셋이면(약 0.46) 🔴 이 되는 자리에 두었다. 신호 두 개만으로 🔴 을 내지 않는 쪽이 오탐에 덜 비싸다
 * - `SAFE_BELOW` **미만**이고 주의 신호가 **하나도 없으면** 🟢. 🟢 은 "눈에 띄는 신호가 없다" 이므로
 *   평균이 낮아도 주의 신호가 하나라도 있으면 🟡 이다. 중간 보기 둘(항목 7개에서 약 0.15)까지 🟢 이다
 * - 그 밖은 전부 🟡
 */
export const CAUTION_AT = 0.4
export const SAFE_BELOW = 0.3

/**
 * 판단된 항목이 이보다 적으면 기사 전체를 ⚪ 로 둔다.
 * 항목 하나로 기사 전체를 🟢 이나 🔴 으로 말하면 그 항목 하나의 오판이 그대로 배지가 된다.
 * 🔴 은 `MIN_CAUTION_ITEMS` 가 이미 막지만 🟢 도 근거가 하나뿐이면 단정이다.
 */
export const MIN_JUDGED_ITEMS = 2
