/** Supabase-backed accounts. Auth always uses the real backend — mock mode only affects civic data. */

import { API_BASE_URL } from '../config/rules';

const TOKEN_KEY = 'ecotrace.access_token';
const USER_ID_KEY = 'ecotrace.user_id';

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

export function getCurrentUserId(): string | null {
  return isBrowser() ? window.localStorage.getItem(USER_ID_KEY) : null;
}

function storeToken(token: string): void {
  if (isBrowser()) window.localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  if (isBrowser()) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
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
  const result = await request('/auth/signup', { email, password, fullName }) as AuthResult;
  storeToken(result.accessToken);
  if (isBrowser() && result.id) window.localStorage.setItem(USER_ID_KEY, result.id);
  return result;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const result = await request('/auth/login', { email, password }) as AuthResult;
  storeToken(result.accessToken);
  if (isBrowser() && result.id) window.localStorage.setItem(USER_ID_KEY, result.id);
  return result;
}

export async function getMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const user = await request('/auth/me', undefined, token) as AuthUser;
    if (isBrowser() && user?.id) window.localStorage.setItem(USER_ID_KEY, user.id);
    return user;
  } catch {
    clearToken();
    return null;
  }
}

export async function signOut(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await request('/auth/signout', {}, token);
    } catch {
      // Clear locally even if the server call fails.
    }
  }
  clearToken();
}
