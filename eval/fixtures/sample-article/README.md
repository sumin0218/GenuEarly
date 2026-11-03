# testJournal — 스크린샷용 가짜 언론사

랜딩 페이지([../../../landing/](../../../landing/))에 올릴 사진을 찍으려고 만든 자료다.
**언론사도, 지명도, 인물도, 사건도 전부 지어낸 것이다.**

## 왜 따로 있나

실제 기사로 찍을 수 없다. 특정 매체의 기사에 🔴 주의 배지가 붙은 사진을 공개 페이지에
올리면 **그 기사를 지목해 평가하는 것**이 된다 — 제품이 하지 않기로 한 일이다
([../../../docs/product.md](../../../docs/product.md) 2절).

[manual-news](../manual-news/)도 가짜지만 그쪽은 **실존 인물 이름을 차용한 분류**가
있고, 겉모습이 시험용 틀이라 언론사처럼 보이지 않는다. 랜딩에는 **실제 기사 화면처럼
보이되 아무도 지목하지 않는** 것이 필요하다.

## 만드는 법

```bash
node eval/fixtures/sample-article/build.mjs
```

[articles.mjs](articles.mjs)의 자료로 목록 1장과 기사 6장을 찍어 낸다.
**생성물도 커밋한다** — 사진을 찍으려고 매번 빌드하지 않아도 되게.

## 보는 법

```bash
npx --yes serve eval/fixtures/sample-article
```

파일을 바로 열어도(`file://`) 된다. 둘 다 개발 빌드가 권한을 받는 자리다.

| 주소 | 무엇 | 어느 사진에 쓰나 |
| --- | --- | --- |
| `index.html` | 사회 섹션 **목록** | `feature-portal.png` (② 제목 옆 표시와 범례) |
| `c-101.html` | 야간버스 — 신호 여럿 | `hero-article.png`, `feature-highlight.png`, `feature-badge.png` |
| `c-103.html` | 폭우 — 낚시성 제목·확산 암시 | 배지 🟡 쪽 |
| `c-105.html` | 적발 — 감정 표현·이름 없는 출처 | `feature-selection.png` (드래그 검사) |
| `c-102.html` `c-104.html` `c-106.html` | 출처가 또렷한 담담한 기사 | 🟢 가 나오는 쪽 |

기사 페이지의 **공유·주소 복사 단추**가 ④ 공유 직전 알림을 띄운다
(`feature-selection.png` 에 함께 담을 수 있다).

## 고칠 때 지켜야 하는 것 셋

어기면 확장 프로그램이 이 자료를 못 읽는다.

1. **기사 파일 이름은 `c-1NN.html`.** 목록이 기사 링크를 그 모양으로 가려낸다
   ([match-patterns.ts](../../../apps/extension/match-patterns.ts)의 `FIXTURE_ARTICLE`)
2. **본문은 `article#article` 안의 `h1#headline` 과 `#body`**
   ([extract.ts](../../../apps/extension/lib/extract.ts)의 `FIXTURE_RULE`)
3. **`<title>` 은 `[테스트용]` 으로 시작.** 목록에서 ②가 그것을 보고 자료 페이지로
   판단한다 ([fixture.ts](../../../apps/extension/lib/fixture.ts))

그리고 **실존 인물 이름을 쓰지 않는다.** 이 사진은 공개 페이지에 실린다.

## 신호를 심어 둔 곳

`articles.mjs` 의 주석에 기사마다 적어 두었다. 셋에는 신호를 심었고 셋에는 심지 않았다 —
**목록 사진에 색이 갈려 보여야** 하기 때문이다. 모두 빨갛거나 모두 초록이면 ②가 무엇을
하는지 사진으로 알 수 없다.

> 심은 신호가 **그대로 판정으로 나온다는 보장은 없다.** 판단은 Jev 가 한다.
> 신호를 심는 것은 "이런 글이면 걸릴 법하다" 까지다.
