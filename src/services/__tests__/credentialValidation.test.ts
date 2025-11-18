import { verifyOpenAiToken } from '../credentialValidation';

describe('verifyOpenAiToken', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
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
