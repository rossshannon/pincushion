import { fetchGptTagSuggestions } from '../gptSuggestions.ts';

const buildFetchResponse = (choices) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve({ choices }),
});

const buildErrorResponse = (status, statusText, body) => ({
  ok: false,
  status,
  statusText,
  text: () => Promise.resolve(body),
});

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

describe('fetchGptTagSuggestions', () => {
  it('returns empty array when no token provided', async () => {
    const result = await fetchGptTagSuggestions({ token: '', context: {} });
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('normalizes, dedupes, and underscores tokens', async () => {
    mockFetch.mockResolvedValueOnce(
      buildFetchResponse([
        {
          message: {
            content: '  Foo, machine learning,foo ,\nbar,baz, ',
          },
        },
      ])
    );

    const result = await fetchGptTagSuggestions({
      token: 'abc',
      context: { url: 'https://example.com' },
    });

    expect(result).toEqual(['foo', 'machine_learning', 'bar', 'baz']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0][1];
    expect(fetchArgs.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns empty array when response has no content', async () => {
    mockFetch.mockResolvedValueOnce(
      buildFetchResponse([{ message: { content: '   ' } }])
    );
    const result = await fetchGptTagSuggestions({ token: 'abc', context: {} });
    expect(result).toEqual([]);
  });

  it('throws when OpenAI responds with an error status', async () => {
    mockFetch.mockResolvedValueOnce(
      buildErrorResponse(500, 'Server Error', 'oops')
    );

    await expect(
      fetchGptTagSuggestions({ token: 'abc', context: {} })
    ).rejects.toThrow('OpenAI request failed (500 Server Error)');
  });

  it('retries once on rate limits before succeeding', async () => {
    mockFetch
      .mockResolvedValueOnce(
        buildErrorResponse(429, 'Too Many Requests', 'rate limited')
      )
      .mockResolvedValueOnce(
        buildFetchResponse([
          {
            message: { content: 'foo,bar' },
          },
        ])
      );

    const result = await fetchGptTagSuggestions({ token: 'abc', context: {} });

    expect(result).toEqual(['foo', 'bar']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10000);
});
