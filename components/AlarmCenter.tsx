'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneSdk } from '@/lib/scene-sdk';
import { flattenFireDevices, type FlatDevice } from '@/lib/device-tree';
import { FIRE_TYPE_COLORS } from '@/lib/fire-types';

type AlarmStatus = 'warning' | 'offline';

type AlarmItem = FlatDevice & {
  status: AlarmStatus;
  firstSeen: number;
  field?: string;
  value?: string;
};

const POLL_INTERVAL_MS = 30000;

const STATUS_META: Record<AlarmStatus, { label: string; color: string; bg: string }> = {
  warning: { label: '告警', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
  offline: { label: '离线', color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function AlarmCenter({ sceneId }: { sceneId: string }) {
  const [devices, setDevices] = useState<FlatDevice[]>([]);
  const [alerts, setAlerts] = useState<AlarmItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const alertsRef = useRef<AlarmItem[]>([]);
  alertsRef.current = alerts;
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 1. 消防设备清单（树加载一次即可，设备清单稳定）
  useEffect(() => {
    let cancelled = false;
    if (!sceneId) return;
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.message || `请求失败 (${res.status})`);
        }
        const tree = await res.json();
        if (!cancelled) setDevices(flattenFireDevices(tree));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '读取设备清单失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // 2. 定时探测设备状态 → 生成告警列表（warning / offline）
  const poll = useCallback(async () => {
    if (devices.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ustudio/fire-devices?sceneId=${encodeURIComponent(sceneId)}&ids=${encodeURIComponent(
          devices.map((d) => d.id).join(','),
        )}`,
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || `请求失败 (${res.status})`);
      }
      const data = (await res.json()) as { results: Array<{ id: string; status: string; field?: string; value?: string }> };
      const byId = new Map(data.results.map((r) => [r.id, r]));
      const now = Date.now();
      const prevById = new Map(alertsRef.current.map((a) => [a.id, a]));
      const next: AlarmItem[] = [];
      for (const d of devices) {
        const r = byId.get(d.id);
        if (r && (r.status === 'warning' || r.status === 'offline')) {
          const prev = prevById.get(d.id);
          next.push({
            ...d,
            status: r.status,
            firstSeen: prev?.firstSeen ?? now,
            field: r.field,
            value: r.value,
          });
        }
      }
      next.sort((a, b) => a.firstSeen - b.firstSeen);
      setAlerts(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取设备状态失败');
    } finally {
      setLoading(false);
    }
  }, [devices, sceneId]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  // 点击外部关闭面板
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const locate = useCallback(async (item: AlarmItem) => {
    try {
      setLocatingId(item.id);
      const sdk = sceneSdk();
      await sdk.fly(item.id);
      await sdk.heighLight(item.id, item.status === 'warning' ? '#fbbf24' : '#f87171');
    } catch (err) {
      console.error('定位告警设备失败', err);
    } finally {
      setLocatingId(null);
    }
  }, []);

  const latest = alerts[alerts.length - 1];

  return (
    <div className="alarm-center" ref={rootRef}>
      <button
        type="button"
        className={`appTopBar-btn alarm-btn${alerts.length > 0 ? ' has-alert' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
      >
        告警
        {alerts.length > 0 && <span className="alarm-badge">{alerts.length}</span>}
      </button>

      {/* 告警横幅：有告警且面板未打开时显示最新一条 */}
      {alerts.length > 0 && !open && latest && (
        <button type="button" className="alarm-banner" onClick={() => setOpen(true)}>
          <span className="alarm-banner-dot" aria-hidden />
          <span className="alarm-banner-text">
            {alerts.length} 台设备告警/离线 · 最新：{latest.name}
          </span>
          <span className="alarm-banner-more">查看 →</span>
        </button>
      )}

      {open && (
        <div className="alarm-panel">
          <div className="alarm-panel-head">
            <span className="alarm-panel-title">实时告警</span>
            <span className="alarm-panel-count">{alerts.length} 台</span>
            <button
              type="button"
              className="alarm-refresh"
              onClick={() => void poll()}
              disabled={loading}
              title="立即刷新"
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
          <div className="alarm-panel-body thin-scroll">
            {error && <div className="alarm-error">状态读取失败：{error}</div>}
            {!error && devices.length === 0 && <div className="alarm-empty">正在读取设备清单…</div>}
            {!error && devices.length > 0 && alerts.length === 0 && (
              <div className="alarm-empty">
                <span className="alarm-empty-ok">✓</span>
                当前未检测到告警或离线设备
                {loading && '（正在刷新…）'}
              </div>
            )}
            {alerts.map((item) => {
              const meta = STATUS_META[item.status];
              const locating = locatingId === item.id;
              return (
                <div
                  key={item.id}
                  className={`alarm-item ${locating ? 'is-locating' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => locate(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      locate(item);
                    }
                  }}
                >
                  <span className="alarm-item-dot" style={{ background: meta.color }} aria-hidden />
                  <span className="alarm-item-main">
                    <span className="alarm-item-name">{item.name}</span>
                    <span className="alarm-item-meta">
                      {item.typeName}
                      {item.storyName && ` · ${item.storyName}`}
                      {item.spaceName && ` · ${item.spaceName}`}
                    </span>
                  </span>
                  <span className="alarm-item-right">
                    <span className="alarm-item-status" style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                    <span className="alarm-item-time">{formatTime(item.firstSeen)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="alarm-panel-foot">
            每 30 秒自动检测 · 点击条目定位并高亮
            {alerts.length > 0 && <span className="alarm-panel-hint">共 {devices.length} 台消防设备</span>}
          </div>
        </div>
      )}
    </div>
  );
}
