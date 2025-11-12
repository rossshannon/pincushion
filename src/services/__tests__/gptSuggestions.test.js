jest.mock('openai', () => {
  const mockCreate = jest.fn();
  const ctor = jest.fn(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  ctor.__mockCreate = mockCreate;
  return ctor;
});

const mockConstructor = jest.requireMock('openai');
const mockCreate = mockConstructor.__mockCreate;

import { fetchGptTagSuggestions } from '../gptSuggestions';

beforeEach(() => {
  mockConstructor.mockClear();
  mockCreate.mockReset();
});

describe('fetchGptTagSuggestions', () => {
  it('returns empty array when no token provided', async () => {
    const result = await fetchGptTagSuggestions({ token: '', context: {} });
    expect(result).toEqual([]);
    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it('normalizes, dedupes, and underscores tokens', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '  Foo, machine learning,foo ,\nbar,baz, ',
          },
        },
      ],
    });

    const result = await fetchGptTagSuggestions({
      token: 'abc',
      context: { url: 'https://example.com' },
    });

    expect(result).toEqual(['foo', 'machine_learning', 'bar', 'baz']);
    expect(mockConstructor).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when response has no content', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '   ' } }] });
    const result = await fetchGptTagSuggestions({ token: 'abc', context: {} });
    expect(result).toEqual([]);
  });
});
