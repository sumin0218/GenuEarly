// 아이콘을 SVG 요소로 만든다. 데이터는 lib/icon-data.ts (Reicon, MIT) 에 있다.
//
// **왜 아이콘 라이브러리를 통째로 쓰지 않는가.** npm 패키지를 넣으면 2,630개가 따라오고,
// 확장 프로그램은 심사를 받는 압축 파일이라 쓰지 않는 코드가 그대로 짐이 된다.
// 쓰는 다섯 개의 path 만 추려 빌드에 넣는다 (icon-data.ts 머리말).
//
// **`innerHTML` 을 쓰지 않는다.** 아이콘 데이터는 우리가 넣은 것이라 안전하지만,
// 마크업 문자열을 DOM 에 넣는 길을 한 번 만들어 두면 다음 사람이 그 길로
// 기사 제목을 넣는다 (docs/security/secure-coding.md 4절). `createElementNS` 로 만든다.
import { ICON_DATA, type IconName } from './icon-data'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 원본이 그려진 격자. path 좌표가 전부 이 안에 있다. */
const VIEW_BOX = '0 0 24 24'

export interface IconOptions {
  /** 변의 길이(px). 본문 아이콘 14~16, 머리말 20 (taste-skill app-screens 9.4절). */
  size: number
  /** 색. 주지 않으면 글자 색을 따른다 */
  color?: string
  /** 진하게 채운 벌. 근거가 **본문까지**일 때만 쓴다 (lib/portal.ts) */
  filled?: boolean
}

/**
 * 아이콘 하나를 만든다.
 *
 * **`aria-hidden` 이다.** 아이콘 옆에는 늘 같은 뜻의 글자가 있다 — 팝업의 머리말,
 * 배지의 이름, 목록 동그라미의 `aria-label`. 아이콘까지 읽으면 같은 말을 두 번 듣는다.
 * 글자 없이 아이콘만 두는 자리를 새로 만들면 **그때는 부르는 쪽이 이름을 붙인다.**
 */
export function createIcon(doc: Document, name: IconName, opts: IconOptions): SVGSVGElement {
  const shape = ICON_DATA[name]
  // `filled` 가 없는 아이콘(돌아가는 표시)은 채우라고 해도 테두리 벌로 그린다.
  const paths = (opts.filled && 'filled' in shape ? shape.filled : shape.outline) as readonly {
    d: string
    evenodd?: boolean
    opacity?: number
  }[]

  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', VIEW_BOX)
  svg.setAttribute('width', String(opts.size))
  svg.setAttribute('height', String(opts.size))
  // 바깥은 비우고 path 만 칠한다. 원본의 규약이다.
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  // 글 흐름 안에 들어가도 줄 높이를 밀지 않는다.
  svg.style.setProperty('display', 'block')
  svg.style.setProperty('flex', '0 0 auto')

  for (const p of paths) {
    const el = doc.createElementNS(SVG_NS, 'path')
    el.setAttribute('d', p.d)
    el.setAttribute('fill', opts.color ?? 'currentColor')
    if (p.evenodd) {
      el.setAttribute('fill-rule', 'evenodd')
      el.setAttribute('clip-rule', 'evenodd')
    }
    if (p.opacity !== undefined) el.setAttribute('opacity', String(p.opacity))
    svg.append(el)
  }
  return svg
}

export type { IconName }
