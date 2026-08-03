'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { pickFreeCorner, refreshPanelRegistry, registerPanel, unregisterPanel } from '@/lib/panels';

type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
type Position = { x: number; y: number };

const DRAG_THRESHOLD = 5;
const CORNER: Record<Corner, CSSProperties> = {
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
};
const CORNER_CANDIDATES = Object.keys(CORNER) as Corner[];
const PANEL_LAYOUT_PREFIX = 'jarvis:ustudio:panel-layout:';

function readSavedPanel(name: string): { open?: boolean; corner?: Corner; pos?: Position | null } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PANEL_LAYOUT_PREFIX + name);
    return raw ? (JSON.parse(raw) as { open?: boolean; corner?: Corner; pos?: Position | null }) : {};
  } catch {
    return {};
  }
}

function writeSavedPanel(name: string, value: { open: boolean; corner: Corner; pos: Position | null }): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PANEL_LAYOUT_PREFIX + name, JSON.stringify(value));
  } catch {
    // ignore storage quota/privacy errors
  }
}

type DragState = {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  width: number;
  height: number;
  moved: boolean;
};

function clampPosition(position: Position, width: number, height: number): Position {
  if (typeof window === 'undefined') return position;
  return {
    x: Math.min(Math.max(0, position.x), Math.max(0, window.innerWidth - width)),
    y: Math.min(Math.max(0, position.y), Math.max(0, window.innerHeight - height)),
  };
}

/**
 * 可定位 / 可拖动 / 可被运行期浮窗 agent 调起的「面板壳」。
 *
 * 做面板时用它包一层：标题给 `title`，内容放 children（**别自己再画外框/标题栏**，避免双重框）。
 *  - `position`：初始角落（默认右上）。用户可拖标题栏自由移动。
 *  - `name`: runtime agents control generated panels through SDK `panelList` / `panelSetVisible`.
 */
