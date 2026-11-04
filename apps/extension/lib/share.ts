// ④ 공유 직전 알림. 🔴 로 판단된 기사를 남에게 넘기려는 순간에 한 번 알린다.
//
// **`createToast` 와 같은 이유로 여기 있다** (lib/toast.ts) — 화면에 닿는 코드지만
// 검사에서 부를 수 있어야 한다.
//
// ## 막지 않는다
//
// 버튼을 가리지도, 동작을 취소하지도 않는다. `preventDefault` 와 `stopPropagation`
// 을 쓰지 않는다 — 누른 것은 그대로 일어나고 우리는 옆에서 한마디 할 뿐이다
// (docs/product.md 2절 "공유를 막는다 → 알림만 띄운다").
import content from '../../../packages/content/ui.ko.json'

/**
 * 알림이 떠 있는 시간(ms).
 *
 * 말풍선(`TOAST_MS`, 6초)보다 길다. 말풍선은 "다 봤다" 는 알림이라 놓쳐도 그만이지만
 * 이것은 **사용자가 막 무언가를 하려는 순간**에 끼어드는 말이라 읽을 틈이 있어야 한다.
 * 닫기 단추도 함께 둔다.
 *
 * **측정으로 정한 값이 아니다.**
 */
export const SHARE_NOTICE_MS = 10000

/** 클릭 지점에서 위로 몇 번까지 올라가 볼 것인가. 아이콘 `<span>` 이 단추 안에 든 경우가 흔하다. */
const CLIMB = 4

/**
 * 공유 단추로 보는 영어 낱말. **낱말 단위로 맞춘다.**
 *
 * `[class*="copy"]` 처럼 품으면 바닥글의 `copyright` 가 걸린다. 아래 `tokens` 가
 * 영숫자 아닌 글자에서 끊으므로 `copyright` 는 `copyright` 한 낱말이 되어 걸리지 않고,
 * `u_cbox_copy` 는 `u`·`cbox`·`copy` 로 끊겨 걸린다.
 */
const WORDS = new Set(['share', 'sharing', 'sns', 'copy', 'copyurl', 'copylink', 'clipboard'])

/** 공유 단추로 보는 한국어. 이쪽은 품어서 본다 — 조사와 붙어 나오는 일이 많다. */
const PHRASES = ['공유', '복사', '퍼가기', '보내기']

/** 영숫자가 아닌 곳에서 끊어 소문자 낱말로 만든다. */
function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * 이 요소가 "공유·주소 복사" 를 뜻하는가.
 *
 * 사이트별 선택자를 글자 그대로 적지 않고 **단서로 본다.** 두 가지 때문이다.
 *
 *   1. 네이버·다음의 클래스 이름은 자주 바뀐다. 적어 둔 선택자는 조용히 죽고,
 *      죽은 것을 알아챌 방법이 없다 — 알림이 안 뜨는 것과 구분되지 않는다
 *   2. 틀려도 **손해가 작다.** 막지 않는 알림이고 기사당 한 번뿐이다.
 *      못 잡으면 안 뜨고, 잘못 잡으면 한 번 더 뜬다
 *
 * 글자가 많은 요소는 보지 않는다. 본문 한 문단에 "공유" 가 들어 있다고 단추가 되지 않는다.
 */
export function isShareControl(start: Element | null): boolean {
  let el: Element | null = start
  for (let i = 0; el && i < CLIMB; i += 1, el = el.parentElement) {
    const hay: string[] = [el.id, el.className, el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '']
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('data-')) hay.push(a.value)
    }
    // 짧은 글자만 본다. 단추에 적힌 말은 짧다.
    const text = (el.textContent ?? '').trim()
    if (text.length > 0 && text.length <= 20) hay.push(text)

    for (const s of hay) {
      if (!s) continue
      if (PHRASES.some((p) => s.includes(p))) return true
      if (tokens(s).some((t) => WORDS.has(t))) return true
    }
  }
  return false
}

/**
 * 공유 직전 알림 상자.
 *
 * 말풍선과 달리 **가운데 아래**에 띄운다. 오른쪽 위는 말풍선이, 오른쪽 아래는 배지가
 * 이미 쓰고 있어 겹친다. 공유 단추는 보통 기사 끝이나 머리에 있어 어느 쪽에 떠도
 * 손가락 가까이가 아니다 — 그래서 눈이 먼저 가는 가운데를 쓴다.
 */
export function createShareNotice(doc: Document = document) {
  const el = doc.createElement('div')
  el.className = 'ge-share'
  // `alert` 가 아니라 `status` 다. 읽던 것을 끊고 읽히는 말이 아니다.
  el.setAttribute('role', 'status')
  el.hidden = true

  const text = doc.createElement('div')
  text.className = 'ge-share__text'
  text.textContent = content.share.message

  const ok = doc.createElement('button')
  ok.className = 'ge-share__ok'
  ok.type = 'button'
  ok.textContent = content.share.dismiss

  el.append(text, ok)

  let timer: ReturnType<typeof setTimeout> | undefined
  const hide = (): void => {
    el.hidden = true
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  ok.addEventListener('click', hide)

  return {
    el,
    hide,
    /** 띄운다. `ms` 뒤에 저절로 사라진다. */
    show(ms: number = SHARE_NOTICE_MS): void {
      el.hidden = false
      if (timer) clearTimeout(timer)
      timer = setTimeout(hide, ms)
    },
  }
}

/**
 * 공유하려는 낌새를 듣는다. 돌려주는 함수를 부르면 듣기를 그만둔다.
 *
 * ## 무엇을 "공유" 로 보는가
 *
 * `copy` 이벤트만으로는 사람들이 실제로 쓰는 길을 거의 못 잡는다
 * (docs/requirements.md 6-1절).
 *
 * | 공유하는 길 | `copy` 가 뜨나 |
 * | --- | --- |
 * | 주소창에서 복사 | ❌ 주소창은 페이지 밖이다. **잡지 못한다 — 알려진 한계다** |
 * | 사이트의 "URL 복사" 단추 | ❌ `navigator.clipboard.writeText()` 는 `copy` 를 띄우지 않는다 |
 * | 본문에서 주소를 긁어 복사 | ✅ 드물다 |
 *
 * 그래서 **단추 클릭을 함께 듣는다.** 가운데 둘째 줄이 실제로 쓰이는 길이다.
 *
 * 둘 다 `capture` 로 듣는다. 사이트가 `stopPropagation` 을 하면 거품 단계에서는
 * 오지 않는다. **우리는 듣기만 하고 막지 않는다.**
 */
export function listenForShare(onShare: () => void, doc: Document = document): () => void {
  const onClick = (e: Event): void => {
    const t = e.target
    if (t instanceof Element && isShareControl(t)) onShare()
  }
  const onCopy = (): void => { onShare() }

  doc.addEventListener('click', onClick, true)
  doc.addEventListener('copy', onCopy, true)
  return () => {
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('copy', onCopy, true)
  }
}
