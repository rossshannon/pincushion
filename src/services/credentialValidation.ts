import axios from 'axios';

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

const looksLikeNetworkError = (message: string) =>
  includes(message, 'network') ||
  includes(message, 'fetch failed') ||
  includes(message, 'networkrequestfailed') ||
  includes(message, 'socket hang up') ||
  includes(message, 'dns') ||
  includes(message, 'offline');

const looksLikeTimeout = (message: string) =>
  includes(message, 'timeout') || includes(message, 'timed out') || includes(message, 'etimedout');

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

  if (looksUnauthorized) {
    return 'OpenAI rejected that API token.';
  }

  const looksRateLimited =
    status === 429 ||
    includes(combinedMessage, '429') ||
    includes(combinedMessage, 'rate limit');

  if (looksRateLimited) {
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

  if (looksLikeTimeout(combinedMessage) || looksLikeNetworkError(combinedMessage)) {
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
  const url = `${PINBOARD_BASE_URL}/v1/tags/get?format=json`;
  const authHeader = `Bearer ${trimmedUser}:${trimmedToken}`;
  try {
    await axios.get(url, {
      timeout: 8000,
      headers: {
        Authorization: authHeader,
      },
    });
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
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(
    () => controller.abort(),
    10_000
  );
  try {
    const response = await fetch('https://api.openai.com/v1/models/gpt-4o-mini', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '');
      let message = DEFAULT_OPENAI_ERROR;
      try {
        const payload = JSON.parse(rawBody) as { error?: { message?: string } };
        message = payload?.error?.message || message;
      } catch {
        if (rawBody.trim()) {
          message = rawBody.trim();
        }
      }

      const error = new Error(message) as ErrorWithStatus;
      error.status = response.status;
      throw error;
    }
  } catch (error) {
    throw new Error(formatOpenAiValidationError(error));
  } finally {
    clearTimeout(timeoutId);
  }
}
