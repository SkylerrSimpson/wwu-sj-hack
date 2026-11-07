import { DEFAULT_CONFIG, parseConfig, serializeConfig, type Config } from "@/lib/config";

export type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
};

const CONFIG_KEY = "vesselConfig";
const EMAIL_KEY = "alertEmail";

// Storage can throw (private mode, quota, blocked); it then reads as empty and drops writes.
const read = (storage: StorageLike, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: StorageLike, key: string, value: string): void => {
  try {
    storage.setItem(key, value);
  } catch {
    // Kept in component state only for this page view.
  }
};

export const readConfig = (storage: StorageLike): Config =>
  parseConfig(read(storage, CONFIG_KEY) ?? "") ?? DEFAULT_CONFIG;

export const writeConfig = (storage: StorageLike, config: Config): void =>
  write(storage, CONFIG_KEY, serializeConfig(config));

export const readEmail = (storage: StorageLike): string => read(storage, EMAIL_KEY) ?? "";

export const writeEmail = (storage: StorageLike, email: string): void =>
  write(storage, EMAIL_KEY, email);
