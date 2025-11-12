import OpenAI from 'openai';

const BASE_SYSTEM_PROMPT =
  'Return a comma-separated list containing suggested tags to use for bookmarking a page on the web. You will be provided an URL, and sometimes a title, a description or snippet from the page, and list of existing tags.  The format of your response should be a comma-separated list, for example: spying, russia, 1980s, nuclear_war, cold_war, history. ' +
  'The tags you suggest should all be in lowercase, with no surrounding whitespace. Use underscores instead of spaces to combine words if necessary. Avoid punctuation marks. ' +
  "Think of the key concepts, people, subjects, brands, years/decades, publishers, websites, related concepts, etc. that are likely to be relevant to the page. Think of related or alternative concepts so you're not locked into a single meaning or interpretation. Don't over-emphasise the content of the description field, as this may just be a single paragraph or user comment from the page. There should be up to 14 tags, but only include ones that you are sure are relevant. Aim for at least 6. If you can't think of any tags, return an empty array. Remove any duplicate tags, or ones that are already present in the list of existing tags (the existingTags field). Finally, sort the tags and return them in ascending order of relevance.";

export async function fetchGptTagSuggestions({
  token,
  context,
  model = 'gpt-4o-mini',
  temperature = 0.4,
}) {
  if (!token) {
    return [];
  }

  const openai = new OpenAI({
    apiKey: token,
    dangerouslyAllowBrowser: true,
  });

  const completion = await openai.chat.completions.create({
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
