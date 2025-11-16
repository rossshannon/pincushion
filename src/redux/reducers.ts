import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import bookmarkReducer from './bookmarkSlice';
import tagReducer from './tagSlice';
import twitterCardReducer from './twitterCardSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  bookmark: bookmarkReducer,
  tags: tagReducer,
  twitterCard: twitterCardReducer,
});

export default rootReducer;
