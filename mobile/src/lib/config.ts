import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getApiBaseUrlOverride } from './session';

const LOCAL_API_BASE_URL = 'http://127.0.0.1:4000';
const DEFAULT_PUBLIC_APP_URL = 'https://acc-production-a26c.up.railway.app';
const DEFAULT_PUBLIC_API_BASE_URL = 'https://acc-production-a26c.up.railway.app';
const DEFAULT_PUBLIC_WEBAPP_URL = 'https://acc-production-a26c.up.railway.app/mini';
const MINI_WEBAPP_PATH = '/mini';

function trimUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function deriveApiBaseFromAppUrl(value?: string | null) {
  const raw = trimUrl(value);
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

export function getApiBaseUrl() {
  const sessionOverride = getApiBaseUrlOverride();
  if (sessionOverride) return sessionOverride.replace(/\/$/, '');

  const extraBase = (Constants.expoConfig?.extra as any)?.accApiBaseUrl?.trim?.();
  if (extraBase) return String(extraBase).replace(/\/$/, '');

  const env = process.env.EXPO_PUBLIC_ACC_API_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  const publicAppUrl =
    process.env.EXPO_PUBLIC_ACC_PUBLIC_URL?.trim() ||
    (Constants.expoConfig?.extra as any)?.accPublicUrl?.trim?.();
  if (publicAppUrl) return deriveApiBaseFromAppUrl(publicAppUrl);

  if (!__DEV__) return DEFAULT_PUBLIC_API_BASE_URL;

  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  if (Platform.OS === 'ios') return 'http://localhost:4000';
  return LOCAL_API_BASE_URL;
}

export function getMiniWebAppUrl() {
  const override =
    process.env.EXPO_PUBLIC_ACC_WEBAPP_URL?.trim() ||
    (Constants.expoConfig?.extra as any)?.accWebAppUrl?.trim?.() ||
    process.env.EXPO_PUBLIC_ACC_PUBLIC_URL?.trim() ||
    (Constants.expoConfig?.extra as any)?.accPublicUrl?.trim?.();
  if (override) return override.replace(/\/$/, '');
  if (!__DEV__) return DEFAULT_PUBLIC_WEBAPP_URL;
  return DEFAULT_PUBLIC_WEBAPP_URL;
}
