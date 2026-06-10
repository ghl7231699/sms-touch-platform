import { useMemo } from 'react';
import { menus, type AppMenuItem, type PermissionButton } from '../constants/menus';

interface AuthNode {
  key: string;
  title: string;
  disabled?: boolean;
  children?: AuthNode[];
}

function buttonNodes(buttons: PermissionButton[] = [], parentKey: string): AuthNode[] {
  return buttons.map((button) => {
    const key = `${parentKey}:${button.key}`;
    return {
      key,
      title: button.title,
      disabled: button.authDisabled,
      children: button.buttons ? buttonNodes(button.buttons, key) : undefined
    };
  });
}

function menuNode(item: AppMenuItem, parentKey?: string): AuthNode | null {
  if (item.hidden) return null;
  const key = parentKey ? `${parentKey}:${item.key}` : item.key;
  const children = [
    ...(item.children || []).map((child) => menuNode(child, key)).filter(Boolean) as AuthNode[],
    ...buttonNodes(item.buttons, key)
  ];
  return {
    key,
    title: item.title,
    disabled: item.authDisabled,
    children
  };
}

function collectKeys(node: AuthNode): string[] {
  return [node.key, ...(node.children || []).flatMap(collectKeys)];
}

function hasCheckedDescendant(node: AuthNode, checked: Set<string>) {
  return collectKeys(node).some((key) => checked.has(key));
}

function AuthTreeNode({
  node,
  checked,
  disabled,
  onToggle,
  depth = 0
}: {
  node: AuthNode;
  checked: Set<string>;
  disabled?: boolean;
  onToggle: (node: AuthNode, checked: boolean) => void;
  depth?: number;
}) {
  const childKeys = (node.children || []).flatMap(collectKeys);
  const allChildrenChecked = childKeys.length > 0 && childKeys.every((key) => checked.has(key));
  const selfChecked = checked.has(node.key) || allChildrenChecked;
  const partial = !selfChecked && (node.children || []).some((child) => hasCheckedDescendant(child, checked));
  const inputDisabled = disabled || node.disabled;

  return (
    <div className="authTreeNode">
      <label className={`authTreeLabel depth${Math.min(depth, 3)}`}>
        <input
          type="checkbox"
          checked={selfChecked}
          ref={(input) => {
            if (input) input.indeterminate = partial;
          }}
          disabled={inputDisabled}
          onChange={(event) => onToggle(node, event.target.checked)}
        />
        <span>{node.title}</span>
        <code>{node.key}</code>
      </label>
      {node.children?.length ? (
        <div className="authTreeChildren">
          {node.children.map((child) => (
            <AuthTreeNode key={child.key} node={child} checked={checked} disabled={disabled} onToggle={onToggle} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AuthTree({
  checkedKeys,
  onCheck,
  disabled
}: {
  checkedKeys: string[];
  onCheck: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const treeData = useMemo(() => menus.map((item) => menuNode(item)).filter(Boolean) as AuthNode[], []);
  const normalizedCheckedKeys = useMemo(() => {
    if (!checkedKeys.includes('*')) return checkedKeys;
    return treeData.flatMap(collectKeys);
  }, [checkedKeys, treeData]);
  const checked = useMemo(() => new Set(normalizedCheckedKeys), [normalizedCheckedKeys]);

  function handleToggle(node: AuthNode, nextChecked: boolean) {
    const next = new Set(normalizedCheckedKeys);
    for (const key of collectKeys(node)) {
      if (nextChecked) next.add(key);
      else next.delete(key);
    }
    next.add('overview:dashboard:base');
    onCheck([...next]);
  }

  return (
    <div className="authTree">
      {treeData.map((node) => (
        <AuthTreeNode key={node.key} node={node} checked={checked} disabled={disabled} onToggle={handleToggle} />
      ))}
    </div>
  );
}
