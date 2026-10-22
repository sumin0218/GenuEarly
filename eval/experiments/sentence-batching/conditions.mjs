// 재는 조건들.
//
// **base 와 b4 를 바로 비교하면 두 가지가 동시에 다르다** — 한 요청에 문장이 여럿 들어가는 것과,
// state 필드 이름이 `sentence` 에서 `s1`…`sN` 으로 바뀌는 것(지시문 글자도 따라 바뀐다).
// 그래서 "옆 문장이 샌다" 를 주장하려면 **이름만 바꾼 조건**이 있어야 한다. 그것이 name1 이다.
//
//   base → name1   이름 효과만
//   name1 → bN     묶음 효과만 (이름을 고정한 채)
//   base → bN      둘이 합쳐진 것
export const CONDITIONS = [
  { key: 'base',  size: 1,  naming: 'sentence', label: '묶음 1 · state.sentence (현재 방식)' },
  { key: 'name1', size: 1,  naming: 'indexed',  label: '묶음 1 · state.s1 (이름만 바꾼 통제)' },
  { key: 'b4',    size: 4,  naming: 'indexed',  label: '묶음 4' },
  { key: 'b8',    size: 8,  naming: 'indexed',  label: '묶음 8' },
  { key: 'b12',   size: 12, naming: 'indexed',  label: '묶음 12' },
  { key: 'b16',   size: 16, naming: 'indexed',  label: '묶음 16 (API 상한)' },
]
export const RUNS = 3
