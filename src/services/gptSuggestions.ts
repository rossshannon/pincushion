const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_CHAT_TIMEOUT_MS = 30_000;
const OPENAI_RATE_LIMIT_RETRIES = 1;
const OPENAI_RATE_LIMIT_DELAY_MS = 1_000;

type GptContext = {
  url?: string;
  title?: string;
  description?: string;
  existingTags?: string;
};

type FetchGptOptions = {
  token?: string;
  context: GptContext;
  model?: string;
  temperature?: number;
};

const BASE_SYSTEM_PROMPT =
  'Return a comma-separated list containing suggested tags to use for bookmarking a page on the web. You will be provided an URL, and sometimes a title, a description or snippet from the page, and list of existing tags.  The format of your response should be a comma-separated list, for example: spying, russia, 1980s, nuclear_war, cold_war, history. ' +
  'The tags you suggest should all be in lowercase, with no surrounding whitespace. Use underscores instead of spaces to combine words if necessary. Avoid punctuation marks. ' +
  "Think of the key concepts, people, subjects, brands, years/decades, publishers, websites, related concepts, etc. that are likely to be relevant to the page. Think of related or alternative concepts so you're not locked into a single meaning or interpretation. Don't over-emphasise the content of the description field, as this may just be a single paragraph or user comment from the page. There should be up to 14 tags, but only include ones that you are sure are relevant. Aim for at least 6. If you can't think of any tags, return an empty array. Remove any duplicate tags, or ones that are already present in the list of existing tags (the existingTags field). Finally, sort the tags and return them in ascending order of relevance.";

const RECENT_TAGS_FILTER_PROMPT =
  'You will be given a list of tags that a user has recently used when bookmarking other pages, and information about a new page they are currently viewing. Your task is to determine which of these recent tags are relevant to the current page. ' +
  'Return ONLY the tags from the recent tags list that are relevant to the current page. Do not add new tags. ' +
  'The format of your response should be a comma-separated list of the relevant tags, in lowercase. If none are relevant, return an empty string.';

type ChatCompletionRole = 'system' | 'user' | 'assistant';

type ChatCompletionMessage = {
  role: ChatCompletionRole;
  content: string;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessage[];
  max_tokens?: number;
  temperature?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    } | null;
  }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestChatCompletion = async (
  token: string,
  payload: ChatCompletionRequest
): Promise<ChatCompletionResponse> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= OPENAI_RATE_LIMIT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      controller.abort();
    }, OPENAI_CHAT_TIMEOUT_MS);

    let shouldRetry = false;

    try {
      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(
          `OpenAI request failed (${response.status} ${response.statusText}): ${errorBody}`
        );

        const hitRateLimit = response.status === 429 && attempt < OPENAI_RATE_LIMIT_RETRIES;
        if (hitRateLimit) {
          shouldRetry = true;
          lastError = error;
        } else {
          throw error;
        }
      } else {
        return (await response.json()) as ChatCompletionResponse;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (shouldRetry) {
      await sleep(OPENAI_RATE_LIMIT_DELAY_MS);
      continue;
    }
  }

  throw lastError || new Error('OpenAI request failed.');
};

export async function fetchGptTagSuggestions({
  token,
  context,
  model = 'gpt-4o-mini',
  temperature = 0.4,
}: FetchGptOptions): Promise<string[]> {
  if (!token) {
    return [];
  }

  const completion = await requestChatCompletion(token, {
    model,
    max_tokens: 250,
    temperature,
    messages: [
      { role: 'system', content: BASE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: 'Here are my inputs: ' + JSON.stringify(context),
      },
      { role: 'assistant', content: 'Here are my tag suggestions: ' },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content || '';
  if (!raw.trim()) {
    return [];
  }

  const cleaned = raw.trim().replace(/\n/g, ',').replace(/,+/g, ',');
  const tokens = cleaned
    .split(',')
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);

  return Array.from(new Set(tokens));
}

type FilterRecentTagsOptions = {
  token?: string;
  recentTags: string[];
  context: GptContext;
  model?: string;
  temperature?: number;
};

export async function filterRecentTagsForRelevance({
  token,
  recentTags,
  context,
  model = 'gpt-4o-mini',
  temperature = 0.3,
}: FilterRecentTagsOptions): Promise<string[]> {
  if (!token || recentTags.length === 0) {
    return [];
  }

  const userContent = JSON.stringify({
    recentTags,
    currentPage: context,
  });

  const completion = await requestChatCompletion(token, {
    model,
    max_tokens: 150,
    temperature,
    messages: [
      { role: 'system', content: RECENT_TAGS_FILTER_PROMPT },
      {
        role: 'user',
        content: userContent,
      },
      { role: 'assistant', content: 'Relevant tags from the recent list: ' },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content || '';
  if (!raw.trim()) {
    return [];
  }

  const cleaned = raw.trim().replace(/\n/g, ',').replace(/,+/g, ',');
  const tokens = cleaned
    .split(',')
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);

  // Only return tags that were actually in the recent tags list (case-insensitive)
  const recentTagsLower = new Set(recentTags.map((t) => t.toLowerCase()));
  const validTags = tokens.filter((tag) => recentTagsLower.has(tag));

  return Array.from(new Set(validTags));
}
