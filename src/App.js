import BookmarkForm from './components/BookmarkForm';
import TagAutocomplete from './components/TagAutocomplete';
import TagSuggestions from './components/TagSuggestions';
import './styles/popup.css';

import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setAuth } from './redux/authSlice';
import { setFormData, fetchBookmarkDetails } from './redux/bookmarkSlice';
import { fetchTags, fetchSuggestedTags, setAllTags } from './redux/tagSlice';

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
      // Check if bookmark exists
      if (urlParam) {
        dispatch(fetchBookmarkDetails());
        dispatch(fetchSuggestedTags());
      }
      // Load cached user tags from localStorage
      try {
        const cached = localStorage.getItem('tags');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            dispatch(setAllTags(parsed));
          }
        }
      } catch (_e) {}
      // Refresh tags via API after delay
      const TAG_CACHE_DELAY = 10000; // ms
      const timer = setTimeout(() => dispatch(fetchTags()), TAG_CACHE_DELAY);

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
        // Also clear existing timeout
        clearTimeout(timer);
      };
    }
  }, [dispatch]);
  return (
    <div className="pincushion-popup" data-testid="app-container">
      <BookmarkForm />
      <TagAutocomplete />
      <TagSuggestions />

      <footer>
        <div id="pinboard-link">
          Powered by <a href="https://pinboard.in/">Pinboard</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
