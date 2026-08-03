'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sceneSdk } from '@/lib/scene-sdk';
import { flattenAllDevices, type FlatDevice } from '@/lib/device-tree';
import { FIRE_TYPE_COLORS } from '@/lib/fire-types';

const MAX_RESULTS = 20;

export function DeviceSearch({ sceneId }: { sceneId: string }) {
  const [query, setQuery] = useState('');
  const [devices, setDevices] = useState<FlatDevice[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sceneId) return;
    setLoading(true);
    setError(null);
    setDevices([]);
    void (async () => {
      try {
        const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.message || `请求失败 (${res.status})`);
        }
        const tree = await res.json();
        if (!cancelled) setDevices(flattenAllDevices(tree));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '设备清单加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  const results = useMemo(() => {
    const kw = query.trim().toLowerCase();
    if (!kw) return [];
    return devices
      .filter((d) =>
        `${d.name} ${d.typeName} ${d.storyName || ''} ${d.spaceName || ''}`.toLowerCase().includes(kw),
      )
      .slice(0, MAX_RESULTS);
  }, [devices, query]);

  const locate = async (device: FlatDevice) => {
    try {
      setLocatingId(device.id);
      const sdk = sceneSdk();
      await sdk.fly(device.id);
      await sdk.heighLight(device.id, FIRE_TYPE_COLORS[device.type] || '#60a5fa');
      setQuery('');
      setFocused(false);
    } catch (err) {
      console.error('定位设备失败', err);
    } finally {
      setLocatingId(null);
    }
  };

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const showDropdown = focused && (loading || error !== null || query.trim() !== '');

  return (
    <div className="devSearch" ref={rootRef}>
      <div className="devSearch-input-wrap">
        <span className="devSearch-icon" aria-hidden>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          className="devSearch-input"
          placeholder="搜索设备…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) {
              e.preventDefault();
              void locate(results[0]);
            }
            if (e.key === 'Escape') {
              setFocused(false);
              setQuery('');
            }
          }}
        />
        {query && (
          <button type="button" className="devSearch-clear" onClick={() => setQuery('')} aria-label="清空">
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="devSearch-dropdown">
          {loading && <div className="devSearch-state">正在加载设备清单…</div>}
          {!loading && error && <div className="devSearch-state devSearch-state--error">{error}</div>}
          {!loading && !error && query.trim() !== '' && results.length === 0 && (
            <div className="devSearch-state">未找到匹配的设备</div>
          )}
          {results.map((device) => {
            const locating = locatingId === device.id;
            return (
              <div
                key={device.id}
                className="devSearch-item"
                role="button"
                tabIndex={0}
                onClick={() => locate(device)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    locate(device);
                  }
                }}
              >
                <span className="devSearch-item-dot" style={{ background: FIRE_TYPE_COLORS[device.type] || '#64748b' }} aria-hidden />
                <span className="devSearch-item-main">
                  <span className="devSearch-item-name">{device.name}</span>
                  <span className="devSearch-item-meta">
                    {device.typeName}
                    {device.storyName && ` · ${device.storyName}`}
                    {device.spaceName && ` · ${device.spaceName}`}
                  </span>
                </span>
                <span className="devSearch-item-locate">{locating ? '定位中…' : '定位 →'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
