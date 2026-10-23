// 평가 세트의 가상 기사 15건을 ChatKHU로 만든다 (../data/README.md 2절).
// 결과는 private/ge13/fictional/ 에만 쓴다. 커밋하지 않는다.
//
// - 실존 인물·기관·언론사·특정 사건을 쓰지 않는다. 도시는 가상의 '한별시'다
// - 의료·백신·재난·선거 같은, 믿으면 해가 되는 주제를 쓰지 않는다
// - target 은 정답이 아니라 만들 때의 의도다. 라벨은 사람이 따로 붙인다
// - human_rewrite: true 인 5건은 사람이 직접 고쳐 쓴 뒤에 라벨링한다 (AI 문체가 정답과 겹치지 않게)
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { chat, MODEL } from './chatkhu.mjs'

const OUT = new URL('../data/private/ge13/fictional/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const SIGNAL = {
  no_source: '주장에 출처를 전혀 밝히지 않는다. "따르면", "밝혔다" 같은 출처 표현도, 기관명·실명도 쓰지 않는다',
  unnamed_source: '출처를 "한 관계자는", "업계에서는", "전문가들은"처럼 이름 없이 집단·직함으로만 적는다. 기관명과 실명은 쓰지 않는다',
  contradicts: '제목의 핵심 내용(주어·서술어·수치)이 본문 내용과 양립할 수 없게 쓴다. 예: 제목은 확정이라 하고 본문은 검토 단계라고 적는다',
  partial: '제목이 본문의 곁가지를 핵심처럼 내세우거나, 본문의 조건("~할 수도 있다")을 떼고 단정한다',
  strong_clickbait: '제목의 중심을 "결국 이것", "그 이유는…"처럼 대상을 감추는 표현이나 "충격", "역대급" 같은 부풀린 수식어로 채운다',
  mild_clickbait: '제목에 낚시성 표현을 하나 섞되, 무엇에 관한 기사인지는 제목만으로 알 수 있게 한다',
  urging: '본문 끝에 독자에게 "꼭 공유해 주세요", "주변에 널리 알려 주세요"처럼 퍼뜨리기를 직접 요구한다',
  hinting: '"모두가 알아야 할", "주변에도 알려야 할"처럼 전달할 필요를 강조하되 직접 요구하지는 않는다',
  emotional_3: '글 전체를 분노·불안을 끌어올리는 표현 중심으로 짠다. 감정 낱말을 지우면 사실 정보가 거의 남지 않게 한다',
  emotional_2: '분노·불안을 자극하는 표현을 글 곳곳에 반복하되, 사실 정보는 따로 남아 있게 한다',
}
const STYLE = {
  news: '일반적인 한국 인터넷 신문 기사체. 바이라인은 쓰지 않는다',
  community: '온라인 커뮤니티 게시글. 구어체, 줄임말, 맞춤법이 조금 틀린 곳이 있어도 된다. 기사처럼 정리하지 않는다',
  local: '지역 소식지·소식 공유 단톡방에 도는 글. 짧고 단정적이다',
  blog: '개인 블로그 글. 1인칭 경험담이 섞이고 문단 길이가 들쭉날쭉하다',
  draft: '일반적인 한국 인터넷 신문 기사체. 사람이 나중에 고쳐 쓸 초안이다',
}
const SPECS = [
  ['f-001', 'news', '한별시 시내버스 노선 개편', ['no_source', 'urging']],
  ['f-002', 'news', '가상 식품기업 "새봄푸드"의 과자 가격 인상', ['contradicts', 'strong_clickbait']],
  ['f-003', 'news', '한별시 아파트 관리비 인상', ['emotional_3', 'no_source']],
  ['f-004', 'news', '가상 모바일 메신저 앱 "톡톡이"의 유료화 검토', ['unnamed_source', 'hinting', 'mild_clickbait']],
  ['f-005', 'news', '가상 프로축구단 "한별 FC"의 주전 선수 이적', ['strong_clickbait', 'emotional_2', 'urging']],
  ['f-006', 'community', '한별시 공영주차장 요금 인상', ['urging', 'no_source', 'emotional_3']],
  ['f-007', 'community', '가상 게임 "스타필드 크로니클" 대규모 업데이트', ['unnamed_source', 'partial']],
  ['f-008', 'local', '한별시 동네 전통시장 주말 휴무', ['no_source', 'hinting']],
  ['f-009', 'blog', '가상 편의점 체인 "하루마트"의 신상품 단종', ['strong_clickbait', 'contradicts']],
  ['f-010', 'blog', '가상 공유 전기자전거 "씽씽바이크" 요금제 변경', ['unnamed_source', 'emotional_2', 'urging']],
  ['f-011', 'draft', '한별시 공공도서관 운영 시간 단축', ['no_source', 'urging']],
  ['f-012', 'draft', '가상 대학 "한별대" 기숙사비 인상', ['contradicts', 'mild_clickbait']],
  ['f-013', 'draft', '가상 아이돌 그룹 "루미너스"의 활동 중단설', ['emotional_3', 'unnamed_source']],
  ['f-014', 'draft', '한별시 반려견 놀이터 이용 규칙 변경', ['strong_clickbait', 'hinting']],
  ['f-015', 'draft', '가상 택배회사 "빠른날개"의 주말 배송 축소', ['unnamed_source', 'mild_clickbait']],
]

const prompt = (topic, style, target) => `한국어 뉴스의 '주의 신호'를 알려 주는 브라우저 확장 프로그램의 **평가용 데이터**를 만든다.
이 글은 공개되지 않는 평가 세트에만 들어가며, 판단 모델이 신호를 제대로 잡는지 재는 데 쓴다.

아래 조건으로 가상의 글 한 편을 써라.

주제: ${topic}
문체: ${STYLE[style]}
반드시 넣을 신호:
${target.map((t) => `- ${SIGNAL[t]}`).join('\n')}
위에 없는 신호는 넣지 않는다. 예를 들어 퍼뜨리기 요구가 목록에 없으면 공유를 권하지 않는다.

지킬 것:
- 모든 인물·기관·회사·언론사·지명은 가상이다. 실존하는 이름(정부 부처, 실제 기업, 실제 도시, 실존 인물)을 쓰지 않는다. 도시는 '한별시'만 쓴다
- 의료, 건강, 재난, 선거, 범죄 피해 주제로 번지지 않게 한다
- 본문은 600~1200자
- 글 안에 '가상', '평가용' 같은 말을 넣지 않는다. 독자가 읽는 글 그대로 쓴다

출력은 JSON 하나만: {"headline": "...", "body": "..."}`

for (const [id, style, topic, target] of SPECS) {
  const file = new URL(`${id}.json`, OUT)
  if (existsSync(file)) { console.log(`${id} 있음, 건너뜀`); continue }
  const p = prompt(topic, style, target)
  const res = await chat([{ role: 'user', content: p }], { temperature: 0.9, maxTokens: 3000 })
  const m = /\{[\s\S]*\}/.exec(res.text)
  let art
  try { art = JSON.parse(m[0]) } catch { console.error(`${id} JSON 해석 실패:\n${res.text.slice(0, 300)}`); continue }
  writeFileSync(file, JSON.stringify({
    id, fictional: true, topic, style, target, human_rewrite: style === 'draft',
    model: res.model, requested_model: MODEL, generated_at: new Date().toISOString(), prompt: p,
    headline: art.headline, body: art.body,
  }, null, 2), 'utf8')
  console.log(`${id} [${style}] ${art.headline}  (${art.body.length}자)`)
}
