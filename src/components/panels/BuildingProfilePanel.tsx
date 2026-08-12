// 单建筑档案面板(对象总览模块):znya key_buildings + fire_facilities → 真实档案展示。
// 替代 mock:5 个分组(概况/消防系统/关键部位/防火设计/联系人),全部来自 znya 真实数据。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  ChevronDown,
  Copy,
  Droplets,
  DoorOpen,
  FlameKindling,
  Phone,
  Landmark,
  Layers,
  MapPin,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FetchState } from '@/mock/types';
import { addSceneAction } from '@/mock/sceneLog';
import StatusBadge, { statusVariantOf } from '@/components/StatusBadge';
import PanelStateView from '@/components/PanelStateView';
import { showToast } from '@/components/Toast';
import { fetchKeyBuildings } from '@/api/key-buildings';
import { fetchBuildingProfile, DRILL_DEMO_BUILDING_ID } from '@/api/building-profile';
import type { KeyBuilding } from '@/lib/key-building-mapper';
import type {
  RealBuildingProfile,
  BuildingOverview,
  FireSystemItem,
  BuildingKeyFloor,
  StructureDesign,
  BuildingSurrounding,
} from '@/lib/building-mapper';
import { FloorDisplayPanel } from '@/components/FloorDisplayPanel';

const GROUPS = ['建筑概况', '消防系统', '关键部位', '防火设计', '联系人'] as const;
type GroupName = (typeof GROUPS)[number];

export interface BuildingProfilePanelProps {
  /** 外部受控的建筑 ID;不传则内部自管理(默认 21号楼)。 */
  buildingId?: string;
  onBuildingChange?: (id: string) => void;
}

