import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import BookmarkForm from './components/BookmarkForm';
import TwitterCardPreview from './components/TwitterCardPreview';
import './styles/popup.css';
import { setAuth } from './redux/authSlice';
import { setFormData, fetchBookmarkDetails } from './redux/bookmarkSlice';
import {
  fetchTags,
  fetchSuggestedTags,
  fetchGptSuggestions,
  setTagCounts,
  resetGptSuggestions,
  setRecentTags,
} from './redux/tagSlice';
import { enforceMinimumPopupSize } from './utils/popupAffordances';
import { getRecentTags } from './utils/recentTagStorage';
import { readTagCache } from './utils/tagCache';
import Settings from './components/Settings';
import { clearTwitterCard } from './redux/twitterCardSlice';
import {
  readStoredCredentials,
  persistStoredCredentials,
  type CredentialRecord,
} from './utils/credentialStorage';
import type { AppDispatch, RootState } from './redux/store';

/**
 * How long the cached /tags/get payload is trusted before a background
 * refresh. Saving a bookmark patches the cache locally, so a long TTL costs
 * nothing in freshness for the user's own tags; it just avoids re-downloading
 * the full tag list (hundreds of KB for a big account) on every popup.
 */
const TAG_CACHE_TTL_MS = 60 * 60 * 1000;
/**
 * Pinboard asks for at least three seconds between API calls per user. The
 * background tag refresh waits this long after the popup's critical lookups
 * have settled so it never competes with them.
 */
const TAG_REFRESH_GAP_MS = 3000;
type TagRefreshPlan = 'none' | 'immediate' | 'after-lookups';
const VIEW_FORM = 'form' as const;
const VIEW_SETTINGS = 'settings' as const;
type ViewMode = typeof VIEW_FORM | typeof VIEW_SETTINGS;
type SettingsFormValues = Required<CredentialRecord>;
const URL_DEBOUNCE_MS = 500;
const LOCALHOST_PATTERN = /^(localhost|\d{1,3}(\.\d{1,3}){3})$/i;

type InitialParams = {
  url: string;
  title: string;
  description: string;
  private: boolean;
  toread: boolean;
};

const readInitialParams = (): InitialParams => {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  return {
    url: params.get('url') || '',
    title: params.get('title') || '',
    description: params.get('description') || '',
    private: params.get('private') === 'true',
    toread: params.get('toread') === 'true',
  };
};

const isLikelyCompleteUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    let hostname = parsed.hostname || '';
    if (!hostname) return false;
    hostname = hostname.replace(/\.$/, '');
    if (!hostname) return false;
    if (LOCALHOST_PATTERN.test(hostname)) return true;
    if (!hostname.includes('.')) return false;
    const segments = hostname.split('.').filter(Boolean);
    if (segments.length < 2) return false;
    const tld = segments.pop() || '';
    if (tld.length < 2) return false;
    return true;
  } catch (_err) {
    return false;
  }
};

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
  const [debouncedUrl, setDebouncedUrl] = useState('');
  // The URL that has had fetchBookmarkDetails dispatched for it. Kept in
  // state (not a ref) so the GPT effect re-evaluates once the lookup starts.
  const [lookupStartedFor, setLookupStartedFor] = useState<string | null>(null);
  const [tagRefreshPlan, setTagRefreshPlan] = useState<TagRefreshPlan>('none');
  const urlDebounceTimerRef = useRef<number | null>(null);
  // The URL the bookmarklet opened us with. It is looked up straight away;
  // the debounce only applies to URLs the user types afterwards.
  const pendingInitialUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      enforceMinimumPopupSize(window);
    } catch (_err) {
      // Ignore resize errors in restricted environments.
    }
  }, []);

  // One-time hydration: credentials from localStorage, form values from the
  // bookmarklet's query string. This must not re-run when credentials change
  // (e.g. after saving Settings) or it would wipe the user's edits.
  useEffect(() => {
    const storedCredentials = readStoredCredentials();
    if (storedCredentials) {
      dispatch(setAuth(storedCredentials));
      setCredentialsMissing(false);
    } else {
      setCredentialsMissing(true);
    }
    const initial = readInitialParams();
    pendingInitialUrlRef.current = initial.url.trim() || null;
    dispatch(setFormData(initial));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch]);

  // Load the cached tag list for autocomplete and decide whether (and when)
  // to refresh it from Pinboard.
  useEffect(() => {
    if (!user || !token) return;
    const cached = readTagCache(user);
    if (cached) {
      dispatch(setTagCounts(cached.counts));
    }

    try {
      const recentTags = getRecentTags();
      if (recentTags.length > 0) {
        dispatch(setRecentTags(recentTags));
      }
    } catch {
      // Intentionally empty: Failed to load recent tags from cache.
    }

    if (!cached) {
      // Nothing to autocomplete from: fetch now, even at the cost of
      // overlapping the bookmark lookup. This only happens on first use.
      setTagRefreshPlan('immediate');
    } else if (cached.ageMs >= TAG_CACHE_TTL_MS) {
      setTagRefreshPlan('after-lookups');
    } else {
      setTagRefreshPlan('none');
    }
  }, [dispatch, user, token]);

  // Background tag refresh. A stale cache is refreshed only once the
  // bookmark lookup and suggestions have settled, plus a short gap, so the
  // large /tags/get download never delays what the user is waiting on.
  useEffect(() => {
    if (tagRefreshPlan === 'none' || !user || !token) return;
    const lookupsInFlight = initialLoading || suggestedStatus === 'loading';
    if (tagRefreshPlan === 'after-lookups' && lookupsInFlight) return;
    const delay = tagRefreshPlan === 'immediate' ? 0 : TAG_REFRESH_GAP_MS;
    const timer = window.setTimeout(() => {
      setTagRefreshPlan('none');
      dispatch(fetchTags());
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [dispatch, tagRefreshPlan, user, token, initialLoading, suggestedStatus]);

  useEffect(() => {
    if (urlDebounceTimerRef.current !== null) {
      window.clearTimeout(urlDebounceTimerRef.current);
      urlDebounceTimerRef.current = null;
    }
    const trimmedUrl = url?.trim() ?? '';
    if (!trimmedUrl) {
      setDebouncedUrl('');
      dispatch(clearTwitterCard());
      return;
    }
    if (!isLikelyCompleteUrl(trimmedUrl)) {
      setDebouncedUrl('');
      dispatch(clearTwitterCard());
      return;
    }
    if (
      pendingInitialUrlRef.current !== null &&
      trimmedUrl === pendingInitialUrlRef.current
    ) {
      // The bookmarklet gave us this URL: no need to wait for typing to stop.
      pendingInitialUrlRef.current = null;
      setDebouncedUrl(trimmedUrl);
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedUrl(trimmedUrl);
      urlDebounceTimerRef.current = null;
    }, URL_DEBOUNCE_MS);
    urlDebounceTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
    };
  }, [dispatch, url]);

  useEffect(() => {
    if (!user || !token) return;
    if (!debouncedUrl) return;
    if (lastLookupUrlRef.current === debouncedUrl) return;
    lastLookupUrlRef.current = debouncedUrl;
    setLookupStartedFor(debouncedUrl);
    dispatch(fetchBookmarkDetails(debouncedUrl));
    dispatch(fetchSuggestedTags());
  }, [dispatch, user, token, debouncedUrl]);

  const initialTagSignatureRef = useRef<string | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  useEffect(() => {
    initialTagSignatureRef.current = null;
  }, [debouncedUrl]);

  useEffect(() => {
    if (previousUrlRef.current !== null && previousUrlRef.current !== debouncedUrl) {
      dispatch(resetGptSuggestions());
    }
    previousUrlRef.current = debouncedUrl;
  }, [dispatch, debouncedUrl]);

  useEffect(() => {
    if (!openAiToken) return;
    if (!debouncedUrl) return;
    // Wait for the existing-bookmark lookup (it supplies the tags, title and
    // notes that form the prompt), but not for Pinboard's own suggestions:
    // those include a page scrape that can take several seconds and the GPT
    // request doesn't depend on them.
    if (lookupStartedFor !== debouncedUrl) return;
    if (initialLoading) return;

    let existingTagsSnapshot = initialTagSignatureRef.current;
    if (existingTagsSnapshot === null) {
      existingTagsSnapshot = normalizedTagString;
      initialTagSignatureRef.current = existingTagsSnapshot;
    }
    const tagsSnapshot = existingTagsSnapshot ?? '';

    const contextKey = JSON.stringify({
      url: debouncedUrl,
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
          url: debouncedUrl,
          title,
          description,
          existingTags: tagsSnapshot,
        },
      })
    );
  }, [
    dispatch,
    debouncedUrl,
    title,
    description,
    normalizedTagString,
    openAiToken,
    initialLoading,
    lookupStartedFor,
    gptStatus,
    gptContextKey,
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
        <TwitterCardPreview />
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
