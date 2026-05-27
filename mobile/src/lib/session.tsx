import React from 'react';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'acc.mobile.session.v1';

export type SessionState = {
  currentUserId: string;
  apiBaseUrl: string;
  loaded: boolean;
};

type SessionInput = Partial<Pick<SessionState, 'currentUserId' | 'apiBaseUrl'>>;

const DEFAULT_SESSION: SessionState = {
  currentUserId: '1',
  apiBaseUrl: '',
  loaded: false,
};

let sessionState: SessionState = { ...DEFAULT_SESSION };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

async function persist(next: SessionState) {
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({
      currentUserId: next.currentUserId,
      apiBaseUrl: next.apiBaseUrl,
    }),
  );
}

export function getSessionState() {
  return sessionState;
}

export function getCurrentUserId() {
  return sessionState.currentUserId;
}

export function getApiBaseUrlOverride() {
  return sessionState.apiBaseUrl.trim();
}

export async function initSession() {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      sessionState = {
        currentUserId: String(parsed.currentUserId || DEFAULT_SESSION.currentUserId),
        apiBaseUrl: String(parsed.apiBaseUrl || DEFAULT_SESSION.apiBaseUrl),
        loaded: true,
      };
    } else {
      sessionState = { ...DEFAULT_SESSION, loaded: true };
    }
  } catch {
    sessionState = { ...DEFAULT_SESSION, loaded: true };
  }
  emit();
}

export async function updateSession(input: SessionInput) {
  sessionState = {
    ...sessionState,
    currentUserId: String(input.currentUserId ?? sessionState.currentUserId ?? DEFAULT_SESSION.currentUserId),
    apiBaseUrl: String(input.apiBaseUrl ?? sessionState.apiBaseUrl ?? DEFAULT_SESSION.apiBaseUrl),
    loaded: true,
  };
  await persist(sessionState);
  emit();
}

export async function resetSession() {
  sessionState = { ...DEFAULT_SESSION, loaded: true };
  await SecureStore.deleteItemAsync(SESSION_KEY);
  emit();
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const SessionContext = React.createContext<{
  session: SessionState;
  ready: boolean;
  setCurrentUserId: (value: string) => Promise<void>;
  setApiBaseUrl: (value: string) => Promise<void>;
} | null>(null);

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const unsubscribe = subscribeSession(() => setVersion((current) => current + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!sessionState.loaded) {
      initSession().catch(() => {});
    }
  }, []);

  const value = React.useMemo(
    () => ({
      session: sessionState,
      ready: sessionState.loaded,
      setCurrentUserId: async (value: string) => {
        await updateSession({ currentUserId: value });
      },
      setApiBaseUrl: async (value: string) => {
        await updateSession({ apiBaseUrl: value });
      },
    }),
    [version],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
