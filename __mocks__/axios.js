const mockAxios = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  head: jest.fn(() => Promise.resolve({ data: {} })),
  patch: jest.fn(() => Promise.resolve({ data: {} })),
  request: jest.fn(() => Promise.resolve({ data: {} })),
  create: jest.fn(() => mockAxios),
  CancelToken: {
    source: jest.fn(() => ({ token: 'token', cancel: jest.fn() })),
  },
  defaults: { headers: { common: {} } },
  isAxiosError: jest.fn((error) => !!(error && error.isAxiosError)),
};

mockAxios.interceptors = {
  request: { use: jest.fn(), eject: jest.fn() },
  response: { use: jest.fn(), eject: jest.fn() },
};

export default mockAxios;
