import authReducer, { setAuth } from '../../redux/authSlice';

describe('auth slice', () => {
  const initialState = {
    user: '',
    token: '',
  };

  it('should handle initial state', () => {
    // Check the state returned by the reducer with an undefined initial state and no action
    expect(authReducer(undefined, { type: 'unknown' })).toEqual({
      user: '',
      token: '',
    });
  });

  it('should handle setAuth', () => {
    const actual = authReducer(
      initialState,
      setAuth({ user: 'testUser', token: 'testToken123' })
    );
    expect(actual.user).toEqual('testUser');
    expect(actual.token).toEqual('testToken123');
  });

  it('should handle setAuth with different values', () => {
    const previousState = { user: 'oldUser', token: 'oldToken' };
    const actual = authReducer(
      previousState,
      setAuth({ user: 'newUser', token: 'newTokenXYZ' })
    );
    expect(actual.user).toEqual('newUser');
    expect(actual.token).toEqual('newTokenXYZ');
  });
});
