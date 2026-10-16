// 확장 프로그램이 끼어드는 페이지 목록. **여기가 원본이다.**
//
// wxt.config.ts 의 host_permissions 와 entrypoints/*.ts 의 matches 가
// 이 상수를 함께 쓴다. 두 곳에 따로 적으면 반드시 어긋난다.
//
// MV3 에서 content_scripts 의 matches 는 그 자체로 해당 사이트 접근 권한이고
// 설치할 때 경고 문구에도 뜬다. host_permissions 만 줄여도 소용없다.
// 권한 표의 원본은 docs/security/secure-coding.md 2절이다.

/**
 * 기사 본문 페이지. 배지(기능 ①)가 뜨는 곳이다.
 *
 * 네이버 기사 본문은 news.naver.com 이 아니라 n.news.naver.com/article/… 에 있다.
 * news.naver.com 에는 목록·섹션 페이지만 있다.
 */
export const ARTICLE_MATCHES = [
  'https://n.news.naver.com/article/*',
  'https://v.daum.net/v/*',
] as const

// TODO(GE-23): 포털 목록 일괄 검사를 붙일 때 목록 페이지를 여기에 추가한다.
//   네이버 목록: https://news.naver.com/section/*
//   지금은 쓰지 않으므로 권한을 받지 않는다. 쓰는 기능이 생길 때 받는다.

/** manifest 의 host_permissions 에 들어가는 값. */
export const HOST_PERMISSIONS = [...ARTICLE_MATCHES]
