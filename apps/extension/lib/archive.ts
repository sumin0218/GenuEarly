// 지난 리포트를 보관한다. **`storage.local` 이다 — 여기만 그렇다.**
//
// ## 왜 여기만 디스크에 남기는가
//
// 이 프로젝트는 "쌓이면 그것이 곧 열람 기록이다" 를 여러 곳에 적어 두고 테스트로도
// 박아 놓았다 (lib/cache.ts, lib/report.ts, docs/security/secure-coding.md 7절).
// 캐시는 제목을 해시로만 두고, 리포트는 브라우저를 닫으면 사라지는 session 에 둔다.
//
// 아카이브는 그 줄을 넘는다. 목록을 보여 주는 것이 목적이라 **제목과 주소를 글자
// 그대로** 들고 있어야 하고, 브라우저를 닫아도 남아야 한다.
//
// 원칙이 막으려던 것은 **사용자 모르게 자동으로 쌓이는 것**이다. 캐시는 기사를 열기만
// 해도 쌓이니 엄격해야 했다. 아카이브는 성격이 다르다 — **북마크와 같다.** 그래서
// 셋을 지키는 조건으로만 허용한다. 이 셋이 무너지면 이 파일은 열람 기록이 된다.
//
//   1. **사용자가 만든 것만 들어간다.** 기사를 열기만 해서는 한 줄도 쌓이지 않는다.
//      넣는 자리는 `buildReport` 가 끝나는 지점 하나뿐이다
//   2. **전부 보이고 전부 지워진다.** 숨긴 항목을 두지 않는다
//   3. **그래도 영원히 두지 않는다.** 개수 상한과 만료가 있고, 캐시와 같은 자리에서
//      쓸려 나간다 (entrypoints/background.ts)
//
// ## 왜 한 칸에 배열로 두는가
//
// 캐시는 기사마다 키를 따로 쓴다. 쓰는 쪽이 여럿이고 수백 건이 되기 때문이다.
// 아카이브는 스무 건이 상한이고 **늘 목록 전체를 보여 준다.** 키를 흩어 두면 목록을
// 만들 때마다 전체를 훑어야 하고, 순서와 상한을 코드가 따로 들고 있어야 한다.
// 한 칸이면 둘 다 공짜다.
import { normalizeUrl } from './cache'
import type { Report } from './report'

/** 저장소 열쇠. **`local` 이다** — 브라우저를 닫아도 남는다. */
export const ARCHIVE_KEY = 'archive'

/**
 * 보관 개수 상한. 넘으면 **오래된 것부터 밀어낸다.**
 *
 * 상한이 없으면 "지우지 않는 사용자" 에게 이 파일이 무제한 열람 기록이 된다.
 * 스물이면 한 화면에 다 보이고, 사용자가 목록을 관리할 수 있는 크기다.
 */
export const ARCHIVE_MAX = 20

/** 보관 기간. 지나면 지운다 — 사용자가 손대지 않아도 사라진다. */
export const ARCHIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 저장소에 들어가는 모양. `v` 는 나중에 모양이 바뀌어도 옛것을 알아보기 위한 것. */
interface Stored {
  v: 1
  items: Report[]
}

/**
 * 저장소를 읽는다. **"못 읽었다" 와 "비어 있다" 를 가른다.**
 *
 * 둘을 같은 값으로 돌려주면 — 처음에 그랬다 — 읽기가 실패했을 때 부르는 쪽이
 * *빈 목록* 위에 새 항목을 얹어 쓴다. **보관해 둔 스무 건이 한 번에 날아간다.**
 * 그래서 실패는 `null` 이고, 고치는 함수들은 `null` 을 보면 **쓰지 않고 물러난다.**
 *
 * 읽었는데 모양이 다른 것은 다르다. 그건 버려도 되는 쓰레기라 빈 목록으로 친다.
 */
async function read(): Promise<Stored | null> {
  try {
    const got = (await browser.storage.local.get(ARCHIVE_KEY)) as Record<string, unknown>
    const box = got[ARCHIVE_KEY] as Partial<Stored> | undefined
    // **모양이 다르면 통째로 버린다.** 반쯤 읽은 아카이브를 보여 주느니 비어 보이는 편이 낫다.
    if (!box || box.v !== 1 || !Array.isArray(box.items)) return { v: 1, items: [] }
    return { v: 1, items: box.items }
  } catch {
    return null
  }
}

/**
 * 고치는 일은 **한 줄로 세운다.**
 *
 * 보관함은 한 칸에 배열로 들어 있어서, 고치려면 읽고-바꾸고-쓴다. 둘이 겹치면
 * 나중에 읽은 쪽이 먼저 쓴 것을 모르고 덮는다 — **지운 항목이 되살아난다.**
 * 지우면 지워진다는 것은 이 파일이 디스크에 남아도 되는 세 조건 중 하나다.
 *
 * 쓰는 자리를 background 한 곳으로 모아 두고(entrypoints/background.ts 의
 * `archive-write`), 그 안에서 이 줄로 차례를 지킨다.
 */
