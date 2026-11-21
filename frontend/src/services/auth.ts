/** Supabase-backed accounts. In mock mode this uses a local demo user so the UI stays testable offline. */

import { API_BASE_URL, USE_MOCK_API } from '../config/rules';

const TOKEN_KEY = 'ecotrace.access_token';
const MOCK_USER_KEY = 'ecotrace.mock_user';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName?: string;
}

export interface AuthResult extends AuthUser {
  readonly accessToken: string;
}

const isBrowser = () => typeof window !== 'undefined';

export function getToken(): string | null {
  return isBrowser() ? window.localStorage.getItem(TOKEN_KEY) : null;
}

function storeToken(token: string): void {
  if (isBrowser()) window.localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  if (isBrowser()) window.localStorage.removeItem(TOKEN_KEY);
}

function mockUser(): AuthUser | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(MOCK_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

async function request(path: string, body: unknown, token?: string): Promise<AuthResult | AuthUser> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method: path === '/auth/me' ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Authentication failed.');
  return data as unknown as AuthResult | AuthUser;
}

export async function signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
  if (USE_MOCK_API) {
    const user: AuthUser = {
      id: `mock-${Date.now().toString(36)}`,
      email,
      fullName: fullName || undefined,
    };
    if (isBrowser()) window.localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
    storeToken('mock-token');
    return { ...user, accessToken: 'mock-token' };
  }
  const result = await request('/auth/signup', { email, password, fullName }) as AuthResult;
  storeToken(result.accessToken);
  return result;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (USE_MOCK_API) {
    const user: AuthUser = { id: 'mock-demo-user', email, fullName: email.split('@')[0] };
    if (isBrowser()) window.localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
    storeToken('mock-token');
    return { ...user, accessToken: 'mock-token' };
  }
  const result = await request('/auth/login', { email, password }) as AuthResult;
  storeToken(result.accessToken);
  return result;
}

export async function getMe(): Promise<AuthUser | null> {
  if (USE_MOCK_API) return mockUser();
  const token = getToken();
  if (!token) return null;
  try {
    return await request('/auth/me', undefined, token) as AuthUser;
  } catch {
    clearToken();
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (!USE_MOCK_API) {
    const token = getToken();
    if (token) {
      try {
        await request('/auth/signout', {}, token);
      } catch {
        // Clear locally even if the server call fails.
      }
    }
  }
  clearToken();
  if (isBrowser()) window.localStorage.removeItem(MOCK_USER_KEY);
}
