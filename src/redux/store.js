import { configureStore } from '@reduxjs/toolkit';
import rootReducer from './reducers';

// Create Redux store with combined reducers
const store = configureStore({
  reducer: rootReducer
});

export default store;