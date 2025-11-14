import axios from 'axios';
import OpenAI from 'openai';

type ErrorWithStatus = Error & { status?: number };

const isErrorWithStatus = (error: unknown): error is ErrorWithStatus =>
  error instanceof Error &&
  Object.prototype.hasOwnProperty.call(error, 'status') &&
  typeof (error as { status?: unknown }).status === 'number';

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
    if (isErrorWithStatus(error) && error.status === 401) {
      throw new Error('OpenAI rejected that API token.');
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to verify OpenAI token. Check your API key and network connection.';
    throw new Error(message);
  }
}
