import { vi } from 'vitest';
import axios from 'axios';
import {
  verifyOpenAiToken,
  verifyPinboardCredentials,
} from '../credentialValidation';
import { PINBOARD_BRIDGE_URL } from '../pinboardApi';

const mockedAxios = axios as unknown as { get: vi.Mock };

describe('verifyPinboardCredentials', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('asks the configured bridge for the smallest authenticated call', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { update_time: 'now' } });
    await expect(
      verifyPinboardCredentials({ username: ' ross ', token: ' ABC ' })
    ).resolves.toBeUndefined();
    const [url, config] = mockedAxios.get.mock.calls[0];
    expect(url).toBe(`${PINBOARD_BRIDGE_URL}/v1/posts/update?format=json`);
    expect(config.headers.Authorization).toBe('Bearer ross:ABC');
    expect(config.timeout).toBeGreaterThan(0);
  });

  it('rejects blank credentials without a request', async () => {
    await expect(
      verifyPinboardCredentials({ username: ' ', token: 'x' })
    ).rejects.toThrow('Pinboard username and token are required.');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('maps a 401 to a rejected-credentials message', async () => {
    mockedAxios.get.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Request failed with status code 401',
      response: { status: 401 },
    });
    await expect(
      verifyPinboardCredentials({ username: 'ross', token: 'bad' })
    ).rejects.toThrow('Pinboard rejected those credentials.');
  });

  it('explains a timeout in plain words', async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' })
    );
    await expect(
      verifyPinboardCredentials({ username: 'ross', token: 'ok' })
    ).rejects.toThrow(/didn’t respond in time/);
  });

  it('passes other failures through', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(
      verifyPinboardCredentials({ username: 'ross', token: 'ok' })
    ).rejects.toThrow('Network Error');
  });
});

describe('verifyOpenAiToken', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: vi.Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock?.mockReset();
    globalThis.fetch = originalFetch;
  });

  it('returns early when token is blank', async () => {
    await expect(verifyOpenAiToken('   ')).resolves.toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('resolves when OpenAI responds with success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(''),
    });

    await expect(verifyOpenAiToken('sk-test')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer sk-test');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps 401 errors to auth failure message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: { message: 'invalid api key provided' } })
        ),
    });

    await expect(verifyOpenAiToken('sk-invalid')).rejects.toThrow(
      'OpenAI rejected that API token.'
    );
  });

  it('maps 429 errors to rate limit message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve(JSON.stringify({ error: { message: '' } })),
    });

    await expect(verifyOpenAiToken('sk-limit')).rejects.toThrow(
      'OpenAI rate limit reached. Wait a moment and try again.'
    );
  });

  it('maps network failures to connectivity message', async () => {
    fetchMock.mockRejectedValue(new Error('Network error occurred'));

    await expect(verifyOpenAiToken('sk-network')).rejects.toThrow(
      'Unable to reach OpenAI. Check your network connection and try again.'
    );
  });
});
