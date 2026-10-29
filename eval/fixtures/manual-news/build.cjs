const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = __dirname;
const all = JSON.parse(fs.readFileSync(path.join(root, 'articles.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const groups = [
  { id: 'people', title: '1. 실존 인물을 차용한 허구 기사', note: '기존 인물 기사 15건 · 모두 허구' },
  { id: 'organizations', title: '2. 실제 지명·단체·법인을 차용한 허구 기사', note: '지명 중심 5건 · 단체·기관 중심 5건 · 법인 중심 5건 · 모두 허구' },
  { id: 'clickbait', title: '3. 과장된 제목과 서로 다른 본문', note: '사소한 내용 5건 · 사실 기반 5건 · 허구 내용 5건' }
];
const subtypeName = { person: '인물·허구', place: '지명·허구', organization: '단체·기관·허구', corporation: '법인·허구', trivial: '사소한 내용·상황은 허구', true: '사실 기반', false: '허구 내용' };
const signals = { no_source: '출처 미제시', unnamed_source: '익명 출처', contradicts: '제목·본문 불일치', partial: '조건·범위 생략', strong_clickbait: '대상을 감추는 제목', mild_clickbait: '과장된 수식어', urging: '직접 공유 요구', hinting: '간접 공유 유도', headline_body_gap: '제목의 기대와 본문 정보량 차이' };
const warning = a => a.truth_status === 'source_verified'
  ? '테스트용으로 새로 작성한 글입니다. 본문의 주요 사실은 아래 공식 자료로 확인했으며, 과장된 제목은 시험을 위해 작성했습니다. 최신 속보가 아니며 실제 언론사 기사가 아닙니다.'
  : '실제 보도가 아닌 허구의 테스트 기사입니다. 실존 인물·지명·기관·법인 이름을 차용했지만 등장하는 행사·상황·발언은 시험용으로 지어낸 내용입니다.';
const instructions = '선택 버튼을 누른 뒤 선택된 글에서 우클릭 → GenuEarly 검사. 로컬 파일에서는 지원 뉴스 사이트용 자동 배지가 나타나지 않습니다. 선택 검사는 제목·본문 비교나 출처 판단을 포함한 전체 기사 검사와 다릅니다.';
const styles = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202938;font:17px/1.85 system-ui,sans-serif}main{max-width:960px;margin:32px auto;padding:0 24px 60px}h1{font-size:30px;line-height:1.45}h2{font-size:22px;line-height:1.5}a{color:#2455a3}aside{border:1px solid #c7a363;border-left:5px solid #b57a17;border-radius:8px;background:#fff7e7;padding:14px 18px;font-size:15px}aside strong{display:block}nav{display:flex;justify-content:space-between;gap:16px;margin:24px 0;font-size:15px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:24px 0}.card{background:white;padding:22px;border:1px solid #dbe0e7;border-radius:12px}.card h2{margin-top:0}small,.help{font-size:14px;color:#586273}article{background:white;border:1px solid #dbe0e7;border-radius:10px;padding:8px 26px;margin:22px 0}article p{margin:22px 0}button{font:inherit;font-size:15px;padding:9px 14px;border:1px solid #a8b5c8;border-radius:7px;background:white;color:#214c87;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #699ee9;outline-offset:3px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}li{margin:16px 0}details{font-size:14px;padding:16px;background:#edf0f5;border-radius:8px}footer{font-size:14px;border-top:1px solid #ccd2dc;padding-top:16px;margin-top:24px}section{scroll-margin-top:20px}.source-list{font-size:14px;overflow-wrap:anywhere}@media(max-width:600px){main{padding:0 16px 40px}article{padding:8px 16px}h1{font-size:25px}nav{flex-wrap:wrap}}`;
const page = (title, body, article = false) => `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>[테스트용] ${esc(title)}</title><style>${styles}</style>${article ? '<script defer src="controls.js"></script>' : ''}</head><body><main>${body}</main></body></html>\n`;
const row = a => `<li><a href="${a.id}.html">${esc(a.headline)}</a><br><small>${a.id} · ${a.body.length}자 · ${a.entities.map(esc).join(', ')}</small></li>`;
const list = items => `<ol>${items.map(row).join('')}</ol>`;
const groupContent = g => g.id === 'clickbait'
  ? ['trivial', 'true', 'false'].map(s => `<section id="${s}"><h2>${esc(subtypeName[s])} · 5건</h2>${list(all.filter(a => a.category === g.id && a.subtype === s))}</section>`).join('')
  : list(all.filter(a => a.category === g.id));

assert.equal(all.length, 45);
assert.equal(new Set(all.map(a => a.id)).size, 45);
for (const g of groups) assert.equal(all.filter(a => a.category === g.id).length, 15);
for (const s of ['trivial', 'true', 'false']) assert.equal(all.filter(a => a.category === 'clickbait' && a.subtype === s).length, 5);
for (const a of all) {
  assert(a.body.length >= 230, `${a.id}: too short`);
  assert(a.body.length + a.headline.length + 3 < 4000, `${a.id}: selection too long`);
  assert(a.entities.every(name => a.body.includes(name)), `${a.id}: missing real name`);
  if (a.truth_status === 'source_verified') {
    assert.equal(a.subtype, 'true');
    assert.equal(a.verified_on, '2026-10-29');
    assert(a.sources.length > 0);
    for (const s of a.sources) assert(new URL(s.url).protocol === 'https:');
  } else assert.equal(a.truth_status, 'fictional');
}

const index = page('GenuEarly 수동 테스트 기사 45건', `<h1>GenuEarly 수동 테스트 기사 45건</h1><aside><strong>시험용으로 작성한 자료 · 실제 언론사 기사 아님</strong>허구의 기사 40건과 공식 자료를 확인해 다시 쓴 사실 기반 기사 5건입니다. 사실 여부와 과장된 제목의 유무는 별개의 구분입니다.</aside><p class="help">${esc(instructions)}</p><div class="cards">${groups.map(g => `<div class="card"><h2><a href="${g.id}.html">${esc(g.title)}</a></h2><p>${esc(g.note)}</p><strong>15건</strong></div>`).join('')}</div><h2>전체 목차</h2>${groups.map(g => `<section id="${g.id}"><h2><a href="${g.id}.html">${esc(g.title)}</a></h2>${groupContent(g)}</section>`).join('')}<footer>작성일: 2026-10-29 · 브라우저 파일 직접 열기 지원 · 정식 GE-13 평가 세트와 분리 · 선택 검사 재현용</footer>`);
fs.writeFileSync(path.join(root, 'index.html'), index);

for (const g of groups) {
  fs.writeFileSync(path.join(root, `${g.id}.html`), page(g.title, `<nav><a href="index.html">← 전체 45건</a></nav><h1>${esc(g.title)}</h1><aside>${esc(g.note)}. 전체 글은 수동 테스트용으로 작성했습니다. 실제 언론사 기사와 구별해 사용하세요.</aside><p class="help">${esc(instructions)}</p>${groupContent(g)}`));
}

for (const a of all) {
  const g = groups.find(g => g.id === a.category);
  const members = all.filter(b => b.category === a.category);
  const i = members.findIndex(b => b.id === a.id);
  const nav = `<nav>${i ? `<a href="${members[i - 1].id}.html">← 이전</a>` : '<span></span>'}<a href="${a.category}.html">이 분류 목록 (${i + 1}/15)</a><a href="index.html">전체 45건</a>${i < 14 ? `<a href="${members[i + 1].id}.html">다음 →</a>` : '<span></span>'}</nav>`;
  const sources = a.sources ? `<section class="source-list"><h2>사실 확인에 사용한 공식 자료</h2><ul>${a.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul><p>확인일: ${a.verified_on}. 원문을 복사하지 않고 요약한 테스트 글입니다. 제목의 과장 표현은 원출처의 제목이 아닙니다.</p></section>` : '';
  const content = `${nav}<p class="help">${esc(g.title)} · ${a.id}</p><aside><strong>${a.truth_status === 'source_verified' ? '사실 기반 본문 · 과장된 테스트 제목' : '허구 · 실존 명칭을 차용한 테스트 자료'}</strong>${esc(warning(a))}</aside><div class="toolbar"><button type="button" data-select="article">제목·본문 선택</button><button type="button" data-select="headline">제목만 선택</button><button type="button" data-select="body">본문만 선택</button></div><p id="status" role="status" class="help">${esc(instructions)}</p><article id="article"><h1 id="headline">${esc(a.headline)}</h1><div id="body">${a.body.split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('')}</div></article>${sources}<details><summary>테스트 작성 정보 (판단 정답 아님)</summary><p>${a.target.map(t => esc(signals[t] || t)).join(' · ')}</p><p>이 표시는 작성 의도입니다. 허구라는 분류만으로 확장 프로그램이 특정 배지 색을 출력해야 한다는 뜻은 아닙니다. 정식 평가 정답이나 성능 검증 결과로 사용하지 않습니다.</p></details>${nav}<footer>${esc(warning(a))}</footer>`;
  fs.writeFileSync(path.join(root, `${a.id}.html`), page(a.headline, content, true));
}

fs.writeFileSync(path.join(root, 'controls.js'), `document.querySelectorAll('[data-select]').forEach(button => {\n  button.addEventListener('click', () => {\n    const target = document.getElementById(button.dataset.select);\n    const range = document.createRange();\n    range.selectNodeContents(target);\n    const selection = window.getSelection();\n    selection.removeAllRanges();\n    selection.addRange(range);\n    document.getElementById('status').textContent = '선택된 글 위에서 우클릭 → GenuEarly 검사';\n  });\n});\n`);
fs.writeFileSync(path.join(root, 'articles.json'), JSON.stringify(all, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ created_on: '2026-10-29', authoring_tool: 'Codex', purpose: 'manual-extension-testing-only', official_eval: false, counts: { total: 45, people: 15, organizations: 15, clickbait: { trivial: 5, true: 5, false: 5 }, fictional: 40, source_verified: 5 }, items: all.map(a => ({ id: a.id, path: a.id + '.html', category: a.category, subtype: a.subtype, truth_status: a.truth_status, sources: a.sources || [] })) }, null, 2) + '\n');
const pages = ['index.html', ...groups.map(g => g.id + '.html'), ...all.map(a => a.id + '.html')];
for (const p of pages) {
  const html = fs.readFileSync(path.join(root, p), 'utf8');
  assert(html.includes('테스트'));
  for (const [, link] of html.matchAll(/href="([^"]+)"/g)) {
    if (link.startsWith('https://')) continue;
    assert(!link.startsWith('/'), `Absolute link: ${p}`);
    assert(fs.existsSync(path.join(root, link)), `Broken link ${p}: ${link}`);
  }
}
console.log(JSON.stringify({ total: all.length, categories: groups.map(g => ({ id: g.id, count: all.filter(a => a.category === g.id).length })), fictional: 40, source_verified: 5, min_chars: Math.min(...all.map(a => a.body.length)), max_chars: Math.max(...all.map(a => a.body.length)), checked_pages: pages.length, result: 'PASS' }));
