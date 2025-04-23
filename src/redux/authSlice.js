import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: '',
  token: ''
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(state, action) {
      const { user, token } = action.payload;
      state.user = user;
      state.token = token;
    }
  }
});

export const { setAuth } = authSlice.actions;
export default authSlice.reducer;