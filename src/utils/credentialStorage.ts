import { getLocalStorage, readStorageItem } from './safeStorage';

const STORAGE_KEY = 'pincushion.credentials';

export type CredentialRecord = {
  pinboardUser: string;
  pinboardToken: string;
  openAiToken?: string;
};

export type StoredCredentials = {
  user: string;
  token: string;
  openAiToken: string;
};

const safeParse = (raw: string | null): CredentialRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as CredentialRecord;
  } catch {
    return null;
  }
};

export const readStoredCredentials = (): StoredCredentials | null => {
  const parsed = safeParse(readStorageItem(STORAGE_KEY));
  if (!parsed) {
    return null;
  }
  const { pinboardUser = '', pinboardToken = '', openAiToken = '' } = parsed;
  if (!pinboardUser || !pinboardToken) {
    return null;
  }
  return {
    user: pinboardUser,
    token: pinboardToken,
    openAiToken: openAiToken || '',
  };
};

export const persistStoredCredentials = ({
  pinboardUser,
  pinboardToken,
  openAiToken,
}: CredentialRecord): boolean => {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    const payload: CredentialRecord = {
      pinboardUser,
      pinboardToken,
      openAiToken: openAiToken || '',
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

export const getStoredCredentialValues = (): CredentialRecord => {
  const parsed = safeParse(readStorageItem(STORAGE_KEY));
  return {
    pinboardUser: parsed?.pinboardUser || '',
    pinboardToken: parsed?.pinboardToken || '',
    openAiToken: parsed?.openAiToken || '',
  };
};
