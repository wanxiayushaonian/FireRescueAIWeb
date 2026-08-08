'use client';
// 点位增删改表单:水源/重点单位/重点建筑三类共用一个面板,字段按 kind 切换。
// 坐标段与 CoordinateFixPanel 同一套三来源交互(地址查询/地图拾取/手动输入),
// 但坐标直接存进表单 values(不借道 draftCoord);删除仅 edit 模式,二次确认由父组件负责。
import { useState } from 'react';
import { Pencil, Plus, Save, X, Loader2, Search, Crosshair, Trash2 } from 'lucide-react';
import type { GeoCandidate } from '@/api/geocode';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import { DISTRICT_NAME } from '@/lib/water-mapper';
import { ENTITY_KIND_LABEL, WATER_TYPE_OPTIONS, UNIT_TYPE_OPTIONS, type EntityFormValues } from '@/lib/entity-form';

interface Props {
  mode: 'create' | 'edit';
  values: EntityFormValues;
  onChange: (v: EntityFormValues) => void;
  keyUnits: KeyUnit[]; // building 所属单位下拉
  candidates: GeoCandidate[];
  querying: boolean;
  pickMode: boolean;
  onQuery: (address: string) => void;
  onStartPick: () => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

const fmt = (v: number) => v.toFixed(6);

export default function EntityFormPanel({
  mode, values, onChange, keyUnits,
  candidates, querying, pickMode, onQuery, onStartPick,
  saving, error, onSave, onDelete, onClose,
}: Props) {
  const [address, setAddress] = useState('');
  const [mLng, setMLng] = useState('');
  const [mLat, setMLat] = useState('');

  const set = (patch: Partial<EntityFormValues>) => onChange({ ...values, ...patch });
  const kindLabel = ENTITY_KIND_LABEL[values.kind];

  const inputCls =
    'w-full rounded border border-line bg-bg-panel px-1.5 py-1 text-text-1 outline-none placeholder:text-text-3 focus:border-line-glow';
  const labelCls = 'mb-0.5 block text-text-3';

  return (
    <div className="absolute left-1/2 top-16 z-[600] w-[360px] -translate-x-1/2">
      <div
        className="max-h-[75vh] overflow-y-auto rounded-lg border border-cyan/40 bg-bg-panel/95 backdrop-blur-[8px]"
        style={{ boxShadow: '0 0 24px rgba(34,211,238,.15)' }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          {mode === 'create' ? <Plus className="h-4 w-4 shrink-0 text-cyan" /> : <Pencil className="h-4 w-4 shrink-0 text-cyan" />}
          <span className="truncate text-[13px] font-bold text-text-1">
            {mode === 'create' ? '新增' : '编辑'}{kindLabel}
            {values.name ? ` · ${values.name}` : ''}
          </span>
          <button onClick={onClose} className="ml-auto rounded p-0.5 text-text-3 transition hover:bg-white/10 hover:text-text-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2.5 px-3 py-2.5 text-[12px]">
          {/* 名称 */}
          <div>
            <label className={labelCls}>名称 *</label>
            <input value={values.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder={`${kindLabel}名称`} />
          </div>

          {/* water 字段 */}
          {values.kind === 'water' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>类型 *</label>
                <select value={values.waterType} onChange={(e) => set({ waterType: e.target.value })} className={inputCls}>
                  {WATER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>区划</label>
                <select value={values.districtCode} onChange={(e) => set({ districtCode: e.target.value })} className={inputCls}>
                  <option value="">未指定</option>
                  {Object.entries(DISTRICT_NAME).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* unit 字段 */}
          {values.kind === 'unit' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>类型 *</label>
                  <select value={values.unitType} onChange={(e) => set({ unitType: e.target.value })} className={inputCls}>
                    {UNIT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>区名</label>
                  <input value={values.district} onChange={(e) => set({ district: e.target.value })} className={inputCls} placeholder="如:浔阳区" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>联系人</label>
                  <input value={values.contactName} onChange={(e) => set({ contactName: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>联系电话</label>
                  <input value={values.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} className={inputCls} />
                </div>
              </div>
            </>
          )}

          {/* building 字段(znya 必填:type/usage/height/area/floors) */}
          {values.kind === 'building' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>建筑类型 *</label>
                  <input value={values.buildingType} onChange={(e) => set({ buildingType: e.target.value })} className={inputCls} placeholder="如:高层/地下" />
                </div>
                <div>
                  <label className={labelCls}>用途 *</label>
                  <input value={values.buildingUsage} onChange={(e) => set({ buildingUsage: e.target.value })} className={inputCls} placeholder="如:住院部" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>高度(m)*</label>
                  <input value={values.buildingHeight} onChange={(e) => set({ buildingHeight: e.target.value })} className={inputCls} placeholder="60" />
                </div>
                <div>
                  <label className={labelCls}>面积(㎡)*</label>
                  <input value={values.floorArea} onChange={(e) => set({ floorArea: e.target.value })} className={inputCls} placeholder="12000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>地上层数 *</label>
                  <input value={values.groundFloors} onChange={(e) => set({ groundFloors: e.target.value })} className={inputCls} placeholder="20" />
                </div>
                <div>
                  <label className={labelCls}>地下层数 *</label>
                  <input value={values.undergroundFloors} onChange={(e) => set({ undergroundFloors: e.target.value })} className={inputCls} placeholder="0" />
                </div>
              </div>
              <div>
                <label className={labelCls}>所属单位</label>
                <select value={values.keyUnitId} onChange={(e) => set({ keyUnitId: e.target.value })} className={inputCls}>
                  <option value="">不关联</option>
                  {keyUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </>
          )}

          {/* 地址 */}
          <div>
            <label className={labelCls}>地址</label>
            <input value={values.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} placeholder="地址描述" />
          </div>

          {/* 坐标(三来源,与坐标修正面板同套交互) */}
          <div className="rounded border border-line bg-bg-panel-2 px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-text-3">坐标 *{pickMode ? ' · 拾取中' : ''}</span>
              {values.lng != null && (
                <button onClick={() => set({ lng: null, lat: null })} className="text-[11px] text-text-3 transition hover:text-text-1">清除</button>
              )}
            </div>
            <div className={`font-mono text-[13px] ${values.lng != null ? 'text-cyan' : 'text-text-3'}`}>
              {values.lng != null && values.lat != null ? `${fmt(values.lng)}, ${fmt(values.lat)}` : '未设置(选择下方来源)'}
            </div>
          </div>
          <div>
            <div className="mb-1 text-text-3">① 地址查询</div>
            <div className="flex gap-1">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && address.trim() && onQuery(address.trim())}
                placeholder="输入地址(如:乐盈广场)"
                className={inputCls}
              />
              <button onClick={() => address.trim() && onQuery(address.trim())} className="rounded border border-line px-1.5 text-text-2 transition hover:text-text-1">
                {querying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </button>
            </div>
            {candidates.length > 0 && (
              <div className="mt-1 max-h-[100px] overflow-y-auto rounded border border-line bg-bg-panel">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => set({ lng: c.lng, lat: c.lat })}
                    className="block w-full truncate px-1.5 py-1 text-left text-[11px] text-text-1 transition hover:bg-white/10"
                    title={`${c.address} | ${c.lng.toFixed(5)},${c.lat.toFixed(5)}`}
                  >
                    {c.address}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onStartPick}
              disabled={pickMode}
              className={`flex items-center justify-center gap-1.5 rounded border px-2 py-1 transition ${
                pickMode ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-line text-text-2 hover:text-text-1'
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" /> {pickMode ? '点击地图…' : '② 地图拾取'}
            </button>
            <div className="flex gap-1">
              <input value={mLng} onChange={(e) => setMLng(e.target.value)} placeholder="经度" className={`${inputCls} font-mono`} />
              <input value={mLat} onChange={(e) => setMLat(e.target.value)} placeholder="纬度" className={`${inputCls} font-mono`} />
              <button
                onClick={() => {
                  const ln = parseFloat(mLng);
                  const la = parseFloat(mLat);
                  if (!Number.isNaN(ln) && !Number.isNaN(la)) set({ lng: ln, lat: la });
                }}
                className="shrink-0 rounded border border-line px-1.5 text-text-2 transition hover:text-text-1"
              >
                填入
              </button>
            </div>
          </div>

          {error && <div className="text-[11px] text-red-300">{error}</div>}

          <button
            onClick={onSave}
            disabled={saving}
            className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-[13px] transition ${
              saving ? 'border-line text-text-3' : 'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25'
            }`}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {mode === 'create' ? '创建' : '保存修改'}
          </button>

          {mode === 'edit' && onDelete && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-red-400/50 text-[13px] text-red-300 transition hover:bg-red-400/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除该{kindLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
