import { combineReducers } from 'redux';
import authReducer from './authSlice';
import bookmarkReducer from './bookmarkSlice';
import tagReducer from './tagSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  bookmark: bookmarkReducer,
  tags: tagReducer
});

export default rootReducer;