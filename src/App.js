import BookmarkForm from './components/BookmarkForm';
import './styles/popup.css';

import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setAuth } from './redux/authSlice';
import { setFormData, fetchBookmarkDetails } from './redux/bookmarkSlice';
import { fetchTags, fetchSuggestedTags, setTagCounts } from './redux/tagSlice';

const TAG_CACHE_TTL_MS = 10000;
const TAG_REFRESH_DELAY_MS = 10000;

function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    // Parse URL parameters for auth and initial form data
    const params = new URLSearchParams(window.location.search);
    const user = params.get('user') || '';
    const token = params.get('token') || '';
    dispatch(setAuth({ user, token }));
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
      // Check if bookmark exists
      if (urlParam) {
        dispatch(fetchBookmarkDetails());
        dispatch(fetchSuggestedTags());
      }
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
