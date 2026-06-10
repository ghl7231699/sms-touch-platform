import type { AppMenuItem } from '../constants/menus';
import { requireAuth } from './auth';

export interface ResolvedMenuItem extends AppMenuItem {
  fullKey: string;
  children?: ResolvedMenuItem[];
}

export function resolveMenus(items: AppMenuItem[], parentKey?: string): ResolvedMenuItem[] {
  return items.map((item) => {
    const currentKey = parentKey ? `${parentKey}:${item.key}` : item.key;
    const fullKey = item.buttons?.length ? `${currentKey}:base` : currentKey;
    return {
      ...item,
      fullKey,
      children: item.children ? resolveMenus(item.children, currentKey) : undefined
    };
  });
}

export function flattenMenus(items: ResolvedMenuItem[]): ResolvedMenuItem[] {
  return items.flatMap((item) => item.children?.length ? flattenMenus(item.children) : [item]);
}

export function getFirstAccessiblePath(items: ResolvedMenuItem[]) {
  return flattenMenus(items).find((item) => canAccessMenu(item))?.path || '/overview/dashboard';
}

export function canAccessMenu(item: ResolvedMenuItem) {
  if (item.authDisabled) return true;
  return requireAuth(item.fullKey) || requireAuth(parentKeyOf(item.fullKey));
}

export function canShowMenu(item: ResolvedMenuItem): boolean {
  if (item.hidden) return false;
  if (item.children?.length) return item.children.some(canShowMenu);
  return canAccessMenu(item);
}

export function filterAuthorizedMenus(items: ResolvedMenuItem[]): ResolvedMenuItem[] {
  return items
    .map((item) => ({
      ...item,
      children: item.children ? filterAuthorizedMenus(item.children) : undefined
    }))
    .filter(canShowMenu);
}

export function permissionKey(parentKey: string, key: string) {
  return `${parentKey}:${key}`;
}

function parentKeyOf(fullKey: string) {
  const parts = fullKey.split(':');
  parts.pop();
  return parts.join(':');
}
