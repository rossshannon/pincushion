const create = jest.fn(() => ({
  start: jest.fn(),
  stop: jest.fn(),
}));
const stopAll = jest.fn();
const bind = jest.fn();

module.exports = {
  __esModule: true,
  create,
  stopAll,
  bind,
  default: {
    create,
    stopAll,
    bind,
  },
};
