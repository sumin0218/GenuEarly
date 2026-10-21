// 중계 서버의 경계 규칙을 검사한다.
//
// 여기서 보는 것은 "누구의 요청을 받고 무엇을 돌려주는가"다.
// 실제 Jev 중계 동작은 GE-18 에서 붙이고 그때 테스트도 함께 넣는다.
import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/index'

const env: Env = {
  JEV_API_KEY: 'test-key-not-real',
  JEV_API_BASE_URL: 'https://example.invalid/v1/gateway',
  JEV_MODEL: 'jev-1.13.0',
  JEV_TIMEOUT_MS: '8000',
  MAX_REQUEST_BYTES: '65536',
}

const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://proxy.invalid${path}`, init), env)

describe('헬스 체크', () => {
  it('살아 있으면 200 과 모델 버전을 준다', async () => {
    const res = await call('/health')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, model: 'jev-1.13.0' })
  })

  it('키나 설정값을 돌려주지 않는다', async () => {
    const body = await (await call('/health')).text()
    expect(body).not.toContain(env.JEV_API_KEY)
    expect(body).not.toContain(env.JEV_API_BASE_URL)
  })
})

describe('요청 출처', () => {
  it('확장 프로그램이 아니면 거절한다', async () => {
    const res = await call('/v1/judge', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })

  it('Origin 이 없으면 거절한다', async () => {
    const res = await call('/v1/judge', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('CORS 를 * 로 열지 않는다', async () => {
    const res = await call('/v1/judge', {
      method: 'OPTIONS',
      headers: { Origin: EXT_ORIGIN },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
  })

  it('허용하지 않는 origin 에는 CORS 헤더를 주지 않는다', async () => {
    const res = await call('/v1/judge', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('그 밖', () => {
  it('없는 경로는 404', async () => {
    expect((await call('/')).status).toBe(404)
  })

  it('GET 으로 판단을 요청하면 405', async () => {
    const res = await call('/v1/judge', { method: 'GET', headers: { Origin: EXT_ORIGIN } })
    expect(res.status).toBe(405)
  })

  it('허용 origin 의 오류 응답에도 CORS 헤더가 있다', async () => {
    // 없으면 브라우저가 응답을 막아서 확장은 상태 코드 대신 Failed to fetch 만 받는다.
    for (const init of [
      { method: 'GET', headers: { Origin: EXT_ORIGIN } },
      { method: 'POST', headers: { Origin: EXT_ORIGIN } },
    ]) {
      const res = await call('/v1/judge', init)
      expect(res.status, 'OK 가 아닌 응답이어야 한다').not.toBe(200)
      expect(
        res.headers.get('Access-Control-Allow-Origin'),
        `${init.method} ${res.status} 응답에 CORS 헤더 없음`,
      ).toBe(EXT_ORIGIN)
    }
  })
})
