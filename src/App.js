import BookmarkForm from './components/BookmarkForm';
import './styles/popup.css';

import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setAuth } from './redux/authSlice';
import { setFormData, fetchBookmarkDetails } from './redux/bookmarkSlice';
import {
  fetchTags,
  fetchSuggestedTags,
  fetchGptSuggestions,
  setTagCounts,
  resetGptSuggestions,
} from './redux/tagSlice';
import { enforceMinimumPopupSize } from './utils/popupAffordances';

const TAG_CACHE_TTL_MS = 10000;
const TAG_REFRESH_DELAY_MS = 10000;

function App() {
  const dispatch = useDispatch();
  const { formData, initialLoading } = useSelector((state) => state.bookmark);
  const { user, token, openAiToken } = useSelector((state) => state.auth);
  const {
    gptStatus,
    gptContextKey,
    suggested,
    suggestedStatus,
  } = useSelector((state) => state.tags);
  const { url, title, description, tags } = formData;
  const normalizedTagString = Array.isArray(tags) ? tags.join(' ') : '';
  const lastLookupUrlRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      enforceMinimumPopupSize(window);
    } catch (_err) {
      // Ignore resize errors in restricted environments.
    }
  }, []);
  useEffect(() => {
    // Parse URL parameters for auth and initial form data
    const params = new URLSearchParams(window.location.search);
    const user = params.get('user') || '';
    const token = params.get('token') || '';
    const openAi = params.get('openai_token') || '';
    if (!openAi) {
      console.info(
        '[Pincushion] No OpenAI token provided; GPT suggestions will be skipped.'
      );
    }
    dispatch(setAuth({ user, token, openAiToken: openAi }));
    // Initial bookmark form values
    const urlParam = params.get('url') || '';
    const titleParam = params.get('title') || '';
    const descParam = params.get('description') || '';
    const privateParam = params.get('private') === 'true';
    const toreadParam = params.get('toread') === 'true';
    dispatch(
      setFormData({
        url: urlParam,
        title: titleParam,
        description: descParam,
        private: privateParam,
        toread: toreadParam,
      })
    );
    // Only load tags/suggestions if we have auth credentials
    if (user && token) {
      let tagRefreshTimer;
      // Load cached user tags from localStorage
      let shouldFetchTagsImmediately = true;
      let nextFetchDelay = TAG_REFRESH_DELAY_MS;
      try {
        const cached = localStorage.getItem('tags');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (typeof parsed === 'object' && parsed !== null) {
            dispatch(setTagCounts(parsed));
            const timestampRaw = localStorage.getItem('tagTimestamp');
            const timestamp = timestampRaw ? parseInt(timestampRaw, 10) : 0;
            const age = timestamp ? Date.now() - timestamp : Number.POSITIVE_INFINITY;
            if (age < TAG_CACHE_TTL_MS) {
              shouldFetchTagsImmediately = false;
              nextFetchDelay = Math.max(TAG_CACHE_TTL_MS - age, 0);
            }
          }
        }
      } catch (_e) {
        // Intentionally empty: Failed to load tags from cache, will fetch later.
      }

      if (shouldFetchTagsImmediately) {
        dispatch(fetchTags());
      }

      tagRefreshTimer = setTimeout(() => dispatch(fetchTags()), nextFetchDelay);

      // Add ESC key listener
      const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
          window.close();
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      // Cleanup listener on unmount
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (tagRefreshTimer) {
          clearTimeout(tagRefreshTimer);
        }
      };
    }
  }, [dispatch]);

  useEffect(() => {
    if (!user || !token) return;
    if (!url) return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    if (lastLookupUrlRef.current === trimmedUrl) return;
    lastLookupUrlRef.current = trimmedUrl;
    dispatch(fetchBookmarkDetails(trimmedUrl));
    dispatch(fetchSuggestedTags());
  }, [dispatch, user, token, url]);

  const initialTagSignatureRef = useRef(null);
  const previousUrlRef = useRef(null);

  useEffect(() => {
    initialTagSignatureRef.current = null;
  }, [url]);

  useEffect(() => {
    if (previousUrlRef.current !== null && previousUrlRef.current !== url) {
      dispatch(resetGptSuggestions());
    }
    previousUrlRef.current = url;
  }, [dispatch, url]);

  useEffect(() => {
    if (!openAiToken) return;
    if (!url) return;
    if (initialLoading) return;
    const pinboardReady =
      suggestedStatus === 'succeeded' || suggestedStatus === 'failed';
    if (!pinboardReady) return;

    let existingTagsSnapshot = initialTagSignatureRef.current;
    if (existingTagsSnapshot === null) {
      existingTagsSnapshot =
        typeof normalizedTagString === 'string' ? normalizedTagString : '';
      initialTagSignatureRef.current = existingTagsSnapshot;
    }

    const contextKey = JSON.stringify({
      url,
      title,
      description,
      existingTags: existingTagsSnapshot,
    });

    if (gptContextKey === contextKey) return;
    if (gptStatus === 'loading') return;

    dispatch(
      fetchGptSuggestions({
        contextKey,
        context: {
          url,
          title,
          description,
          existingTags: existingTagsSnapshot,
        },
      })
    );
  }, [
    dispatch,
    url,
    title,
    description,
    normalizedTagString,
    openAiToken,
    initialLoading,
    gptStatus,
    gptContextKey,
    suggested,
    suggestedStatus,
  ]);
  return (
    <div className="pincushion-popup" data-testid="app-container">
      <BookmarkForm />

      <footer>
        <div id="pinboard-link">
          Powered by <a href="https://pinboard.in/">Pinboard</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
