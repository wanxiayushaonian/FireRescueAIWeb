'use client';
// 命令面板:Ctrl/Cmd+K 唤出的统一命令入口(dumb 组件)。
// 只负责渲染 + 键盘导航;命令构造、异步查询由父组件提供 items,便于扩展新命令/查询源。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  group: string; // 分组标题(地址/单位/动作)
  run: () => void;
}

interface Props {
  open: boolean;
  query: string;
  items: PaletteItem[];
  loading?: boolean;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

export default function CommandPalette({ open, query, items, loading, onQueryChange, onClose }: Props) {
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦输入 + 重置选中
  useEffect(() => {
    if (open) {
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 列表变化 → 选中回顶
  useEffect(() => setSelected(0), [items]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[selected]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  // 按 group 分段(保留传入顺序)
  const segments = items.reduce<{ group: string; items: PaletteItem[] }[]>((acc, it) => {
    const last = acc[acc.length - 1];
    if (last && last.group === it.group) last.items.push(it);
    else acc.push({ group: it.group, items: [it] });
    return acc;
  }, []);

  let flatIdx = 0;

  return (
    <div className="absolute inset-0 z-[700] flex items-start justify-center bg-black/30" onClick={onClose}>
      <div
        className="mt-[12vh] w-[480px] max-w-[92vw] overflow-hidden rounded-lg border border-line bg-bg-panel/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-text-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入命令或地址(如:乐盈广场 / 卫星 / 清空路线)"
            className="flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
          {loading && <span className="shrink-0 text-[11px] text-text-3">查询中…</span>}
          <button onClick={onClose} className="shrink-0 rounded p-0.5 text-text-3 hover:bg-white/10 hover:text-text-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-[360px] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-text-3">
              {query ? '无匹配命令或地址' : '开始输入以查询地址或执行命令'}
            </div>
          ) : (
            segments.map((seg) => (
              <div key={seg.group}>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-text-3">{seg.group}</div>
                {seg.items.map((it) => {
                  const myIdx = flatIdx++;
                  const Icon = it.icon;
                  const active = myIdx === selected;
                  return (
                    <button
                      key={it.id}
                      onMouseEnter={() => setSelected(myIdx)}
                      onClick={() => it.run()}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                        active ? 'bg-cyan/10 text-text-1' : 'text-text-2 hover:bg-white/5'
                      }`}
                    >
                      {Icon && (
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: active ? '#22d3ee' : undefined }} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px]">{it.title}</span>
                        {it.subtitle && <span className="block truncate text-[10px] text-text-3">{it.subtitle}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-line px-3 py-1.5 text-[10px] text-text-3">
          ↑↓ 选择 · Enter 执行 · ESC 关闭 · Ctrl+K 切换
        </div>
      </div>
    </div>
  );
}