export default function BuildingProfilePanel({ buildingId, onBuildingChange }: BuildingProfilePanelProps) {
  // 建筑列表(供下拉切换):首屏拉一次,空回落保证始终能渲染
  const [buildings, setBuildings] = useState<KeyBuilding[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchKeyBuildings();
        if (!cancelled) setBuildings(list);
      } catch {
        /* 拉取失败保留下拉空态,详情区显示 error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [innerBuildingId, setInnerBuildingId] = useState<string>(DRILL_DEMO_BUILDING_ID);
  const curBuildingId = buildingId ?? innerBuildingId;
  // 当前选中建筑元信息(下拉选中项 / 列表未到位时按 id 占位)
  const meta = useMemo<KeyBuilding | { id: string; name: string }>(() => {
    const found = buildings.find((b) => b.id === curBuildingId);
    if (found) return found;
    return { id: curBuildingId, name: '建筑加载中' };
  }, [buildings, curBuildingId]);

  const [state, setState] = useState<FetchState>('loading');
  const [profile, setProfile] = useState<RealBuildingProfile | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    建筑概况: true,
    消防系统: true,
  });

  const load = useCallback(async (bid: string) => {
    setState('loading');
    try {
      const data = await fetchBuildingProfile(bid);
      setProfile(data);
      setState('ok');
    } catch {
      setProfile(null);
      setState('error');
    }
  }, []);

  useEffect(() => {
    load(curBuildingId);
  }, [curBuildingId, load]);

  const switchBuilding = (id: string) => {
    if (id === curBuildingId) return;
    if (onBuildingChange) onBuildingChange(id);
    else setInnerBuildingId(id);
    const b = buildings.find((x) => x.id === id);
    if (b && b.lng && b.lat) {
      addSceneAction({ action: 'resetView', target: '恢复园区俯瞰视角', source: '面板' });
      addSceneAction({
        action: 'flyTo',
        target: `${b.name} (${b.lng}, ${b.lat})`,
        params: { lng: b.lng, lat: b.lat },
        source: '面板',
      });
    }
    showToast('已切换建筑');
  };

  const toggleGroup = (g: string) => setExpanded((prev) => ({ ...prev, [g]: !prev[g] }));

  const focusFacility = (f: FireSystemItem) => {
    if (profile?.overview.lng && profile.overview.lat) {
      addSceneAction({
        action: 'flyTo',
        target: `${f.name} (${profile.overview.lng}, ${profile.overview.lat})`,
        params: { lng: profile.overview.lng, lat: profile.overview.lat },
        source: '面板',
      });
    }
    addSceneAction({ action: 'highlight', target: `${f.id} ${f.name}`, params: { id: f.id }, source: '面板' });
    showToast('已写入场景动作日志');
  };

  const focusKeyFloor = (kf: BuildingKeyFloor) => {
    addSceneAction({ action: 'switchFloor', target: `切换至 ${kf.floor}`, params: { floor: kf.floor }, source: '面板' });
    addSceneAction({ action: 'highlight', target: `${kf.id} ${kf.name}`, params: { id: kf.id, floor: kf.floor }, source: '面板' });
    showToast('已写入场景动作日志');
  };

  const focusRefuge = (refuge: string) => {
    addSceneAction({ action: 'switchFloor', target: `切换至 ${refuge}`, params: { floor: refuge }, source: '面板' });
    addSceneAction({ action: 'batchHighlight', target: `${refuge} 避难层设施`, params: { floor: refuge }, source: '面板' });
    showToast('已写入场景动作日志');
  };

  const copyPhone = (text: string) => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).catch(() => {});
    showToast('已复制联系电话');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部:建筑名 + 摘要 + 切换 */}
      <div className="border-b border-line px-4 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[16px] font-bold text-text-1">{meta.name}</span>
            </div>
            <div className="mt-0.5 truncate text-[13px] text-text-2">
              {'buildingType' in meta && meta.buildingType ? `${meta.buildingType} · ` : ''}
              {'buildingUsage' in meta && meta.buildingUsage ? meta.buildingUsage : ''}
              {!('buildingType' in meta) && profile ? `${profile.overview.buildingType} · ${profile.overview.buildingUsage}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="relative">
              <select
                value={curBuildingId}
                onChange={(e) => switchBuilding(e.target.value)}
                className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
                title="切换建筑"
              >
                {buildings.length === 0 ? (
                  <option value={curBuildingId}>建筑列表加载中</option>
                ) : (
                  buildings.map((b) => (
                    <option key={b.id} value={b.id}>切换建筑：{b.name}</option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
            </div>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      {state !== 'ok' ? (
        <div className="min-h-0 flex-1">
          <PanelStateView
            state={state}
            onRetry={state === 'error' ? () => load(curBuildingId) : undefined}
            skeletonRows={9}
          />
        </div>
      ) : (
        profile && (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:thin]">
            {/* 楼层展示面板（3D 场景联动） */}
            <FloorDisplayPanel />
            {GROUPS.map((g) => (
              <AccordionGroup
                key={g}
                title={g}
                icon={groupIcon(g)}
                open={!!expanded[g]}
                onToggle={() => toggleGroup(g)}
              >
                {g === '建筑概况' && <OverviewGroup overview={profile.overview} />}
                {g === '消防系统' && <FireSystemsGroup facilities={profile.facilities} onRow={focusFacility} />}
                {g === '关键部位' && <KeyFloorsGroup keyFloors={profile.keyFloors} onRow={focusKeyFloor} />}
                {g === '防火设计' && (
                  <StructureGroup
                    designs={profile.structureDesigns}
                    surroundings={profile.surroundings}
                    onRefuge={focusRefuge}
                  />
                )}
                {g === '联系人' && <ContactsGroup profile={profile} onCopyPhone={copyPhone} />}
              </AccordionGroup>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function groupIcon(g: GroupName): LucideIcon {
  switch (g) {
    case '建筑概况': return Building2;
    case '消防系统': return Droplets;
    case '关键部位': return DoorOpen;
    case '防火设计': return FlameKindling;
    case '联系人': return Phone;
  }
}

function AccordionGroup({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-line bg-bg-panel-2/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg-panel-2"
      >
        <Icon className="h-3.5 w-3.5 text-cyan" />
        <span className="text-[13px] font-bold text-text-1">{title}</span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t border-line/60 px-3 py-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const rowStagger = {
  hidden: { opacity: 0, x: -6 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.25 },
  }),
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-[13px] leading-5">
      <span className="w-20 shrink-0 text-text-3">{label}</span>
      <span className="min-w-0 flex-1 text-text-1">{children}</span>
    </div>
  );
}

function floorsText(o: BuildingOverview): string {
  const parts: string[] = [];
  if (o.groundFloors != null) parts.push(`地上 ${o.groundFloors} 层`);
  if (o.undergroundFloors != null) parts.push(`地下 ${o.undergroundFloors} 层`);
  return parts.length ? parts.join(' / ') : '—';
}

function fmtNum(n: number | null, suffix = ''): string {
  return n == null ? '—' : `${n}${suffix}`;
}

function OverviewGroup({ overview }: { overview: BuildingOverview }) {
  const o = overview;
  const fields: Array<{ label: string; node: React.ReactNode }> = [
    { label: '单位名称', node: o.name },
    {
      label: '地址',
      node: (
        <span className="inline-flex items-start gap-1">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-text-3" />
          <span>{o.address || '—'}</span>
        </span>
      ),
    },
    { label: '建筑类型', node: o.buildingType || '—' },
    { label: '使用性质', node: o.buildingUsage || '—' },
    { label: '层数', node: floorsText(o) },
    { label: '建筑高度', node: fmtNum(o.heightMeters, ' m') },
    { label: '占地面积', node: fmtNum(o.floorAreaSqm, ' m²') },
    { label: '标准层面积', node: fmtNum(o.standardFloorAreaSqm, ' m²') },
    { label: '建成年份', node: fmtNum(o.builtYear) },
    { label: '产权单位', node: o.propertyOwner || '—' },
    { label: '管理单位', node: o.managementUnit || '—' },
    { label: '数据完整度', node: fmtNum(o.completionRate, '%') },
  ];
  return (
    <div>
      {fields.map((f, i) => (
        <motion.div key={f.label} custom={i} variants={rowStagger} initial="hidden" animate="show">
          <Field label={f.label}>{f.node}</Field>
        </motion.div>
      ))}
    </div>
  );
}

function FireSystemsGroup({
  facilities,
  onRow,
}: {
  facilities: FireSystemItem[];
  onRow: (f: FireSystemItem) => void;
}) {
  if (facilities.length === 0) {
    return <div className="py-4 text-center text-[12px] text-text-3">暂无登记消防系统</div>;
  }
  return (
    <div>
      <div className="mb-1.5 px-2 py-1 text-[12px] font-bold text-text-2">
        建筑级消防系统 <span className="ml-1 font-mono text-[11px] text-text-3">{facilities.length} 项</span>
      </div>
      {facilities.map((f, i) => (
        <motion.button
          key={f.id}
          custom={i}
          variants={rowStagger}
          initial="hidden"
          animate="show"
          onClick={() => onRow(f)}
          className="group flex w-full cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">{f.name}</span>
            <StatusBadge
              label={f.status || '正常'}
              variant={statusVariantOf(f.status || '正常')}
              pulse={f.status === '告警'}
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-3">
            {f.locationPath && <span>位置：{f.locationPath}</span>}
            {f.quantityCapacity && <span>容量：{f.quantityCapacity}</span>}
            {f.inspectionDate && <span>巡检：{f.inspectionDate}</span>}
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function KeyFloorsGroup({
  keyFloors,
  onRow,
}: {
  keyFloors: BuildingKeyFloor[];
  onRow: (kf: BuildingKeyFloor) => void;
}) {
  if (keyFloors.length === 0) {
    return <div className="py-4 text-center text-[12px] text-text-3">暂无重点楼层登记</div>;
  }
  return (
    <div>
      <div className="mb-1.5 px-2 py-1 text-[12px] font-bold text-text-2">
        重点楼层 / 功能区 <span className="ml-1 font-mono text-[11px] text-text-3">{keyFloors.length} 项</span>
      </div>
      {keyFloors.map((kf, i) => (
        <motion.button
          key={kf.id}
          custom={i}
          variants={rowStagger}
          initial="hidden"
          animate="show"
          onClick={() => onRow(kf)}
          className="group flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]"
        >
          <span className="mt-0.5 shrink-0 rounded border border-line bg-bg-panel-2 px-1.5 py-px font-mono text-[11px] text-cyan">
            {kf.floor}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] text-text-1">{kf.name}</span>
              <span className="shrink-0 text-[11px] text-text-3">{kf.func}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] text-text-3">
              {kf.fireHazard}{kf.hazardSource ? ` · ${kf.hazardSource}` : ''}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-3">
              {kf.exitCount != null && <span>出口 {kf.exitCount}</span>}
              {kf.responsiblePerson && <span>负责人 {kf.responsiblePerson}</span>}
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function StructureGroup({
  designs,
  surroundings,
  onRefuge,
}: {
  designs: StructureDesign[];
  surroundings: BuildingSurrounding[];
  onRefuge: (refuge: string) => void;
}) {
  const d = designs[0];
  const s2 = surroundings[0];
  const refugeList = useMemo(() => {
    if (!d?.refugeFloor) return [];
    return d.refugeFloor
      .split(/[,，、\s]+/)
      .map((x) => x.trim())
      .filter((x): x is string => !!x);
  }, [d?.refugeFloor]);

  return (
    <div>
      {d && (
        <>
          <div className="mb-1 px-2 py-1 text-[12px] font-bold text-text-2">结构防火设计</div>
          <Field label="结构类型">{d.structureType || '—'}</Field>
          <Field label="耐火等级">{d.fireResistanceRating || '—'}</Field>
          <Field label="防火分区">{d.fireCompartmentCount != null ? `${d.fireCompartmentCount} 个` : '—'}</Field>
          <Field label="最大分区面积">{fmtNum(d.maxFireCompartmentArea, ' m²')}</Field>
          <Field label="防烟分区">{d.smokeCompartmentCount != null ? `${d.smokeCompartmentCount} 个` : '—'}</Field>
          <Field label="楼梯类型">{d.stairType || '—'}</Field>
          <Field label="防火墙">{d.firewall || '—'}</Field>
          <Field label="保温材料">{d.insulationMaterial || '—'}</Field>
        </>
      )}

      {/* 消防电梯(可点击切换楼层) */}
      {d && (
        <div className="mb-1.5 mt-2">
          <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-bold text-text-2">
            <Layers className="h-3 w-3 text-cyan-dim" />
            消防电梯
            <span className="font-mono text-[11px] font-normal text-text-3">
              {d.fireElevatorCount != null ? `${d.fireElevatorCount} 部` : '—'}
            </span>
          </div>
          {d.fireElevatorLocation && (
            <div className="px-2 py-0.5 text-[12px] text-text-3">{d.fireElevatorLocation}</div>
          )}
        </div>
      )}

      {/* 避难层(可点击 → switchFloor) */}
      {refugeList.length > 0 && (
        <div className="mb-1.5">
          <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-bold text-text-2">
            <Landmark className="h-3 w-3 text-cyan-dim" />
            避难层 <span className="font-mono text-[11px] font-normal text-text-3">{refugeList.length} 处</span>
          </div>
          {refugeList.map((r) => (
            <button
              key={r}
              onClick={() => onRefuge(r)}
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]"
            >
              <span className="shrink-0 rounded border border-line bg-bg-panel-2 px-1.5 py-px font-mono text-[11px] text-cyan">
                {r}
              </span>
              <span className="text-[13px] text-text-1">避难层</span>
              {d.refugeFloorArea != null && (
                <span className="ml-auto text-[11px] text-text-3">面积 {d.refugeFloorArea} m²</span>
              )}
            </button>
          ))}
        </div>
      )}

      {s2 && (
        <>
          <div className="mb-1 mt-2 px-2 py-1 text-[12px] font-bold text-text-2">周边与扑救条件</div>
          <Field label="周边道路">{s2.surroundingRoads || '—'}</Field>
          <Field label="消防车道">{s2.fireLane || '—'}</Field>
          <Field label="车道尺寸">
            {s2.fireLaneWidth != null || s2.fireLaneHeight != null
              ? `宽 ${fmtNum(s2.fireLaneWidth, ' m')} × 高 ${fmtNum(s2.fireLaneHeight, ' m')}`
              : '—'}
          </Field>
          <Field label="扑救场地">{s2.aerialOperationSite || '—'}</Field>
          {s2.aerialSiteLocation && <Field label="场地位置">{s2.aerialSiteLocation}</Field>}
          {s2.aerialSiteSize && <Field label="场地尺寸">{s2.aerialSiteSize}</Field>}
          {s2.aerialSiteLoad && <Field label="场地荷载">{s2.aerialSiteLoad}</Field>}
          {s2.rescueWindow && <Field label="救援窗">{s2.rescueWindow}</Field>}
          {s2.naturalWaterSource && <Field label="天然水源">{s2.naturalWaterSource}</Field>}
          {s2.municipalHydrant && <Field label="市政消火栓">{s2.municipalHydrant}</Field>}
          {s2.adjacentBuildingSpacing && <Field label="毗邻建筑">{s2.adjacentBuildingSpacing}</Field>}
        </>
      )}

      {!d && !s2 && <div className="py-4 text-center text-[12px] text-text-3">暂无结构 / 周边数据</div>}
    </div>
  );
}

function ContactsGroup({
  profile,
  onCopyPhone,
}: {
  profile: RealBuildingProfile;
  onCopyPhone: (t: string) => void;
}) {
  const c = profile.contacts;
  const rows: Array<{ label: string; node: React.ReactNode }> = [
    {
      label: '联系电话',
      node: c.contactPhone ? (
        <button
          onClick={() => onCopyPhone(c.contactPhone)}
          className="inline-flex cursor-pointer items-center gap-1 font-mono text-cyan transition hover:brightness-110"
          title="点击复制"
        >
          {c.contactPhone}
          <Copy className="h-3 w-3" />
        </button>
      ) : (
        '—'
      ),
    },
    { label: '联系人', node: c.contactName || '—' },
    { label: '产权单位', node: c.propertyOwner || '—' },
    { label: '管理单位', node: c.managementUnit || '—' },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <motion.div key={r.label} custom={i} variants={rowStagger} initial="hidden" animate="show">
          <Field label={r.label}>{r.node}</Field>
        </motion.div>
      ))}
    </div>
  );
}
