import {
  PINBOARD_BRIDGE_URL,
  bridgeUrl,
  bridgeRequestConfig,
  isTimeoutError,
  REQUEST_TIMEOUTS_MS,
} from '../pinboardApi';

describe('pinboardApi', () => {
  it('builds URLs against the configured bridge without doubling slashes', () => {
    expect(PINBOARD_BRIDGE_URL.endsWith('/')).toBe(false);
    expect(bridgeUrl('/v1/tags/get')).toBe(`${PINBOARD_BRIDGE_URL}/v1/tags/get`);
    expect(bridgeUrl('v1/tags/get')).toBe(`${PINBOARD_BRIDGE_URL}/v1/tags/get`);
  });

  it('attaches the bearer header and a timeout to every request', () => {
    expect(bridgeRequestConfig('ross', 'TOKEN', REQUEST_TIMEOUTS_MS.lookup)).toEqual({
      timeout: 20_000,
      headers: { Authorization: 'Bearer ross:TOKEN' },
    });
  });

  it('never allows a client timeout longer than the bridge’s own 30s budget', () => {
    Object.values(REQUEST_TIMEOUTS_MS).forEach((timeout) => {
      expect(timeout).toBeLessThanOrEqual(30_000);
    });
  });

  it('recognises axios timeouts but not ordinary network or HTTP errors', () => {
    expect(isTimeoutError(Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' }))).toBe(true);
    expect(isTimeoutError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTimeoutError(new Error('Network Error'))).toBe(false);
    expect(isTimeoutError(new Error('Request failed with status code 500'))).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});
