export default {
  create: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
};
