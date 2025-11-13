import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthState {
  user: string;
  token: string;
  openAiToken: string;
}

const initialState: AuthState = {
  user: '',
  token: '',
  openAiToken: '',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(state, action: PayloadAction<Partial<AuthState>>) {
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
