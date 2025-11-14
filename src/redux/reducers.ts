import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import bookmarkReducer from './bookmarkSlice';
import tagReducer from './tagSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  bookmark: bookmarkReducer,
  tags: tagReducer,
});

export default rootReducer;
