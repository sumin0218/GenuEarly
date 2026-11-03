// 사진이 아직 없는 자리에 **자리틀을 되살린다.**
//
// 사진을 `assets/shots/` 에 넣기만 하면 붙게 하려고 둔 것이다 — HTML 을 고치지 않는다.
// 없는 그림은 브라우저가 깨진 아이콘을 그리므로, 그때 자리틀로 바꾼다.
//
// **그림이 다 차면 이 파일은 할 일이 없다.** 그래도 지우지 않는다 — 한 장을 빼거나
// 이름을 잘못 적었을 때 화면이 깨지는 대신 자리틀이 뜬다.
//
// 스크립트가 꺼진 브라우저에서는 깨진 그림이 보인다. 자리틀을 기본으로 두고 그림을
// 숨기는 쪽이 더 안전해 보이지만, 그러면 **사진을 넣어도 안 보인다** — 그쪽이 더 나쁘다.

(() => {
  const 틀 = (img) => img.parentElement?.querySelector('.shot__frame')

  const 바꾼다 = (img) => {
    const f = 틀(img)
    if (!f) return
    img.remove()
    f.hidden = false
  }

  for (const img of document.querySelectorAll('.shot__img')) {
    // 이미 실패한 뒤에 이 코드가 돌 수 있다 (`defer` 없이 끝에 두었어도).
    // `complete` 면서 폭이 0 이면 못 받은 것이다.
    if (img.complete && img.naturalWidth === 0) 바꾼다(img)
    else img.addEventListener('error', () => 바꾼다(img), { once: true })
  }
})()
