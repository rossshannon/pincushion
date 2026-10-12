import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import axios from 'axios';
import type { TwitterCardData } from '../types/twitterCard';
import { cleanUrl } from '../utils/url';
import {
  bridgeRequestConfig,
  bridgeUrl,
  REQUEST_TIMEOUTS_MS,
} from '../services/pinboardApi';
import {
  isShowablePageCard,
  mergePreviewCards,
  parsePreviewPayload,
} from '../utils/pageMetadata';
import type { AuthState } from './authSlice';

export type TwitterCardState = {
  card: TwitterCardData | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastUrl: string | null;
  previewError: string | null;
  previewStatus: string | null;
};

export const initialTwitterCardState: TwitterCardState = {
  card: null,
  status: 'idle',
  error: null,
  lastUrl: null,
  previewError: null,
  previewStatus: null,
};

const twitterCardSlice = createSlice({
  name: 'twitterCard',
  initialState: initialTwitterCardState,
  reducers: {
    clearTwitterCard(state) {
      state.card = null;
      state.error = null;
      state.status = 'idle';
      state.lastUrl = null;
      state.previewError = null;
      state.previewStatus = null;
    },
    setTwitterCardPreview(
      state,
      action: PayloadAction<{
        card: TwitterCardData | null;
        error: string | null;
        url: string | null;
        status?: TwitterCardState['status'];
        previewStatus?: string | null;
        previewError?: string | null;
      }>
    ) {
      const { card, error, url, status } = action.payload;
      state.card = card;
      state.error = error;
      state.previewError =
        action.payload.previewError !== undefined
          ? action.payload.previewError
          : error;
      state.lastUrl = url;
      state.previewStatus = action.payload.previewStatus ?? null;
      if (status) {
        state.status = status;
      } else if (card) {
        state.status = 'succeeded';
      } else if (error) {
        state.status = 'failed';
      } else {
        state.status = 'idle';
      }
    },
  },
});

export const { clearTwitterCard, setTwitterCardPreview } =
  twitterCardSlice.actions;

type PreviewThunkState = {
  auth: AuthState;
  twitterCard: TwitterCardState;
};

type FetchPagePreviewArgs = {
  url: string;
  /** Metadata the bookmarklet read off the page, shown at once if present. */
  pageCard?: TwitterCardData | null;
  /** The document <title>, used only when nothing better is known. */
  fallbackTitle?: string | null;
};

/**
 * Fetch the page preview from the bridge's /preview route. When the
 * bookmarklet supplied the page's own metadata, that card shows straight
 * away and the bridge's result only fills in what it lacked.
 */
let latestPreviewToken = 0;

export const fetchPagePreview = createAsyncThunk<
  void,
  FetchPagePreviewArgs,
  { state: PreviewThunkState }
>('twitterCard/fetchPagePreview', async ({ url, pageCard = null, fallbackTitle = null }, { getState, dispatch }) => {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return;
  // Only the latest request may update the card: after A → B → A, or
  // clearing and re-entering a URL, an older response for the same URL
  // must not overwrite the newer one.
  const previewToken = ++latestPreviewToken;
  const showPage = isShowablePageCard(pageCard);
  const withTitle = (card: TwitterCardData | null): TwitterCardData | null =>
    card && !card.title && fallbackTitle ? { ...card, title: fallbackTitle } : card;

  dispatch(
    setTwitterCardPreview(
      showPage
        ? { card: withTitle(pageCard), error: null, url: trimmedUrl, status: 'succeeded', previewStatus: 'page', previewError: null }
        : { card: null, error: null, url: trimmedUrl, status: 'loading', previewStatus: null, previewError: null }
    )
  );

  const {
    auth: { user, token },
  } = getState();
  // Ignore a response for a URL the user has since moved away from.
  const stillCurrent = () =>
    previewToken === latestPreviewToken && getState().twitterCard.lastUrl === trimmedUrl;

  try {
    const response = await axios.get(
      bridgeUrl(`/preview?url=${cleanUrl(trimmedUrl)}`),
      bridgeRequestConfig(user, token, REQUEST_TIMEOUTS_MS.preview)
    );
    if (!stillCurrent()) return;
    const fetched = parsePreviewPayload(response.data?.preview, trimmedUrl);
    const previewError =
      typeof response.data?.previewError === 'string' ? response.data.previewError : null;
    const previewStatus =
      typeof response.data?.previewStatus === 'string' ? response.data.previewStatus : null;
    dispatch(
      setTwitterCardPreview({
        card: withTitle(mergePreviewCards(pageCard, fetched)),
        error: null,
        url: trimmedUrl,
        previewStatus: showPage ? 'page' : previewStatus,
        previewError: showPage ? null : previewError,
      })
    );
  } catch (err) {
    if (!stillCurrent()) return;
    if (pageCard) {
      // The bridge failed, but the page said something: show that.
      dispatch(
        setTwitterCardPreview({ card: withTitle(pageCard), error: null, url: trimmedUrl, previewStatus: 'page', previewError: null })
      );
      return;
    }
    const message = err instanceof Error ? err.message : 'Unable to fetch page preview';
    dispatch(
      setTwitterCardPreview({
        card: null,
        error: message,
        // Keep the URL so a sibling request for it can still land.
        url: trimmedUrl,
        previewStatus: 'error',
        previewError: message,
      })
    );
  }
});

export default twitterCardSlice.reducer;
