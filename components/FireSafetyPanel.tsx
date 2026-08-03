'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { sceneSdk } from '@/lib/scene-sdk';
import { useSceneId } from '@/lib/useSceneId';
import {
  FIRE_TYPE_COLORS,
  FIRE_TYPE_ICONS,
  FIRE_TYPE_IDENTIFIERS,
  FIRE_TYPE_LABELS,
  FIRE_TYPE_ORDER,
  type FireDeviceStatus,
} from '@/lib/fire-types';

type DeviceStatus = FireDeviceStatus;

type SceneTreeNode = {
  id: string;
  name: string;
  type: string;
  children: SceneTreeNode[];
  twins_instance_id?: string;
  out_instance_id?: string;
  parent_out_instance_id?: string;
};

type FireDevice = {
  id: string;
  instanceId: string;
  name: string;
  type: string;
  typeName: string;
  storyName?: string;
  spaceName?: string;
  status: DeviceStatus;
};

/** 设备状态探测结果：status 为归一化后的状态，field/value 为该状态来自实例的哪个属性字段（来源展示用）。 */
type StatusProbe = { status: DeviceStatus; field?: string; value?: string };

const STATUS_THEME: Record<DeviceStatus, { label: string; color: string; bg: string }> = {
  normal: { label: '正常', color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
  warning: { label: '告警', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
  offline: { label: '离线', color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
  unknown: { label: '未知', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
};

/** 设备状态探测结果缓存：sceneId → (deviceId → { status, field, value })。面板重新挂载时避免重复探测。 */
const STATUS_CACHE = new Map<string, Record<string, StatusProbe>>();

const PAGE_SIZE = 50;

function flattenFireDevices(node: SceneTreeNode, path: string[] = []): FireDevice[] {
  const currentPath = node.name ? [...path, node.name] : path;
  const result: FireDevice[] = [];

  if (!node.children || node.children.length === 0) {
    if (FIRE_TYPE_IDENTIFIERS.has(node.type)) {
      const storyName = currentPath.find((name) => /f|层|楼|floor/i.test(name)) ?? undefined;
      const spaceName = currentPath[currentPath.length - 2] ?? undefined;
      result.push({
        id: node.id || String(node.out_instance_id || node.twins_instance_id || ''),
        instanceId: String(node.twins_instance_id || node.id || node.out_instance_id || ''),
        name: node.name || FIRE_TYPE_LABELS[node.type] || node.type,
        type: node.type,
        typeName: FIRE_TYPE_LABELS[node.type] || node.type,
        storyName,
        spaceName,
        status: 'unknown',
      });
    }
    return result;
  }

  for (const child of node.children) {
    result.push(...flattenFireDevices(child, currentPath));
  }
  return result;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || '未分组';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function FireSafetyPanel() {
  const sceneId = useSceneId();
  const [tree, setTree] = useState<SceneTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<DeviceStatus | null>(null);
  const [search, setSearch] = useState('');
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [statusMap, setStatusMap] = useState<Record<string, StatusProbe> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatusMap(null);
    try {
      const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId || '')}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || `请求失败 (${res.status})`);
      }
      const data = (await res.json()) as SceneTreeNode;
      setTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载场景数据失败');
    } finally {
      setLoading(false);
    }
  }, [sceneId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const baseDevices = useMemo(() => (tree ? flattenFireDevices(tree) : []), [tree]);

  const devices = useMemo<FireDevice[]>(() => {
    if (!statusMap) return baseDevices;
    return baseDevices.map((d) => ({ ...d, status: statusMap[d.id]?.status ?? 'unknown' }));
  }, [baseDevices, statusMap]);

  // 树加载后读取设备真实状态（带缓存，避免每次打开重复探测）
  const loadStatuses = useCallback(async () => {
    if (!sceneId || baseDevices.length === 0) return;
    const cacheKey = `fire-status:${sceneId}`;
    const cached = STATUS_CACHE.get(cacheKey) ?? {};
    const missingIds = baseDevices.filter((d) => !(d.id in cached)).map((d) => d.id);

    if (missingIds.length === 0) {
      setStatusMap(cached);
      return;
    }

    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch(
        `/api/ustudio/fire-devices?sceneId=${encodeURIComponent(sceneId)}&ids=${encodeURIComponent(missingIds.join(','))}`,
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || `请求失败 (${res.status})`);
      }
      const data = (await res.json()) as {
        results: Array<{ id: string; status: DeviceStatus; field?: string; value?: string }>;
      };
      const merged: Record<string, StatusProbe> = { ...cached };
      for (const r of data.results) merged[r.id] = { status: r.status, field: r.field, value: r.value };
      STATUS_CACHE.set(cacheKey, merged);
      setStatusMap(merged);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : '读取设备状态失败');
      setStatusMap(cached);
    } finally {
      setStatusLoading(false);
    }
  }, [sceneId, baseDevices]);

  useEffect(() => {
    if (baseDevices.length > 0) void loadStatuses();
  }, [baseDevices, loadStatuses]);

  const stats = useMemo(() => {
    const total = devices.length;
    const normal = devices.filter((d) => d.status === 'normal').length;
    const warning = devices.filter((d) => d.status === 'warning').length;
    const offline = devices.filter((d) => d.status === 'offline').length;
    const unknown = devices.filter((d) => d.status === 'unknown').length;
    return { total, normal, warning, offline, unknown };
  }, [devices]);

  const typeDistribution = useMemo(() => {
    const grouped = groupBy(devices, (d) => d.type);
    return FIRE_TYPE_ORDER.map((type) => ({
      type,
      label: FIRE_TYPE_LABELS[type] || type,
      icon: FIRE_TYPE_ICONS[type] || '🔥',
      color: FIRE_TYPE_COLORS[type] || '#94a3b8',
      count: grouped[type]?.length || 0,
    })).filter((item) => item.count > 0);
  }, [devices]);

  const storyOptions = useMemo(() => {
    const stories = new Set(devices.map((d) => d.storyName).filter(Boolean));
    return Array.from(stories).sort((a, b) => a!.localeCompare(b!, 'zh-CN'));
  }, [devices]);

  const storyDistribution = useMemo(() => {
    const grouped = groupBy(devices, (d) => d.storyName || '未分配楼层');
    return Object.entries(grouped)
      .map(([story, items]) => ({ story, count: items.length }))
      .sort((a, b) => a.story.localeCompare(b.story, 'zh-CN'));
  }, [devices]);

  const filteredDevices = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (selectedType && d.type !== selectedType) return false;
      if (selectedStory && d.storyName !== selectedStory) return false;
      if (selectedStatus && d.status !== selectedStatus) return false;
      if (kw && !(`${d.name} ${d.typeName} ${d.storyName || ''} ${d.spaceName || ''}`.toLowerCase().includes(kw))) {
        return false;
      }
      return true;
    });
  }, [devices, selectedType, selectedStory, selectedStatus, search]);

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [selectedType, selectedStory, selectedStatus, search]);

  const pageCount = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pagedDevices = useMemo(
    () => filteredDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDevices, page],
  );

  const handleLocate = async (device: FireDevice) => {
    try {
      setLocatingId(device.id);
      const sdk = sceneSdk();
      await sdk.fly(device.id);
      await sdk.heighLight(device.id, FIRE_TYPE_COLORS[device.type] || '#f59e0b');
      setHighlightedIds((prev) => new Set(prev).add(device.id));
    } catch (err) {
      console.error('定位消防设备失败', err);
    } finally {
      setLocatingId(null);
    }
  };

  const handleHighlightAll = async () => {
    try {
      const sdk = sceneSdk();
      await Promise.allSettled(
        filteredDevices.map((d) => sdk.heighLight(d.id, FIRE_TYPE_COLORS[d.type] || '#f59e0b')),
      );
      setHighlightedIds(new Set(filteredDevices.map((d) => d.id)));
    } catch (err) {
      console.error('批量高亮失败', err);
    }
  };

  const handleClearHighlight = async () => {
    try {
      const sdk = sceneSdk();
      highlightedIds.forEach((id) => {
        sdk.cancelHeighLight(id);
      });
      setHighlightedIds(new Set());
    } catch (err) {
      console.error('取消高亮失败', err);
    }
  };

  const handleResetFilter = () => {
    setSelectedType(null);
    setSelectedStory(null);
    setSelectedStatus(null);
    setSearch('');
  };

  const hasFilter = selectedType || selectedStory || selectedStatus || search.trim();
  const unknownCount = stats.unknown;

  return (
    <div id="panel-fire-safety">
      <PanelShell
        name="fire-safety"
        title="消防设施分布"
        description="展示场景中消防设备的类型统计、楼层分布、设备清单，读取真实运行状态，支持一键定位和高亮。"
        position="top-right"
        defaultOpen={true}
        width={400}
      >
        <div className="fire-panel">
          {loading && (
            <div className="fire-loading">
              <span className="fire-spinner" />
              正在加载消防设备数据…
            </div>
          )}

          {!loading && error && (
            <div className="fire-error">
              <div className="fire-error-title">加载失败</div>
              <div className="fire-error-msg">{error}</div>
              <button type="button" className="fire-btn fire-btn--danger-outline" onClick={fetchTree}>
                重试
              </button>
            </div>
          )}

          {!loading && !error && devices.length === 0 && (
            <div className="fire-empty">
              <div className="fire-empty-title">未识别到消防设备</div>
              <div className="fire-empty-hint">
                当前按 StandaloneSmokeAlarm、EmergencyLightingFixture、PortableCO2Extinguisher、ExtinguisherCabinet、HydrantButton、ClosedSprinklerHead 过滤
              </div>
            </div>
          )}

          {!loading && !error && devices.length > 0 && (
            <>
              <section className="fire-section">
                <div className="fire-grid fire-grid--4">
                  <StatCard label="总数" value={stats.total} color="#60a5fa" icon="🔥" />
                  <StatCard label="正常" value={stats.normal} color="#34d399" icon="✓" />
                  <StatCard label="告警" value={stats.warning} color="#fbbf24" icon="⚠" pulse={stats.warning > 0} />
                  <StatCard label="离线" value={stats.offline} color="#f87171" icon="✕" />
                </div>
                {statusLoading && (
                  <div className="fire-status-bar">
                    <span className="fire-spinner" />
                    正在读取设备实时状态…
                  </div>
                )}
                {!statusLoading && statusError && unknownCount > 0 && (
                  <div className="fire-status-bar fire-status-bar--warn">
                    <span>部分设备状态未读取到（{unknownCount} 台）</span>
                    <button type="button" className="fire-btn fire-btn--text" onClick={() => void loadStatuses()}>
                      重新读取
                    </button>
                  </div>
                )}
              </section>

              <section className="fire-section">
                <div className="fire-section-title">按类型分布</div>
                <div className="fire-type-list">
                  {typeDistribution.map((item) => {
                    const active = selectedType === item.type;
                    const percent = devices.length > 0 ? Math.round((item.count / devices.length) * 100) : 0;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        className={`fire-type-item ${active ? 'is-active' : ''}`}
                        onClick={() => setSelectedType(active ? null : item.type)}
                      >
                        <span className="fire-type-icon" style={{ background: item.color }}>
                          {item.icon}
                        </span>
                        <span className="fire-type-info">
                          <span className="fire-type-name">{item.label}</span>
                          <span className="fire-type-bar">
                            <span className="fire-type-bar-inner" style={{ width: `${percent}%`, background: item.color }} />
                          </span>
                        </span>
                        <span className="fire-type-count">{item.count}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {storyDistribution.length > 0 && (
                <section className="fire-section">
                  <div className="fire-section-title">按楼层分布</div>
                  <div className="fire-story-scroll thin-scroll">
                    {storyDistribution.map((item) => (
                      <button
                        key={item.story}
                        type="button"
                        className={`fire-story-pill ${selectedStory === item.story ? 'is-active' : ''}`}
                        onClick={() => setSelectedStory(selectedStory === item.story ? null : item.story)}
                      >
                        <span className="fire-story-name">{item.story}</span>
                        <span className="fire-story-count">{item.count}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="fire-section">
                <div className="fire-section-title">设备清单</div>
                <div className="fire-toolbar">
                  <input
                    type="text"
                    className="fire-search"
                    placeholder="搜索设备名称、类型、楼层…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    className="fire-select"
                    value={selectedStory || ''}
                    onChange={(e) => setSelectedStory(e.target.value || null)}
                  >
                    <option value="">全部楼层</option>
                    {storyOptions.map((story) => (
                      <option key={story} value={story}>
                        {story}
                      </option>
                    ))}
                  </select>
                  <select
                    className="fire-select"
                    value={selectedStatus || ''}
                    onChange={(e) => setSelectedStatus((e.target.value as DeviceStatus) || null)}
                  >
                    <option value="">全部状态</option>
                    <option value="normal">正常</option>
                    <option value="warning">告警</option>
                    <option value="offline">离线</option>
                    <option value="unknown">未知</option>
                  </select>
                </div>

                <div className="fire-list-actions">
                  <button type="button" className="fire-btn fire-btn--primary" onClick={handleHighlightAll}>
                    高亮全部
                  </button>
                  <button
                    type="button"
                    className="fire-btn fire-btn--default"
                    onClick={handleClearHighlight}
                    disabled={highlightedIds.size === 0}
                  >
                    取消高亮
                  </button>
                  {hasFilter && (
                    <button type="button" className="fire-btn fire-btn--text" onClick={handleResetFilter}>
                      重置筛选
                    </button>
                  )}
                  <span className="fire-list-meta">
                    {filteredDevices.length}/{devices.length}
                  </span>
                </div>

                <div className="fire-device-list thin-scroll">
                  {pagedDevices.map((device) => {
                    const status = STATUS_THEME[device.status];
                    const probe = statusMap?.[device.id];
                    const active = highlightedIds.has(device.id);
                    const locating = locatingId === device.id;
                    return (
                      <div
                        key={device.id}
                        className={`fire-device-card ${active ? 'is-active' : ''} ${locating ? 'is-locating' : ''}`}
                        role="button"
                        tabIndex={0}
                        title="点击定位并高亮该设备"
                        onClick={() => handleLocate(device)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleLocate(device);
                          }
                        }}
                      >
                        <div className="fire-device-header">
                          <div className="fire-device-title-row">
                            <span
                              className="fire-device-dot"
                              style={{ background: FIRE_TYPE_COLORS[device.type] || '#94a3b8' }}
                            />
                            <span className="fire-device-name" title={device.name}>
                              {device.name}
                            </span>
                            {statusLoading ? (
                              <span className="fire-device-status fire-device-status--loading">读取中…</span>
                            ) : (
                              <span
                                className={`fire-device-status fire-device-status--${device.status}`}
                                style={{ color: status.color, background: status.bg }}
                              >
                                {status.label}
                              </span>
                            )}
                          </div>
                          <div className="fire-device-meta">
                            {device.typeName}
                            {device.storyName && ` · ${device.storyName}`}
                            {device.spaceName && ` · ${device.spaceName}`}
                          </div>
                          {!statusLoading && (
                            <div
                              className="fire-device-source"
                              title="该状态取自设备实例的哪个属性字段"
                            >
                              状态来源：{probe?.field ? `${probe.field} = ${String(probe.value ?? '')}` : '未探测到状态字段'}
                            </div>
                          )}
                        </div>
                        <div className="fire-device-foot">
                          <span className={`fire-device-locate ${locating ? 'is-visible' : ''}`}>
                            {locating ? '正在定位…' : '点击定位并高亮'}
                          </span>
                          {active && <span className="fire-device-located">已定位</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredDevices.length === 0 && (
                  <div className="fire-empty-state">没有符合当前筛选条件的设备</div>
                )}

                {pageCount > 1 && (
                  <div className="fire-pagination">
                    <button
                      type="button"
                      className="fire-btn fire-btn--default"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      上一页
                    </button>
                    <span className="fire-pagination-info">
                      第 {page} / {pageCount} 页
                    </span>
                    <button
                      type="button"
                      className="fire-btn fire-btn--default"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </PanelShell>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
  pulse = false,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
  pulse?: boolean;
}) {
  return (
    <div className={`fire-stat-card ${pulse ? 'is-pulse' : ''}`}>
      <div className="fire-stat-icon" style={{ color }}>
        {icon}
      </div>
      <div className="fire-stat-value" style={{ color }}>
        {value}
      </div>
      <div className="fire-stat-label">{label}</div>
    </div>
  );
}
