// 판단 항목 원본을 읽고 요청을 검증한다.
//
// 원본은 packages/shared/judgment-items.json 하나다. 같은 문장을 여기 다시 적지 않는다.
// 항목의 question 객체는 **그대로** Jev 에 보낸다. 코드가 하는 일은 instructions 뒤에
// common_instructions 를 붙이는 것 하나뿐이다 (packages/shared/README.md).
import source from '../../../packages/shared/judgment-items.json'
import { createStateScreen } from '../../../packages/shared/src/screen'

export interface Question {
  type: 'choice' | 'score' | 'noul'
  instructions: string
  criteria: Record<string, string> | string[]
}

interface Item {
  id: string
  unit: string
  request_group: Record<string, string>
  question?: Question
  questions?: { id: string; question: Question }[]
}

const SCHEMA = source as unknown as {
  version: string
  model: string
  common_instructions: string
  request_groups: Record<string, { state_fields: string[]; required?: Record<string, string[]> }>
  items: Item[]
}

export const SCHEMA_VERSION = SCHEMA.version
export const SCHEMA_MODEL = SCHEMA.model

// **설명 전용 항목을 여기서만 합친다.** 스키마가 `items` 와 `explain_items` 로 갈라 둔 것은
// 점수를 내는 쪽이 설명 항목을 집어 가지 못하게 하려는 것이다 (judgment-items.json).
// 중계 서버는 둘 다 받아야 한다 — 어느 쪽이든 `request_group` 이 맞으면 보내 준다.
const ITEMS = new Map(
  [...SCHEMA.items, ...((SCHEMA as { explain_items?: typeof SCHEMA.items }).explain_items ?? [])]
    .map((i) => [i.id, i] as const),
)
const GROUPS = SCHEMA.request_groups

/** 그 항목이 내는 Jev 질문들. 한 판단이 질문 여러 개로 나뉘는 항목이 있다. */
function questionsOf(item: Item): [string, Question][] {
  if (item.questions) return item.questions.map((q) => [q.id, q.question])
  return [[item.id, item.question as Question]]
}

/** 보내기 직전에 공통 지시를 덧붙인다. 그 밖에는 손대지 않는다. */
function withCommon(q: Question): Question {
  return { ...q, instructions: `${q.instructions}\n${SCHEMA.common_instructions}` }
}

