import { getAuthToken } from './auth';

export class ApiError extends Error {
  status: number;
  code?: string;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}

function emitAppEvent(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  emitAppEvent('app:loading-start', { path });
  try {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {})
      },
      ...options
    });
    const contentType = response.headers.get('content-type') || '';
    const json = contentType.includes('application/json') ? await response.json() : {};
    if (!response.ok) {
      const payload = json as { message?: string; error?: string; code?: string };
      const message = payload.message || payload.error || '请求失败';
      const error = new ApiError(message, response.status, json, payload.code);
      if (response.status === 403) {
        emitAppEvent('app:forbidden', { path, message, code: payload.code });
      }
      throw error;
    }
    return json as T;
  } finally {
    emitAppEvent('app:loading-end', { path });
  }
}

function fileNameFromDisposition(disposition: string | null) {
  if (!disposition) return undefined;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const quoted = disposition.match(/filename="([^"]+)"/i)?.[1];
  if (quoted) return decodeURIComponent(quoted);
  const plain = disposition.match(/filename=([^;]+)/i)?.[1];
  return plain ? decodeURIComponent(plain.trim()) : undefined;
}

export async function downloadApi(path: string, options?: RequestInit): Promise<{ blob: Blob; fileName?: string }> {
  const token = getAuthToken();
  emitAppEvent('app:loading-start', { path });
  try {
    const response = await fetch(path, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {})
      },
      ...options
    });
    if (!response.ok) {
      let payload: { message?: string; error?: string; code?: string } = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }
      const message = payload.message || payload.error || '下载失败';
      const error = new ApiError(message, response.status, payload, payload.code);
      if (response.status === 403) {
        emitAppEvent('app:forbidden', { path, message, code: payload.code });
      }
      throw error;
    }
    return {
      blob: await response.blob(),
      fileName: fileNameFromDisposition(response.headers.get('content-disposition'))
    };
  } finally {
    emitAppEvent('app:loading-end', { path });
  }
}
