'use client';
// 坐标修正面板:当前坐标 + ① 地址查询候选 + ② 地图拾取 + ③ 手动输入 → 预览 → 保存。
// draft(新坐标)由父组件管理,便于地图拾取回填;保存后父组件刷新点位图层。
import { useRef, useState } from 'react';
import { useWheelGuard } from './hooks/use-wheel-guard';
import { MapPin, Search, Crosshair, Save, X, Loader2 } from 'lucide-react';
import type { GeoCandidate } from '@/api/geocode';

export interface CoordFixTarget {
  kind: 'unit' | 'building' | 'station' | 'incident' | 'water';
  id: string;
  name: string;
  type?: string; // 消防站类型(仅 kind=station 用)
  lng: number; // GCJ02(当前坐标)
  lat: number;
  sceneId?: string; // uStudio 建模场景 ID(仅 kind=building 用,3D引导)
}

interface Props {
  target: CoordFixTarget;
  draft: { lng: number; lat: number } | null;
  pickMode: boolean;
  candidates: GeoCandidate[];
  querying: boolean;
  saving: boolean;
  error: string | null;
  onQuery: (address: string) => void;
  onStartPick: () => void;
  onDraft: (lng: number, lat: number) => void;
  onClearDraft: () => void;
  onSave: () => void;
  onClose: () => void;
}

const fmt = (v: number) => v.toFixed(6);

export default function CoordinateFixPanel({
  target,
  draft,
  pickMode,
  candidates,
  querying,
  saving,
  error,
  onQuery,
  onStartPick,
  onDraft,
  onClearDraft,
  onSave,
  onClose,
}: Props) {
  // 阻止滚轮冒泡到 Leaflet 地图(否则缩放地图而非滚动面板列表)
  const rootRef = useRef<HTMLDivElement>(null);
  useWheelGuard(rootRef);

  const [address, setAddress] = useState('');
  const [mLng, setMLng] = useState('');
  const [mLat, setMLat] = useState('');

  return (
    <div ref={rootRef} className="absolute left-1/2 top-16 z-[600] w-[340px] -translate-x-1/2">
      <div
        className="overflow-hidden rounded-lg border border-amber-300/40 bg-bg-panel/95 backdrop-blur-[8px]"
        style={{ boxShadow: '0 0 24px rgba(251,191,36,.15)' }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <MapPin className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="truncate text-[13px] font-bold text-text-1">修正坐标 · {target.name}</span>
          <span className="shrink-0 rounded border border-amber-300/40 px-1 text-[10px] text-amber-300">
            {target.kind === 'unit' ? '单位' : '建筑'}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-text-3 transition hover:bg-white/10 hover:text-text-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2.5 px-3 py-2.5 text-[12px]">
          {/* 当前坐标 */}
          <div className="text-text-3">
            当前: <span className="font-mono text-text-2">{fmt(target.lng)}, {fmt(target.lat)}</span>
          </div>

          {/* 新坐标(draft)*/}
          <div className="rounded border border-line bg-bg-panel-2 px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-text-3">新坐标{pickMode ? ' · 拾取中' : ''}</span>
              {draft && (
                <button onClick={onClearDraft} className="text-[11px] text-text-3 transition hover:text-text-1">
                  清除
                </button>
              )}
            </div>
            <div className={`font-mono text-[13px] ${draft ? 'text-amber-300' : 'text-text-3'}`}>
              {draft ? `${fmt(draft.lng)}, ${fmt(draft.lat)}` : '未设置(选择下方来源)'}
            </div>
          </div>

          {/* ① 地址查询 */}
          <div>
            <div className="mb-1 text-text-3">① 地址查询</div>
            <div className="flex gap-1">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && address.trim() && onQuery(address.trim())}
                placeholder="输入地址(如:乐盈广场)"
                className="flex-1 rounded border border-line bg-bg-panel px-1.5 py-1 text-text-1 outline-none placeholder:text-text-3"
              />
              <button
                onClick={() => address.trim() && onQuery(address.trim())}
                className="rounded border border-line px-1.5 text-text-2 transition hover:text-text-1"
              >
                {querying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </button>
            </div>
            {candidates.length > 0 && (
              <div className="mt-1 max-h-[120px] overflow-y-auto rounded border border-line bg-bg-panel">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => onDraft(c.lng, c.lat)}
                    className="block w-full truncate px-1.5 py-1 text-left text-[11px] text-text-1 transition hover:bg-white/10"
                    title={`${c.address} | ${c.lng.toFixed(5)},${c.lat.toFixed(5)}`}
                  >
                    {c.address}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ② 地图拾取 */}
          <div>
            <div className="mb-1 text-text-3">② 地图拾取(对着卫星图精确定位)</div>
            <button
              onClick={onStartPick}
              disabled={pickMode}
              className={`flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1 transition ${
                pickMode
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-300'
                  : 'border-line text-text-2 hover:text-text-1'
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" /> {pickMode ? '点击地图选择点位…' : '开始拾取'}
            </button>
          </div>

          {/* ③ 手动输入 */}
          <div>
            <div className="mb-1 text-text-3">③ 手动输入经纬度(GCJ02)</div>
            <div className="flex gap-1">
              <input
                value={mLng}
                onChange={(e) => setMLng(e.target.value)}
                placeholder="经度"
                className="w-full rounded border border-line bg-bg-panel px-1.5 py-1 font-mono text-text-1 outline-none"
              />
              <input
                value={mLat}
                onChange={(e) => setMLat(e.target.value)}
                placeholder="纬度"
                className="w-full rounded border border-line bg-bg-panel px-1.5 py-1 font-mono text-text-1 outline-none"
              />
              <button
                onClick={() => {
                  const ln = parseFloat(mLng);
                  const la = parseFloat(mLat);
                  if (!Number.isNaN(ln) && !Number.isNaN(la)) onDraft(ln, la);
                }}
                className="rounded border border-line px-2 text-text-2 transition hover:text-text-1"
              >
                填入
              </button>
            </div>
          </div>

          {error && <div className="text-[11px] text-red-300">{error}</div>}

          <button
            onClick={onSave}
            disabled={!draft || saving}
            className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-[13px] transition ${
              draft && !saving
                ? 'border-amber-300/60 bg-amber-300/15 text-amber-300 hover:bg-amber-300/25'
                : 'border-line text-text-3'
            }`}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存修正
          </button>
        </div>
      </div>
    </div>
  );
}