export type Rejection = { error: string; detail: string }
export type Accepted = {
  questions: Record<string, Question>
  state: Record<string, string>
  /** 응답 검증에 쓴다. 질문 id → 그 질문의 criteria */
  criteria: Record<string, Question['criteria']>
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 요청을 검증하고 Jev 에 보낼 questions·state 를 만든다.
 *
 * **id 가 있는지만 보면 안 된다.** 항목·그룹·기능의 짝이 맞는지까지 본다.
 * 짝을 안 보면 `headline_body` 그룹에 `clickbait_headline` 을 넣어 제목 판단에 본문을
 * 섞는 요청이 통과한다 (docs/architecture.md 4절).
 */
export function buildRequest(body: unknown): Rejection | Accepted {
  if (!isPlainObject(body)) return { error: 'invalid_request', detail: 'body must be an object' }

  const { feature, group, items, state } = body
  if (typeof feature !== 'string') return { error: 'invalid_request', detail: 'feature must be a string' }
  if (typeof group !== 'string') return { error: 'invalid_request', detail: 'group must be a string' }
  if (!Array.isArray(items) || items.length === 0)
    return { error: 'invalid_request', detail: 'items must be a non-empty array' }
  if (!isPlainObject(state)) return { error: 'invalid_request', detail: 'state must be an object' }

  // Object.hasOwn 으로 본다. `group in GROUPS` 는 "constructor" 같은 프로토타입 이름에도 참이다.
  if (!Object.hasOwn(GROUPS, group)) return { error: 'unknown_group', detail: `unknown group: ${group}` }
  const groupDef = GROUPS[group]

  // --- state: 그룹이 허용한 필드만. 그 밖은 무시가 아니라 거절 ---------------
  const allowed = new Set(groupDef.state_fields)
  const built: Record<string, string> = {}
  for (const [k, v] of Object.entries(state)) {
    if (!allowed.has(k)) return { error: 'field_not_in_group', detail: `state.${k} is not allowed in group ${group}` }
    if (typeof v !== 'string' || v.length === 0)
      return { error: 'invalid_request', detail: `state.${k} must be a non-empty string` }
    built[k] = v
  }
  if (Object.keys(built).length === 0)
    return { error: 'invalid_request', detail: 'state has no field' }

  // **허용한 필드만 보는 것으로는 부족하다.** 필드를 빼고 보내면 그룹·기능의 짝은 맞는데
  // 판단에 필요한 글이 없는 요청이 통과한다. `headline_body` 에 `headline` 만 넣어
  // `source_citation` 을 보내면 본문 없이 출처를 묻게 되어 구조적으로 "출처 부재"(주의)가 나온다.
  // 확장 프로그램이 본문 추출에 실패하고 빈 값 대신 필드를 빼 보내는 버그만으로도 생긴다.
  const required = groupDef.required && Object.hasOwn(groupDef.required, feature)
    ? groupDef.required[feature]
    : null
  if (!required) return { error: 'group_not_in_feature', detail: `group ${group} is not used by feature ${feature}` }
  for (const f of required) {
    if (!Object.hasOwn(built, f))
      return { error: 'missing_state_field', detail: `state.${f} is required for group ${group} in feature ${feature}` }
  }

  // --- items: 아는 id 만, 그리고 그 기능에서 이 그룹으로 가는 것만 ------------
  const questions: Record<string, Question> = {}
  const criteria: Record<string, Question['criteria']> = {}
  for (const id of items) {
    if (typeof id !== 'string') return { error: 'invalid_request', detail: 'items must be strings' }
    const item = ITEMS.get(id)
    // 모르는 id 를 통과시키면 우리 키로 남이 Jev 를 쓰는 셈이 된다.
    if (!item) return { error: 'unknown_item', detail: `unknown item: ${id}` }
    const belongs = Object.hasOwn(item.request_group, feature) ? item.request_group[feature] : undefined
    if (!belongs) return { error: 'item_not_in_feature', detail: `item ${id} is not used by feature ${feature}` }
    if (belongs !== group)
      return { error: 'item_not_in_group', detail: `item ${id} belongs to group ${belongs} in feature ${feature}, not ${group}` }
    for (const [qid, q] of questionsOf(item)) {
      questions[qid] = withCommon(q)
      criteria[qid] = q.criteria
    }
  }

  return { questions, state: built, criteria }
}

export const isRejection = (r: Rejection | Accepted): r is Rejection => 'error' in r

/**
 * 기사 글에서 판단기를 노린 문장을 걷어낸다 (GE-35). 본문과 문장만 보고 제목은 두지 않는다.
 * 규칙과 필드 목록은 packages/shared/src/screen.ts 에 있다. eval 의 run.mjs --screen 도 같은 함수를 부른다.
 */
export const screenState = createStateScreen(SCHEMA)

/**
 * Jev 응답이 우리가 정한 답의 범위 안인지 본다.
 *
 * Score 는 0~1 이 아니라 **0 ~ (등급 수 − 1)** 이다. Noul 은 "예"일 확률 하나뿐이고
 * confidence 가 없다. 둘 다 2026-10-21 실제 호출로 확인했다 (packages/shared/README.md).
 */
export function answersAreValid(
  answers: unknown,
  criteria: Record<string, Question['criteria']>,
): boolean {
  if (!isPlainObject(answers)) return false
  for (const [qid, crit] of Object.entries(criteria)) {
    const a = answers[qid]
    if (!isPlainObject(a)) return false
    if (Array.isArray(crit)) {
      // score — 자리가 곧 점수
      if (a.type !== 'score') return false
      if (typeof a.score !== 'number' || !Number.isFinite(a.score)) return false
      if (a.score < 0 || a.score > crit.length - 1) return false
    } else if ('true' in crit && 'false' in crit && Object.keys(crit).length === 2) {
      // noul — "예"일 확률 하나
      if (a.type !== 'noul') return false
      if (typeof a.noul !== 'number' || a.noul < 0 || a.noul > 1) return false
    } else {
      // choice — 정한 보기 안이어야 한다
      if (a.type !== 'choice') return false
      // `in` 은 프로토타입까지 본다. "constructor" 같은 답이 통과하면 안 된다.
      if (typeof a.choice !== 'string' || !Object.hasOwn(crit, a.choice)) return false
    }
  }
  return true
}
