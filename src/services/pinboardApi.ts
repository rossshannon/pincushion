import type { AxiosRequestConfig } from 'axios';

const DEFAULT_BRIDGE_URL = 'https://pinboard-api.herokuapp.com';

const envBridgeUrl =
  typeof import.meta.env?.VITE_PINBOARD_BRIDGE_URL === 'string'
    ? import.meta.env.VITE_PINBOARD_BRIDGE_URL.trim()
    : '';

/**
 * Base URL of the pinboard-bridge proxy. Configured via VITE_PINBOARD_BRIDGE_URL
 * (see .env) so index.html can preconnect to the same host.
 */
export const PINBOARD_BRIDGE_URL = (envBridgeUrl || DEFAULT_BRIDGE_URL).replace(
  /\/+$/,
  ''
);

/**
 * Per-request timeouts. The bridge itself waits up to 30s on Pinboard, and
 * Heroku's router gives up at 30s, so anything longer than that can never
 * succeed. The lookup gates the Save button, so it gets the shortest budget
 * that still survives a cold-started dyno.
 */
export const REQUEST_TIMEOUTS_MS = {
  lookup: 20_000,
  suggest: 20_000,
  tags: 30_000,
  save: 30_000,
} as const;

export const bridgeUrl = (path: string): string =>
  `${PINBOARD_BRIDGE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const bridgeRequestConfig = (
  user: string,
  token: string,
  timeout: number
): AxiosRequestConfig => ({
  timeout,
  headers: {
    Authorization: `Bearer ${user}:${token}`,
  },
});

type ErrorLike = {
  code?: string;
  message?: string;
};

/**
 * True when the request hit the client-side timeout (axios reports it as
 * ECONNABORTED / ETIMEDOUT with a "timeout of Nms exceeded" message).
 */
export const isTimeoutError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as ErrorLike;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return true;
  }
  return (message || '').toLowerCase().includes('timeout');
};
