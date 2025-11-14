import axios from 'axios';
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from 'openai';

type ErrorWithStatus = Error & { status?: number };

const isErrorWithStatus = (error: unknown): error is ErrorWithStatus =>
  error instanceof Error &&
  Object.prototype.hasOwnProperty.call(error, 'status') &&
  typeof (error as { status?: unknown }).status === 'number';

const DEFAULT_OPENAI_ERROR =
  'Unable to verify OpenAI token. Check your API key and network connection.';

const normalizeMessage = (message: string | undefined) => {
  if (!message) {
    return '';
  }
  return message.replace(/^undefined\s+/i, '').trim();
};

const includes = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

const formatOpenAiValidationError = (error: unknown): string => {
  const status =
    (isErrorWithStatus(error) && error.status) ||
    (error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: number }).status)
      : undefined);

  const rawMessage =
    error instanceof Error ? normalizeMessage(error.message) : '';
  const cause =
    error instanceof Error && typeof (error as { cause?: unknown }).cause !== 'undefined'
      ? (error as { cause?: unknown }).cause
      : undefined;

  const causeMessage =
    cause instanceof Error ? normalizeMessage(cause.message) : '';
  const combinedMessage = [rawMessage, causeMessage]
    .filter(Boolean)
    .join(' | ');

  const looksUnauthorized =
    status === 401 ||
    includes(combinedMessage, '401') ||
    includes(combinedMessage, 'unauthorized') ||
    includes(combinedMessage, 'invalid api key');

  if (error instanceof AuthenticationError || looksUnauthorized) {
    return 'OpenAI rejected that API token.';
  }

  const looksRateLimited =
    status === 429 ||
    includes(combinedMessage, '429') ||
    includes(combinedMessage, 'rate limit');

  if (error instanceof RateLimitError || looksRateLimited) {
    return 'OpenAI rate limit reached. Wait a moment and try again.';
  }

  const looksCorsFailure =
    includes(combinedMessage, 'cors') ||
    includes(combinedMessage, 'failed to fetch') ||
    includes(combinedMessage, 'access-control-allow-origin') ||
    includes(combinedMessage, 'net::err_failed');

  if (looksCorsFailure) {
    return 'Browser blocked OpenAI\'s response (CORS). This typically means the API rejected the token; double-check the key and try again.';
  }

  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return 'Unable to reach OpenAI. Check your network connection and try again.';
  }

  if (rawMessage) {
    return rawMessage;
  }

  return DEFAULT_OPENAI_ERROR;
};

const PINBOARD_BASE_URL = 'https://pinboard-api.herokuapp.com';

type PinboardCredentialInput = {
  username: string;
  token: string;
};

export async function verifyPinboardCredentials({
  username,
  token,
}: PinboardCredentialInput): Promise<void> {
  const trimmedUser = username.trim();
  const trimmedToken = token.trim();
  if (!trimmedUser || !trimmedToken) {
    throw new Error('Pinboard username and token are required.');
  }
  const authToken = encodeURIComponent(`${trimmedUser}:${trimmedToken}`);
  const url = `${PINBOARD_BASE_URL}/tags/get?format=json&auth_token=${authToken}`;
  try {
    await axios.get(url, { timeout: 8000 });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error('Pinboard rejected those credentials.');
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Unable to verify Pinboard credentials.'
    );
  }
}

export async function verifyOpenAiToken(openAiToken: string): Promise<void> {
  const trimmedToken = (openAiToken || '').trim();
  if (!trimmedToken) {
    return;
  }
  const client = new OpenAI({
    apiKey: trimmedToken,
    dangerouslyAllowBrowser: true,
  });
  try {
    await client.models.retrieve('gpt-4o-mini');
  } catch (error) {
    throw new Error(formatOpenAiValidationError(error));
  }
}