export function PanelShell({
  name,
  title,
  description,
  position = 'top-right',
  defaultOpen = true,
  width = 340,
  children,
}: {
  name: string;
  title: string;
  /** 一句话说明这个面板干啥 —— 进注册表，让运行期 agent 知道什么时候该调它。 */
  description?: string;
  position?: Corner;
  defaultOpen?: boolean;
  width?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const openRef = useRef(defaultOpen);
  const [corner, setCorner] = useState<Corner>(() => pickFreeCorner(position) as Corner);
  const [pos, setPosState] = useState<Position | null>(null);
  const posRef = useRef<Position | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressExpandClick = useRef(false);

  const setPos = (next: Position | null): void => {
    posRef.current = next;
    setPosState(next);
  };

  const setExpanded = (expanded: boolean): void => {
    openRef.current = expanded;
    setOpen(expanded);
    refreshPanelRegistry();
  };

  // 挂载后恢复上次保存的布局（不在 useState 初始化读取，避免 SSR hydration 不一致）
  useEffect(() => {
    const saved = readSavedPanel(name);
    if (typeof saved.open === 'boolean' && saved.open !== openRef.current) {
      openRef.current = saved.open;
      setOpen(saved.open);
    }
    if (saved.corner && CORNER_CANDIDATES.includes(saved.corner)) setCorner(saved.corner);
    if (saved.pos) {
      posRef.current = saved.pos;
      setPosState(saved.pos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // 布局变化后防抖持久化（拖拽过程不频繁写）
  useEffect(() => {
    const timer = setTimeout(() => {
      writeSavedPanel(name, { open, corner, pos });
    }, 400);
    return () => clearTimeout(timer);
  }, [name, open, corner, pos]);

  // 当前项目内注册控制器；PanelShell 的 React 状态是唯一状态源，注册表只实时查询。
  useEffect(() => {
    registerPanel({
      name,
      title,
      description,
      corner,
      getState: () => ({ expanded: openRef.current }),
      setExpanded,
    });
    return () => unregisterPanel(name);
  }, [name, title, description, corner]);

  // 运行期兼容事件：新 runtime 优先调用控制器，旧调用链仍可通过事件控制。
  useEffect(() => {
    const onToggle = (e: Event): void => {
      const d = (e as CustomEvent<{ name: string; open?: boolean }>).detail;
      if (d?.name === name) setExpanded(d.open ?? true);
    };
    const onMove = (e: Event): void => {
      const d = (e as CustomEvent<{ name: string; position: Corner }>).detail;
      if (d?.name === name && d.position in CORNER) {
        setPos(null);
        setCorner(d.position);
      }
    };
    window.addEventListener('app:panel', onToggle);
    window.addEventListener('app:panel:move', onMove);
    return () => {
      window.removeEventListener('app:panel', onToggle);
      window.removeEventListener('app:panel:move', onMove);
    };
  }, [name]);

  useEffect(() => {
    const onMove = (ev: MouseEvent): void => {
      const current = drag.current;
      if (!current) return;
      const dx = ev.clientX - current.sx;
      const dy = ev.clientY - current.sy;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      current.moved = true;
      setPos(clampPosition({ x: current.ox + dx, y: current.oy + dy }, current.width, current.height));
    };
    const onUp = (): void => {
      if (drag.current?.moved) {
        suppressExpandClick.current = true;
        window.setTimeout(() => {
          suppressExpandClick.current = false;
        }, 0);
      }
      drag.current = null;
    };
    const onResize = (): void => {
      const current = posRef.current;
      if (!current) return;
      setPos(clampPosition(current, openRef.current ? width : Math.min(width, 220), openRef.current ? 48 : 38));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', onResize);
    };
  }, [width]);

  const startDrag = (e: ReactMouseEvent<HTMLElement>): void => {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = {
      ox: box.left,
      oy: box.top,
      sx: e.clientX,
      sy: e.clientY,
      width: box.width,
      height: box.height,
      moved: false,
    };
    setPos({ x: box.left, y: box.top });
    e.preventDefault();
  };

  const restoreFromMinimized = (): void => {
    if (suppressExpandClick.current) {
      suppressExpandClick.current = false;
      return;
    }
    setExpanded(true);
  };

  const place: CSSProperties = pos ? { left: pos.x, top: pos.y } : CORNER[corner];

  return (
    <>
      {!open && (
        <button
          type="button"
          onMouseDown={startDrag}
          onClick={restoreFromMinimized}
          title={`${title}（点击展开，可拖动）`}
          style={{
            position: 'fixed',
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: 220,
            padding: '8px 14px',
            borderRadius: 9999,
            background: 'rgba(13, 19, 32, 0.92)',
            border: '1px solid rgba(120, 170, 255, 0.3)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            color: '#e8edf6',
            backdropFilter: 'blur(6px)',
            cursor: 'move',
            fontSize: 13,
            userSelect: 'none',
            ...place,
          }}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>▣</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </button>
      )}

      <div
        style={{
          position: 'fixed',
          zIndex: 30,
          width,
          maxHeight: 'calc(100vh - 32px)',
          display: open ? 'flex' : 'none',
          flexDirection: 'column',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(13, 19, 32, 0.92)',
          border: '1px solid rgba(120, 170, 255, 0.18)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
          color: '#e8edf6',
          backdropFilter: 'blur(6px)',
          ...place,
        }}
      >
        <div
          onMouseDown={startDrag}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            cursor: 'move',
            userSelect: 'none',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
          <button
            type="button"
            aria-label="关闭"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setExpanded(false)}
            style={{ cursor: 'pointer', opacity: 0.6, fontSize: 16, padding: '0 4px', color: 'inherit', background: 'none', border: 0 }}
          >
            ×
          </button>
        </div>
        <div className="thin-scroll" style={{ overflow: 'auto', padding: 12 }}>{children}</div>
      </div>
    </>
  );
}
