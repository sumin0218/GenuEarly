// 판단 항목 원본을 읽고 요청을 검증한다.
//
// 원본은 packages/shared/judgment-items.json 하나다. 같은 문장을 여기 다시 적지 않는다.
// 항목의 question 객체는 **그대로** Jev 에 보낸다. 코드가 하는 일은 instructions 뒤에
// common_instructions 를 붙이는 것 하나뿐이다 (packages/shared/README.md).
import source from '../../../packages/shared/judgment-items.json'

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
  request_groups: Record<string, { state_fields: string[] }>
  items: Item[]
}

export const SCHEMA_VERSION = SCHEMA.version
export const SCHEMA_MODEL = SCHEMA.model

const ITEMS = new Map(SCHEMA.items.map((i) => [i.id, i]))
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

  const groupDef = GROUPS[group]
  if (!groupDef) return { error: 'unknown_group', detail: `unknown group: ${group}` }

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

  // --- items: 아는 id 만, 그리고 그 기능에서 이 그룹으로 가는 것만 ------------
  const questions: Record<string, Question> = {}
  const criteria: Record<string, Question['criteria']> = {}
  for (const id of items) {
    if (typeof id !== 'string') return { error: 'invalid_request', detail: 'items must be strings' }
    const item = ITEMS.get(id)
    // 모르는 id 를 통과시키면 우리 키로 남이 Jev 를 쓰는 셈이 된다.
    if (!item) return { error: 'unknown_item', detail: `unknown item: ${id}` }
    const belongs = item.request_group[feature]
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
      if (typeof a.choice !== 'string' || !(a.choice in crit)) return false
    }
  }
  return true
}
