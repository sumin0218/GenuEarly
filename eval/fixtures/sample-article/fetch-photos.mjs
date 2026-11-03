// 기사 사진을 Wikimedia Commons 에서 받아 온다.
//
//   node eval/fixtures/sample-article/fetch-photos.mjs
//
// **아무 사진이나 쓰지 않는다.** 이 사진은 랜딩 페이지 스크린샷에 실려 공개된다.
// 그래서 **CC0 또는 퍼블릭 도메인만** 받고, 받을 때 라이선스를 API 로 다시 확인한다.
// 확인에 실패하면 받지 않는다.
//
// Commons 가 줄여 준 900px 판을 받는다. 기사 사진 자리가 930px 라 그보다 클 필요가 없다. 원본은 4,000px 이 넘어 저장소에 무겁다.
//
// 받은 뒤에는 `photos.json` 에 출처를 적는다 — 그 파일이 곧 출처 표기다
// (docs/ai-log/sources.md 와 같은 성격).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 여기 = dirname(fileURLToPath(import.meta.url))
const UA = 'GenuEarly-fixture/0.0.0 (+https://github.com/sumin0218/GenuEarly)'
const API = 'https://commons.wikimedia.org/w/api.php'

/** 기사 id → Commons 파일 이름. 가로가 긴 것만 골랐다 (사진 자리가 16:9 다). */
const 고른것 = {
  'c-101': 'DG 廣東 Guangdong Dongguan night bus stop visitors December 2024 R12S.jpg',
  'c-102': 'Edward Street Stop 142, City by Night tour Brisbane City L1130866.jpg',
  'c-103': 'Man taking shelter from rain in Colombo.jpg',
  'c-104': 'FEL CVUT Katedra 13137 Patro 5 E.jpg',
  'c-105': '2016 USDA Farmers Market (20161021-AMS-LSC-0133).jpg',
  'c-106': 'Town Hall station Melbourne City Square entrance canopy under construction 2024.jpg',
}

/** 이것 말고는 받지 않는다. */
const 허용 = /^(CC0|Public domain|PDM)/i

async function 받기(id, 파일) {
  const u = new URL(API)
  u.search = new URLSearchParams({
    action: 'query', format: 'json', titles: `File:${파일}`,
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '900',
  }).toString()

  const res = await fetch(u, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { id, 파일, 왜: `API ${res.status}` }
  const page = Object.values((await res.json()).query?.pages ?? {})[0]
  const info = page?.imageinfo?.[0]
  if (!info) return { id, 파일, 왜: '파일을 찾지 못했다' }

  const m = info.extmetadata ?? {}
  const lic = m.LicenseShortName?.value ?? '?'
  // **여기서 막는다.** 검색 결과를 믿지 않고 받기 직전에 다시 본다.
  if (!허용.test(lic)) return { id, 파일, 왜: `라이선스가 ${lic}` }

  const bin = await fetch(info.thumburl ?? info.url, { headers: { 'User-Agent': UA } })
  if (!bin.ok) return { id, 파일, 왜: `내려받기 ${bin.status}` }
  writeFileSync(join(여기, 'photos', `${id}.jpg`), Buffer.from(await bin.arrayBuffer()))

  const 벗기기 = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return {
    id,
    file: `photos/${id}.jpg`,
    commons: `https://commons.wikimedia.org/wiki/${encodeURIComponent('File:' + 파일)}`,
    license: lic,
    author: 벗기기(m.Artist?.value) || '(표기 없음)',
    credit: 벗기기(m.Credit?.value) || '',
    title: 벗기기(m.ObjectName?.value) || 파일,
  }
}

const 된것 = []
const 안된것 = []
for (const [id, 파일] of Object.entries(고른것)) {
  const r = await 받기(id, 파일)
  if (r.왜) { 안된것.push(r); console.log('✕', id, r.왜) }
  else { 된것.push(r); console.log('✓', id, r.license, '—', r.title.slice(0, 44)) }
}

writeFileSync(
  join(여기, 'photos.json'),
  JSON.stringify({ $comment: 'Wikimedia Commons 에서 받은 사진의 출처. CC0 와 퍼블릭 도메인만 쓴다.', photos: 된것 }, null, 2) + '\n',
)
console.log(`\n받은 것 ${된것.length}장 / 못 받은 것 ${안된것.length}장`)
if (안된것.length) process.exitCode = 1
