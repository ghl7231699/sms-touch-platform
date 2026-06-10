import React, { useEffect, useState } from 'react';
import type { AuthUser } from '../types';

const ACCESS_DATA_KEY = 'accessData';
const TOKEN_KEY = 'sms_auth_token';

export function normalizePermissionList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw) {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function getAccessData(): (AuthUser & { uid?: string; permissionList?: string[] }) | null {
  const data = window.localStorage.getItem(ACCESS_DATA_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setAccessData(user: AuthUser) {
  window.localStorage.setItem(ACCESS_DATA_KEY, JSON.stringify({
    ...user,
    uid: user.id,
    permissionList: user.permissions
  }));
}

export function removeAccessData() {
  window.localStorage.removeItem(ACCESS_DATA_KEY);
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function removeAuthToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function requireAuth(authKey?: string) {
  if (!authKey) return true;
  if (authKey === 'overview:dashboard:base') return true;
  const accessData = getAccessData();
  const permissionList = normalizePermissionList(accessData?.permissionList || accessData?.permissions);
  return permissionList.includes('*') || permissionList.includes(authKey);
}

export default function useAuth(parentKey?: string) {
  const [prefix, setPrefix] = useState<string | undefined>();

  useEffect(() => {
    setPrefix(parentKey);
  }, [parentKey]);

  const hasAuth = (key: string) => {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    return requireAuth(fullKey);
  };

  const hasParentAuth = (key: string) => {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    const accessData = getAccessData();
    const permissionList = normalizePermissionList(accessData?.permissionList || accessData?.permissions);
    return permissionList.includes('*') || permissionList.some((item) => item.startsWith(fullKey));
  };

  return { hasAuth, hasParentAuth };
}

export function AuthC({ authKey, children }: { authKey: string; children: React.ReactNode }) {
  return requireAuth(authKey) ? children : null;
}
