import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TwitterCardData } from '../types/twitterCard';

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

export default twitterCardSlice.reducer;
