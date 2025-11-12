import authReducer, { setAuth } from '../../redux/authSlice';

describe('auth slice', () => {
  const initialState = {
    user: '',
    token: '',
    openAiToken: '',
  };

  it('should handle initial state', () => {
    // Check the state returned by the reducer with an undefined initial state and no action
    expect(authReducer(undefined, { type: 'unknown' })).toEqual({
      user: '',
      token: '',
      openAiToken: '',
    });
  });

  it('should handle setAuth', () => {
    const actual = authReducer(
      initialState,
      setAuth({ user: 'testUser', token: 'testToken123', openAiToken: 'sk-1' })
    );
    expect(actual.user).toEqual('testUser');
    expect(actual.token).toEqual('testToken123');
    expect(actual.openAiToken).toEqual('sk-1');
  });

  it('should handle setAuth with different values', () => {
    const previousState = {
      user: 'oldUser',
      token: 'oldToken',
      openAiToken: 'sk-old',
    };
    const actual = authReducer(
      previousState,
      setAuth({ user: 'newUser', token: 'newTokenXYZ' })
    );
    expect(actual.user).toEqual('newUser');
    expect(actual.token).toEqual('newTokenXYZ');
    expect(actual.openAiToken).toEqual('sk-old');
  });
});
