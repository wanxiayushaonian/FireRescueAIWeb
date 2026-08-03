'use client';

import { useEffect, useState } from 'react';

const KEY_ITEMS = [
  { key: 'w', label: 'W', sub: '前进' },
  { key: 'a', label: 'A', sub: '左移' },
  { key: 's', label: 'S', sub: '后退' },
  { key: 'd', label: 'D', sub: '右移' },
  { key: 'e', label: 'E', sub: '上升' },
  { key: 'q', label: 'Q', sub: '下降' },
  { key: 'r', label: 'R', sub: '重置视角' },
  { key: 'shift', label: '⇧', sub: '按住减速' },
];

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/**
 * 屏幕按键提示条：按下 W/A/S/D/E/Q/R 时对应键帽高亮，松开恢复。
 * enabled 由「设置」开关控制；resetEnabled 关闭时隐藏 R 键帽。
 */
export function KeyHintOverlay({ enabled, resetEnabled }: { enabled: boolean; resetEnabled: boolean }) {
  // 按下顺序（最近按下在前），仅高亮第一个，实现「每次只显示一个」
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (KEY_ITEMS.some((item) => item.key === key)) {
        setOrder((prev) => [key, ...prev.filter((k) => k !== key)]);
      }    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase();
      setOrder((prev) => {
        if (!prev.includes(key)) return prev;
        return prev.filter((k) => k !== key);
      });
    };
    const onBlur = (): void => setOrder([]);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);

  if (!enabled) return null;

  const activeKey = order[0] ?? null;
  // 只显示最近按下的那一个键；R 在重置关闭时不显示
  const item = activeKey ? KEY_ITEMS.find((k) => k.key === activeKey && (k.key !== 'r' || resetEnabled)) : undefined;
  if (!item) return null;

  return (
    <div className="keyHint" aria-hidden>
      <div className="keyHint-key is-pressed">
        <span className="keyHint-cap">{item.label}</span>
        <span className="keyHint-sub">{item.sub}</span>
      </div>
    </div>
  );
}
