# 문서

| 문서 | 내용 |
| --- | --- |
| [product.md](product.md) | 무엇을 왜 만드는가. 기능, 판단 항목, 배지 단계. **판단 기준의 원본** |
| [requirements.md](requirements.md) | 화면에서 무엇이 어떻게 보이고 움직이는가. **구현 전에 읽는다** |
| [jev.md](jev.md) | Jev 1.13의 한계·요금·한도와 거기서 나온 설계 규칙. 공식 문서에서 확인한 사실만 |
| [conventions/code-style.md](conventions/code-style.md) | 네이밍, 디렉터리 경계, 상수 관리, 테스트 |
| [security/secure-coding.md](security/secure-coding.md) | 시큐어 코딩 규칙. **코드 작성 전 필독.** 확장 프로그램 권한 표 포함 |
| [ai-log/](ai-log/) | AI 활용 과정 기록. 대회 **서식4** 증빙. 파일이 서식4의 6단계와 일치한다 |
| [ai-log/sources.md](ai-log/sources.md) | 출처·권리·라이선스 목록. 서식4의 두 번째 표 |
| [submission/](submission/) | 제출 서류 5종, 일정, 서식3·4 분량 제한 |

## 어떤 순서로 읽나

- **처음 합류했다면**: [../README.md](../README.md) → [../AGENT.md](../AGENT.md) → [../CONTRIBUTING.md](../CONTRIBUTING.md) → [product.md](product.md)
- **코드를 쓰기 전에**: [security/secure-coding.md](security/secure-coding.md) → [conventions/code-style.md](conventions/code-style.md)
- **기능을 구현하기 전에**: [product.md](product.md) → [requirements.md](requirements.md)
- **판단 기준이나 프롬프트를 건드리기 전에**: [jev.md](jev.md) → [product.md](product.md) → [../eval/README.md](../eval/README.md)

## 디렉터리

```text
docs/
  product.md       제품 정의와 판단 기준
  jev.md           Jev 1.13 정리
  conventions/     코드 컨벤션
  security/        보안 규칙
  ai-log/          AI 활용 기록 (대회 서식4 증빙)
  submission/      제출 서류
```

## 문서를 고칠 때

- **코드 변경으로 권한, 판단 기준, 보내는 데이터, 사용자 문구가 달라지면 같은 PR에서 문서도 고친다.** 나중에 몰아서 고치지 않는다.
- 문서끼리 같은 내용을 두 번 적지 않는다. 원본을 정하고 나머지는 링크한다.

| 내용 | 원본 |
| --- | --- |
| 판단 항목과 배지 단계 | [product.md](product.md) |
| 화면 동작과 상태 | [requirements.md](requirements.md) |
| Jev의 한계와 한도 | [jev.md](jev.md) |
| 확장 프로그램 권한 | [security/secure-coding.md](security/secure-coding.md) 2절 |
| 커밋·브랜치·PR·Jira | [../CONTRIBUTING.md](../CONTRIBUTING.md) |

> 문서의 최종 수정일과 작성자는 `git log <파일경로>`로 확인한다. 문서 안에 손으로 적으면 곧 틀린다.
> 예외는 [jev.md](jev.md)다. 외부 문서를 옮긴 것이라 **언제 기준의 사실인지**가 내용의 일부다.
