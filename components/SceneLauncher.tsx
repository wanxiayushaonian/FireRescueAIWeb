'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type SceneSummary = { scene_id: string; scene_name: string };

export type SceneOverviewResult = {
  sceneId: string;
  storyCount: number;
  deviceCount: number;
  fireDeviceCount: number;
  ok: boolean;
};

type SortBy = 'default' | 'devices' | 'stories';

const OVERVIEW_CACHE_KEY = 'jarvis:ustudio:overview-cache';
const OVERVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const LARGE_SCENE_DEVICE_THRESHOLD = 500;

function readOverviewCache(): Record<string, SceneOverviewResult | null> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OVERVIEW_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { savedAt?: number; entries?: Record<string, SceneOverviewResult | null> };
    if (typeof parsed.savedAt !== 'number' || !parsed.entries) return {};
    if (Date.now() - parsed.savedAt > OVERVIEW_CACHE_TTL_MS) return {};
    return parsed.entries;
  } catch {
    return {};
  }
}

function writeOverviewCache(entries: Record<string, SceneOverviewResult | null>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      OVERVIEW_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), entries }),
    );
  } catch {
    // ignore storage quota/privacy errors
  }
}

function SceneIcon() {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function SceneLauncher({
  scenes,
  lastSceneId,
  error,
  loading,
  onEnter,
  onRetry,
}: {
  scenes: SceneSummary[];
  lastSceneId: string | null;
  error: string | null;
  loading: boolean;
  onEnter: (sceneId: string) => void;
  onRetry: () => void;
}) {
  const [overviews, setOverviews] = useState<Record<string, SceneOverviewResult | null>>(() => readOverviewCache());
  const [statsLoading, setStatsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('default');

  useEffect(() => {
    if (scenes.length === 0) return;
    const sceneIds = scenes.map((s) => s.scene_id);
    const merged: Record<string, SceneOverviewResult | null> = { ...readOverviewCache() };
    const missing: string[] = [];
    for (const id of sceneIds) {
      if (merged[id] === undefined) missing.push(id);
    }

    if (missing.length === 0) {
      setOverviews(merged);
      return;
    }

    let cancelled = false;
    setStatsLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/ustudio/overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneIds: missing }),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`统计请求失败 (${res.status})`);
        const data = (await res.json()) as { results: SceneOverviewResult[] };
        for (const r of data.results) merged[r.sceneId] = r;
        for (const id of missing) {
          if (merged[id] === undefined) merged[id] = null;
        }
      } catch {
        for (const id of missing) merged[id] = null;
      } finally {
        if (!cancelled) {
          writeOverviewCache(merged);
          setOverviews(merged);
          setStatsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenes]);

  const handleEnter = useCallback(
    (sceneId: string) => {
      onEnter(sceneId);
    },
    [onEnter],
  );

  const filteredScenes = useMemo(() => {
    const kw = query.trim().toLowerCase();
    if (!kw) return scenes;
    return scenes.filter((s) => `${s.scene_name} ${s.scene_id}`.toLowerCase().includes(kw));
  }, [scenes, query]);

  const sortedScenes = useMemo(() => {
    if (sortBy === 'devices') {
      return [...filteredScenes].sort(
        (a, b) => (overviews[b.scene_id]?.deviceCount ?? 0) - (overviews[a.scene_id]?.deviceCount ?? 0),
      );
    }
    if (sortBy === 'stories') {
      return [...filteredScenes].sort(
        (a, b) => (overviews[b.scene_id]?.storyCount ?? 0) - (overviews[a.scene_id]?.storyCount ?? 0),
      );
    }
    return filteredScenes;
  }, [filteredScenes, sortBy, overviews]);

  return (
    <div className="launcher">
      <div className="launcher-bg" aria-hidden />
      <div className="launcher-inner">
        <header className="launcher-head">
          <div className="launcher-title-row">
            <span className="launcher-logo">
              <SceneIcon />
            </span>
            <div>
              <h1 className="launcher-title">数字孪生场景工作台</h1>
              <p className="launcher-subtitle">选择一个场景进入，加载完成后再开始操作</p>
            </div>
          </div>
        </header>

        {loading && (
          <div className="launcher-center">
            <span className="launcher-spinner" />
            <span>正在读取场景列表…</span>
          </div>
        )}

        {!loading && error && (
          <div className="launcher-center">
            <div className="launcher-error">
              <div className="launcher-error-title">场景列表加载失败</div>
              <div className="launcher-error-msg">{error}</div>
              <button type="button" className="launcher-btn launcher-btn--primary" onClick={onRetry}>
                重试
              </button>
            </div>
          </div>
        )}

        {!loading && !error && scenes.length === 0 && (
          <div className="launcher-center">
            <div className="launcher-empty">
              <div className="launcher-empty-title">当前没有可用场景</div>
              <div className="launcher-empty-hint">请先在 UStudio 平台创建或绑定场景，再刷新本页面</div>
              <button type="button" className="launcher-btn launcher-btn--default" onClick={onRetry}>
                刷新
              </button>
            </div>
          </div>
        )}

        {!loading && !error && scenes.length > 0 && (
          <>
            <div className="launcher-toolbar">
              <div className="launcher-search-wrap">
                <span className="launcher-search-icon" aria-hidden>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <input
                  type="text"
                  className="launcher-search"
                  placeholder="搜索场景名称或 ID…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="launcher-sort">
                排序
                <select
                  className="launcher-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                >
                  <option value="default">默认</option>
                  <option value="devices">设备数 ↓</option>
                  <option value="stories">楼层数 ↓</option>
                </select>
              </label>
              <span className="launcher-count">{filteredScenes.length} 个场景</span>
            </div>

            <div className="launcher-grid-wrap thin-scroll">
              {filteredScenes.length === 0 ? (
                <div className="launcher-center launcher-center--inline">
                  <span className="launcher-empty-hint">没有匹配「{query}」的场景</span>
                </div>
              ) : (
                <div className="launcher-grid">
                  {sortedScenes.map((scene) => {
                    const ov = overviews[scene.scene_id];
                    const isLast = lastSceneId === scene.scene_id;
                    const big = (ov?.ok ?? false) && (ov?.deviceCount ?? 0) > LARGE_SCENE_DEVICE_THRESHOLD;
                    return (
                      <div
                        key={scene.scene_id}
                        className={`launcher-card ${isLast ? 'is-last' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleEnter(scene.scene_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleEnter(scene.scene_id);
                          }
                        }}
                      >
                        <div className="launcher-card-top">
                          <span className="launcher-card-icon" aria-hidden>
                            <SceneIcon />
                          </span>
                          <div className="launcher-card-badges">
                            {isLast && <span className="launcher-badge launcher-badge--last">最近使用</span>}
                            {big && <span className="launcher-badge launcher-badge--big">设备较多</span>}
                          </div>
                        </div>
                        <div className="launcher-card-name" title={scene.scene_name}>
                          {scene.scene_name || '未命名场景'}
                        </div>
                        <div className="launcher-card-id" title={scene.scene_id}>
                          {scene.scene_id}
                        </div>
                        <div className="launcher-card-stats">
                          {statsLoading && ov === undefined ? (
                            <div className="launcher-stats-loading">正在统计场景体量…</div>
                          ) : !ov || !ov.ok ? (
                            <div className="launcher-stats-loading launcher-stats-loading--fail">体量统计不可用</div>
                          ) : (
                            <>
                              <div className="launcher-stat">
                                <span className="launcher-stat-value">{ov.storyCount}</span>
                                <span className="launcher-stat-label">楼层</span>
                              </div>
                              <div className="launcher-stat">
                                <span className="launcher-stat-value">{ov.deviceCount}</span>
                                <span className="launcher-stat-label">设备</span>
                              </div>
                              <div className="launcher-stat launcher-stat--fire">
                                <span className="launcher-stat-value">{ov.fireDeviceCount}</span>
                                <span className="launcher-stat-label">消防设备</span>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="launcher-card-enter">
                          <span>进入场景</span>
                          <span aria-hidden>→</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
