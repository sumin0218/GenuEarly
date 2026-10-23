// 규칙 파일의 버전 = 그 파일이 마지막으로 바뀐 커밋. 고친 채 커밋하지 않았으면 '-dirty' 를 붙인다.
// manifest 와 수집 파일에 적어, 해시가 달라졌을 때 기사가 고쳐진 것인지 규칙이 바뀐 것인지 가른다.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function rev(url) {
  const path = fileURLToPath(url)
  const hash = execSync(`git log -1 --format=%h -- "${path}"`).toString().trim()
  if (!hash) return 'uncommitted'
  const dirty = execSync(`git status --porcelain -- "${path}"`).toString().trim() !== ''
  return dirty ? `${hash}-dirty` : hash
}
export const CLEANER = new URL('./clean.mjs', import.meta.url)
export const SPLITTER = new URL('../experiments/sentence-batching/split.mjs', import.meta.url)
export const label = (name, url) => `${name}@${rev(url)}`
