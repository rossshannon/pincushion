import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: '',
  token: '',
  openAiToken: '',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(state, action) {
      const { user, token, openAiToken } = action.payload;
      if (typeof user !== 'undefined') {
        state.user = user;
      }
      if (typeof token !== 'undefined') {
        state.token = token;
      }
      if (typeof openAiToken !== 'undefined') {
        state.openAiToken = openAiToken;
      }
    }
  }
});

export const { setAuth } = authSlice.actions;
export default authSlice.reducer;
