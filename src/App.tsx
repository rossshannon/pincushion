import BookmarkForm from './components/BookmarkForm';
import './styles/popup.css';

import React, { useEffect, useRef, useState } from 'react';
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
import Settings from './components/Settings';
import {
  readStoredCredentials,
  persistStoredCredentials,
  type CredentialRecord,
} from './utils/credentialStorage';
import type { AppDispatch, RootState } from './redux/store';

const TAG_CACHE_TTL_MS = 10000;
const TAG_REFRESH_DELAY_MS = 10000;
const VIEW_FORM = 'form' as const;
const VIEW_SETTINGS = 'settings' as const;
type ViewMode = typeof VIEW_FORM | typeof VIEW_SETTINGS;
type SettingsFormValues = Required<CredentialRecord>;

function App() {
  const dispatch = useDispatch<AppDispatch>();
  const { formData, initialLoading } = useSelector(
    (state: RootState) => state.bookmark
  );
  const { user, token, openAiToken } = useSelector(
    (state: RootState) => state.auth
  );
  const { gptStatus, gptContextKey, suggestedStatus } = useSelector(
    (state: RootState) => state.tags
  );
  const { url, title, description, tags } = formData;
  const normalizedTagString = tags.join(' ');
  const lastLookupUrlRef = useRef<string | null>(null);
  const [view, setView] = useState<ViewMode>(VIEW_FORM);
  const [credentialsMissing, setCredentialsMissing] = useState(false);
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
    const storedCredentials = readStoredCredentials();
    if (storedCredentials) {
      if (
        storedCredentials.user !== user ||
        storedCredentials.token !== token ||
        storedCredentials.openAiToken !== openAiToken
      ) {
        dispatch(setAuth(storedCredentials));
      }
      setCredentialsMissing(false);
    } else {
      setCredentialsMissing(true);
    }
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
      let tagRefreshTimer: number | null = null;
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

      tagRefreshTimer = window.setTimeout(
        () => dispatch(fetchTags()),
        nextFetchDelay
      );

      // Add ESC key listener
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          window.close();
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      // Cleanup listener on unmount
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (tagRefreshTimer !== null) {
          window.clearTimeout(tagRefreshTimer);
        }
      };
    }
  }, [dispatch, user, token, openAiToken]);

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

  const initialTagSignatureRef = useRef<string | null>(null);
  const previousUrlRef = useRef<string | null>(null);

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
      existingTagsSnapshot = normalizedTagString;
      initialTagSignatureRef.current = existingTagsSnapshot;
    }
    const tagsSnapshot = existingTagsSnapshot ?? '';

    const contextKey = JSON.stringify({
      url,
      title,
      description,
      existingTags: tagsSnapshot,
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
          existingTags: tagsSnapshot,
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
    suggestedStatus,
  ]);

  const handleSettingsSave = (creds: SettingsFormValues): void => {
    persistStoredCredentials(creds);
    dispatch(
      setAuth({
        user: creds.pinboardUser,
        token: creds.pinboardToken,
        openAiToken: creds.openAiToken,
      })
    );
    setCredentialsMissing(false);
    setView(VIEW_FORM);
  };

  const handleSettingsCancel = (): void => {
    setView(VIEW_FORM);
  };

  const shouldShowSettingsPrompt = credentialsMissing && view === VIEW_FORM;

  const renderMainContent = (): React.ReactNode => {
    if (view === VIEW_SETTINGS) {
      return (
        <Settings
          initialValues={{
            pinboardUser: user,
            pinboardToken: token,
            openAiToken,
          }}
          onSave={handleSettingsSave}
          onCancel={handleSettingsCancel}
        />
      );
    }

    return (
      <>
        {shouldShowSettingsPrompt && (
          <div className="settings-banner" role="alert">
            Please open Settings (⚙︎) to enter your Pinboard credentials.
          </div>
        )}
        <BookmarkForm />
      </>
    );
  };
  return (
    <div className="pincushion-popup" data-testid="app-container">
      {renderMainContent()}

      <footer>
        <div id="pinboard-link">
          Powered by <a href="https://pinboard.in/">Pinboard</a>
        </div>
        {view !== VIEW_SETTINGS && (
          <button
            type="button"
            className="settings-button"
            onClick={() => setView(VIEW_SETTINGS)}
            aria-pressed="false"
            title="Configure your Pinboard and OpenAI access tokens."
          >
            <span className="settings-button__icon" aria-hidden="true">
              ⚙︎
            </span>
            Settings
          </button>
        )}
      </footer>
    </div>
  );
}

export default App;
