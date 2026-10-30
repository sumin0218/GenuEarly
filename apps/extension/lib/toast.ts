// 기사를 다 살펴봤다고 알리는 말풍선.
//
// **`createMark` 와 같은 이유로 여기 있다** (lib/portal.ts) — 화면에 닿는 코드지만
// 검사에서 부를 수 있어야 한다. entrypoints 의 콘텐츠 스크립트는 불러오는 순간
// `defineContentScript` 가 돌아 검사에서 쓸 수 없다.
import content from '../../../packages/content/ui.ko.json'

/**
 * 다 살펴봤다고 알리는 **말풍선.**
 *
 * 배지는 오른쪽 **아래**에 조용히 떠 있다. 기사를 읽는 데 방해가 안 되는 자리지만,
 * 그래서 **못 보고 지나친다** — 확장이 일했다는 것조차 모른 채 기사를 다 읽는다.
 *
 * 그래서 끝났을 때 한 번, 오른쪽 **위**에 잠깐 띄운다. 툴바의 확장 아이콘이 있는
 * 쪽이라 "결과는 저기" 라는 말이 자연스럽게 읽힌다. 꼭지(▲)가 그쪽을 가리킨다.
 *
 * ## 여기서 결과를 말하지 않는다
 *
 * 단계 이름("주의할 신호 있음")을 넣고 싶어지는 자리인데, 넣지 않는다. 기사를 덮고
 * 뜨는 상자가 판정을 선언하면 **읽기도 전에 결론을 들이미는 것**이 된다. 배지가
 * 한 줄만 맡는 것과 같은 이유다 (`createBadge` 머리말).
 *
 * 말풍선은 "다 봤다" 와 "어디를 누르면 있다" 만 말한다.
 */
export function createToast(doc: Document = document) {
  const el = doc.createElement('div')
  el.className = 'ge-toast'
  el.setAttribute('role', 'status')
  el.hidden = true

  const text = doc.createElement('div')
  const done = doc.createElement('div')
  done.className = 'ge-toast__done'
  done.textContent = content.analyzed.done
  const hint = doc.createElement('div')
  hint.className = 'ge-toast__hint'
  hint.textContent = content.analyzed.hint
  text.append(done, hint)

  const x = doc.createElement('button')
  x.className = 'ge-toast__x'
  x.type = 'button'
  x.textContent = '✕'
  x.setAttribute('aria-label', content.analyzed.close)

  el.append(text, x)

  let timer: ReturnType<typeof setTimeout> | undefined
  const hide = (): void => {
    el.hidden = true
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  x.addEventListener('click', hide)

  return {
    el,
    hide,
    /** 띄운다. `ms` 뒤에 저절로 사라진다. */
    show(ms: number): void {
      el.hidden = false
      if (timer) clearTimeout(timer)
      timer = setTimeout(hide, ms)
    },
  }
}

/**
 * 말풍선이 떠 있는 시간(ms).
 *
 * 두 줄을 읽는 데 3초면 넉넉하고, 읽을 생각이 없는 사람에게는 그조차 길다.
 * **측정으로 정한 값이 아니다.**
 */
export const TOAST_MS = 6000
