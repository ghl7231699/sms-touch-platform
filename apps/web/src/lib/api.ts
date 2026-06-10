import { getAuthToken } from './auth';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {})
    },
    ...options
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || json.error || '请求失败');
  }
  return json as T;
}