let 차례: Promise<unknown> = Promise.resolve()
function 줄세워<T>(일: () => Promise<T>): Promise<T> {
  const 다음 = 차례.then(일, 일)
  // 앞사람이 넘어져도 뒤는 선다.
  차례 = 다음.then(
    () => undefined,
    () => undefined,
  )
  return 다음
}

async function write(items: Report[]): Promise<void> {
  try {
    await browser.storage.local.set({ [ARCHIVE_KEY]: { v: 1, items } satisfies Stored })
  } catch {
    // 저장소가 꽉 찼거나 막혔다. **흐름은 이어 간다** — 보관은 곁다리고,
    // 사용자가 지금 보고 있는 리포트는 session 에 멀쩡히 있다.
  }
}

/** 같은 기사인가. 캐시와 같은 잣대를 쓴다 — `/mnews/article/` 과 `?iid=` 를 접는다. */
function sameUrl(a: string, b: string): boolean {
  try {
    return normalizeUrl(a) === normalizeUrl(b)
  } catch {
    return a === b
  }
}

/** 만료됐나. */
const expired = (r: Report, now: number): boolean => now - r.at >= ARCHIVE_TTL_MS

/**
 * 보관된 리포트들. **새것이 앞이다.** 만료된 것은 빼고 돌려준다 —
 * 쓸어내기가 아직 안 돌았어도 사용자 눈에 보이지 않게 한다.
 */
export async function listArchive(): Promise<Report[]> {
  const now = Date.now()
  const box = await read()
  if (!box) return []
  return box.items.filter((r) => !expired(r, now)).sort((a, b) => b.at - a.at)
}

/**
 * 리포트를 보관한다. **다 된 것만 넣는다.**
 *
 * 만드는 중(`claims`·`records`·`brief`)이나 실패한 것을 넣으면 아카이브가 쓰레기통이
 * 된다. 같은 기사를 다시 조사했으면 **앞의 것을 갈아 끼운다** — 같은 기사가 두 줄로
 * 보이면 어느 것이 최신인지 사용자가 알 수 없다.
 */
export async function saveToArchive(report: Report): Promise<void> {
  if (report.stage !== 'done') return
  return 줄세워(async () => {
    const now = Date.now()
    const box = await read()
    // **못 읽었으면 쓰지 않는다.** 빈 목록 위에 얹으면 보관해 둔 것이 전부 날아간다.
    if (!box) return
    const kept = box.items.filter((r) => !expired(r, now) && !sameUrl(r.url, report.url))
    const next = [report, ...kept].sort((a, b) => b.at - a.at).slice(0, ARCHIVE_MAX)
    await write(next)
  })
}

/** 한 건을 지운다. 주소로 찾는다 — 사용자에게 보이는 목록의 단위가 기사다. */
export async function removeArchived(url: string): Promise<void> {
  return 줄세워(async () => {
    const box = await read()
    if (!box) return
    const kept = box.items.filter((r) => !sameUrl(r.url, url))
    // 마지막 한 건을 지웠으면 칸도 없앤다 — `clearArchive` 와 같은 이유다.
    if (kept.length === 0) await clearArchive()
    else await write(kept)
  })
}

/**
 * 전부 지운다. **키를 지운다 — 빈 배열을 쓰지 않는다.**
 *
 * 빈 배열을 써 두면 "지웠다" 와 "한 번도 쓴 적 없다" 가 저장소에서 구분되지 않을
 * 이유가 없는데도 칸은 남는다. 지웠으면 흔적도 없는 편이 맞다.
 */
export async function clearArchive(): Promise<void> {
  try {
    await browser.storage.local.remove(ARCHIVE_KEY)
  } catch {
    /* 못 지웠으면 다음 쓸어내기가 만료된 것부터 걷어 간다 */
  }
}

/**
 * 만료된 것을 비운다. **몇 건을 비웠는지 돌려준다.**
 *
 * 캐시의 `sweepExpired()` 와 같은 자리에서 불린다 (background). 사용자가 지우지
 * 않아도 서른 날이 지나면 사라진다 — 그것이 상한과 함께 이 파일이 영구 기록이
 * 되지 않게 막는 둘째 장치다.
 */
export async function sweepArchive(): Promise<number> {
  return 줄세워(async () => {
    const now = Date.now()
    const box = await read()
    if (!box) return 0
    const kept = box.items.filter((r) => !expired(r, now))
    if (kept.length === box.items.length) return 0
    if (kept.length === 0) {
      await clearArchive()
    } else {
      await write(kept)
    }
    return box.items.length - kept.length
  })
}
