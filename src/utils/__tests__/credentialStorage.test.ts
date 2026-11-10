import { vi } from 'vitest';
import {
  getStoredCredentialValues,
  persistStoredCredentials,
  readStoredCredentials,
} from '../credentialStorage';

const STORAGE_KEY = 'pincushion.credentials';

describe('credentialStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('round-trips credentials', () => {
    expect(
      persistStoredCredentials({
        pinboardUser: 'ross',
        pinboardToken: 'ABC123',
        openAiToken: 'sk-test',
      })
    ).toBe(true);
    expect(readStoredCredentials()).toEqual({
      user: 'ross',
      token: 'ABC123',
      openAiToken: 'sk-test',
    });
    expect(getStoredCredentialValues()).toEqual({
      pinboardUser: 'ross',
      pinboardToken: 'ABC123',
      openAiToken: 'sk-test',
    });
  });

  test('reads nothing when the Pinboard half is incomplete', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pinboardUser: 'ross', pinboardToken: '' })
    );
    expect(readStoredCredentials()).toBeNull();
  });

  test.each(['not json', '"a string"', 'null', '42'])(
    'reads nothing from a corrupt entry (%s)',
    (raw) => {
      localStorage.setItem(STORAGE_KEY, raw);
      expect(readStoredCredentials()).toBeNull();
      expect(getStoredCredentialValues()).toEqual({
        pinboardUser: '',
        pinboardToken: '',
        openAiToken: '',
      });
    }
  );

  describe('when the browser blocks site data', () => {
    test('survives window.localStorage itself throwing', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      expect(readStoredCredentials()).toBeNull();
      expect(getStoredCredentialValues().pinboardUser).toBe('');
      expect(
        persistStoredCredentials({ pinboardUser: 'u', pinboardToken: 't' })
      ).toBe(false);
    });

    test('survives getItem and setItem throwing', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      expect(readStoredCredentials()).toBeNull();
      expect(
        persistStoredCredentials({ pinboardUser: 'u', pinboardToken: 't' })
      ).toBe(false);
    });
  });
});
