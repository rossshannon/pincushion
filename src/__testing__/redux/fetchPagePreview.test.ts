import { vi } from 'vitest';
import axios from 'axios';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../redux/authSlice';
import twitterCardReducer, {
  fetchPagePreview,
  setTwitterCardPreview,
} from '../../redux/twitterCardSlice';
import type { TwitterCardData } from '../../types/twitterCard';

vi.mock('axios');
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

const URL_A = 'https://example.com/a';

const pageCard: TwitterCardData = {
  url: URL_A,
  title: 'From the page',
  description: 'Page description',
  imageUrl: null,
  siteName: null,
  siteHandle: null,
  siteDomain: 'example.com',
  cardType: null,
};

const createStore = () =>
  configureStore({
    reducer: { auth: authReducer, twitterCard: twitterCardReducer },
    preloadedState: {
      auth: { user: 'ross', token: 'abc', openAiToken: '' },
    } as never,
  });

describe('fetchPagePreview', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('calls the bridge /preview route and stores the card', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { preview: { url: URL_A, title: 'Fetched' }, previewStatus: 'fresh' },
    });
    const store = createStore();
    await store.dispatch(fetchPagePreview({ url: URL_A }));

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/preview?url='),
      expect.objectContaining({ headers: { Authorization: 'Bearer ross:abc' } })
    );
    const state = store.getState().twitterCard;
    expect(state.status).toBe('succeeded');
    expect(state.card?.title).toBe('Fetched');
    expect(state.previewStatus).toBe('fresh');
  });

  it('shows the page card at once and keeps it if the bridge fails', async () => {
    let reject: (err: Error) => void = () => undefined;
    mockedAxios.get.mockReturnValueOnce(
      new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const store = createStore();
    const pending = store.dispatch(fetchPagePreview({ url: URL_A, pageCard }));

    expect(store.getState().twitterCard.status).toBe('succeeded');
    expect(store.getState().twitterCard.card?.title).toBe('From the page');

    reject(new Error('Network Error'));
    await pending;
    expect(store.getState().twitterCard.card?.title).toBe('From the page');
    expect(store.getState().twitterCard.error).toBeNull();
  });

  it('records an error when there is no page card to fall back on', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));
    const store = createStore();
    await store.dispatch(fetchPagePreview({ url: URL_A }));
    const state = store.getState().twitterCard;
    expect(state.status).toBe('failed');
    expect(state.previewError).toBe('timeout of 10000ms exceeded');
  });

  it('uses the document title only when neither the page nor the bridge had one', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { preview: { url: URL_A, title: null } } });
    const store = createStore();
    const untitled = { ...pageCard, title: null };
    const pending = store.dispatch(
      fetchPagePreview({ url: URL_A, pageCard: untitled, fallbackTitle: 'Doc title' })
    );
    expect(store.getState().twitterCard.card?.title).toBe('Doc title');
    await pending;
    expect(store.getState().twitterCard.card?.title).toBe('Doc title');
  });

  it("prefers the bridge's title over the document title", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { preview: { url: URL_A, title: 'OG title' } } });
    const store = createStore();
    await store.dispatch(
      fetchPagePreview({ url: URL_A, pageCard: { ...pageCard, title: null }, fallbackTitle: 'Doc title' })
    );
    expect(store.getState().twitterCard.card?.title).toBe('OG title');
  });

  it('skips the bridge when the page supplied a complete card', async () => {
    const store = createStore();
    await store.dispatch(
      fetchPagePreview({
        url: URL_A,
        pageCard: { ...pageCard, imageUrl: 'https://example.com/i.png', siteName: 'Ex', faviconUrl: 'https://example.com/f.ico' },
      })
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(store.getState().twitterCard.card?.title).toBe('From the page');
  });

  it('ignores a response for a URL the user has moved away from', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockedAxios.get.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    const store = createStore();
    const pending = store.dispatch(fetchPagePreview({ url: URL_A }));
    store.dispatch(
      setTwitterCardPreview({ card: null, error: null, url: 'https://example.com/b', status: 'loading' })
    );
    resolve({ data: { preview: { url: URL_A, title: 'Stale' } } });
    await pending;
    expect(store.getState().twitterCard.card).toBeNull();
    expect(store.getState().twitterCard.lastUrl).toBe('https://example.com/b');
  });
});
