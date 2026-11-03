# 랜딩 페이지

<https://sumin0218.github.io/GenuEarly/>

빌드가 없다. `index.html` 과 `landing.css` 두 장이고, `main` 에 올라가면
[pages.yml](../.github/workflows/pages.yml) 이 이 폴더를 그대로 배포한다.

## 보려면

```bash
npx --yes serve landing
```

파일을 바로 열어도(`file://`) 되지만, **개발 빌드를 로드해 둔 크롬에서는 그러지 않는다** —
개발 빌드가 `file://` 권한을 받으므로 우리 확장이 이 페이지에 끼어든다.

## 고칠 때 지키는 것

**색을 새로 만들지 않는다.** `landing.css` 맨 위의 토큰은
[팝업 스타일](../apps/extension/entrypoints/popup/style.css)에서 가져온 것이고, 이름과
값이 같다. 랜딩에서 본 색과 설치하고 본 색이 다르면 같은 제품으로 보이지 않는다.

**판정 색(초록·노랑·빨강)을 장식에 쓰지 않는다.** 그 넷은 단계를 뜻한다. 단추나 머리글에
쓰면 아무 뜻 없는 자리에서 판정처럼 읽힌다
([design.test.ts](../apps/extension/tests/design.test.ts) "제품의 색이 판정의 색과 부딪히지 않는다").

**경로는 상대로 쓴다.** `/GenuEarly/` 하위에 올라가므로 `/landing.css` 는 깨진다.
`./landing.css` 로 쓴다.

**여백은 4px 배수 토큰에서 고른다.** 확장 프로그램과 같은 규칙이다.

## 스크린샷 넣기

**파일을 `assets/shots/` 에 넣으면 끝이다.** HTML 을 고치지 않는다 — 자리틀은 사진이
없을 때만 뜨고, 사진이 들어오면 저절로 자리를 비킨다 ([shots.js](shots.js)).

| 파일 이름 | 무엇을 찍나 |
| --- | --- |
| `hero-article.png` | 기사 페이지 — 배지와 본문 형광펜이 **함께** 보이게 |
| `feature-badge.png` | 배지 네 단계 (한 장에 모으거나 대표 하나) |
| `feature-highlight.png` | 본문 형광펜과 올려놓았을 때 뜨는 사유 |
| `feature-portal.png` | 뉴스 목록 — 제목 옆 표시와 오른쪽 아래 범례 |
| `feature-selection.png` | 선택 검사 결과, 또는 공유 직전 알림 |
| `feature-report.png` | 리포트 — 주변 보도를 견준 화면 |

이름이 다르면 그 자리만 자리틀로 남는다. 화면이 깨지지 않으니 하나씩 채워도 된다.

### 찍을 때

- **비율은 16:10 이다.** 창을 `1600×1000` 쯤으로 두면 잘리지 않는다. 다른 비율로
  찍어도 `object-fit: cover` 가 가운데를 남기고 자른다 — 중요한 것을 가운데 두면 된다
- **글자가 읽히게 찍는다.** 배지나 형광펜이 화면 한구석에 작게 있으면 랜딩에서는
  보이지 않는다. 필요하면 브라우저 확대를 한 단 올려 찍는다
- **다크 모드 사진은 따로 두지 않는다.** 한 장으로 양쪽에 쓴다

> **기사 본문이 읽히는 사진은 쓰지 않는다.** 실제 기사 전문을 저장소에 넣지 않는
> 규칙과 같은 이유다. [수동 테스트 자료](../eval/fixtures/manual-news/)로 찍으면
> 안전하다 — 그 글은 우리가 지어낸 것이고 공개하기로 한 것이다.

### 사진이 하나도 없어도

자리틀이 뜬다. 틀 안에 **넣을 파일 이름**이 적혀 있어서, 지금 무엇이 비어 있는지
화면만 봐도 안다.

## 처음 켤 때

저장소 설정에서 Pages 의 Source 를 **GitHub Actions** 로 둔다. 한 번만 하면 된다.

```bash
gh api repos/sumin0218/GenuEarly/pages --method POST \
  -f 'build_type=workflow' --silent
```
