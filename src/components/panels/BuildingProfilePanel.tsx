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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BuildingProfile, Facility, FetchState } from '@/mock/types';
import { BUILDING_LIST, fetchBuildingProfile } from '@/mock/building';
import { addSceneAction } from '@/mock/sceneLog';
import StatusBadge, { statusVariantOf } from '@/components/StatusBadge';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';
import ReadinessBadge from '@/components/panels/ReadinessBadge';
import { showToast } from '@/components/Toast';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

const GROUPS = ['建筑概况', '供水设施', '关键部位', '室内固定消防设施', '联系人'] as const;

export interface BuildingProfilePanelProps {
  /** 外部受控的建筑 ID；不传则内部自管理 */
  buildingId?: string;
  onBuildingChange?: (id: string) => void;
}

export default function BuildingProfilePanel({ buildingId, onBuildingChange }: BuildingProfilePanelProps) {
  const [innerBuildingId, setInnerBuildingId] = useState('jm');
  const curBuildingId = buildingId ?? innerBuildingId;
  const meta = BUILDING_LIST.find((b) => b.id === curBuildingId) ?? BUILDING_LIST[0];

  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');
  const [profile, setProfile] = useState<BuildingProfile | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    建筑概况: true,
    室内固定消防设施: true,
  });

  const load = useCallback(async (bid: string, s: FetchState) => {
    setState('loading');
    try {
      const data = await fetchBuildingProfile(bid, { state: s });
      setProfile(data);
      setState(data ? 'ok' : 'empty');
    } catch {
      setProfile(null);
      setState('error');
    }
  }, []);

  useEffect(() => {
    load(curBuildingId, demoState);
  }, [curBuildingId, demoState, load]);

  const switchBuilding = (id: string) => {
    const m = BUILDING_LIST.find((b) => b.id === id);
    if (!m || id === curBuildingId) return;
    if (onBuildingChange) onBuildingChange(id);
    else setInnerBuildingId(id);
    addSceneAction({ action: 'resetView', target: '恢复园区俯瞰视角', source: '面板' });
    addSceneAction({
      action: 'flyTo',
      target: `${m.name} (${m.lng}, ${m.lat})`,
      params: { lng: m.lng, lat: m.lat },
      source: '面板',
    });
    showToast('已切换建筑 · 演示数据');
  };

  const toggleGroup = (g: string) => setExpanded((prev) => ({ ...prev, [g]: !prev[g] }));

  // 点击供水设施 / 关键部位行 → flyTo + highlight
  const focusFacility = (f: Facility) => {
    addSceneAction({
      action: 'flyTo',
      target: `${f.name} (${meta.lng}, ${meta.lat})`,
      params: { lng: meta.lng, lat: meta.lat },
      source: '面板',
    });
    addSceneAction({ action: 'highlight', target: `${f.id} ${f.name}`, params: { id: f.id }, source: '面板' });
    showToast('已写入场景动作日志 · 演示数据');
  };

  // 点击室内设施行 → switchFloor + highlight
  const focusIndoor = (floor: string, item: { id: string; name: string }) => {
    addSceneAction({ action: 'switchFloor', target: `切换至 ${floor}`, params: { floor }, source: '面板' });
    addSceneAction({ action: 'highlight', target: `${item.id} ${item.name}`, params: { id: item.id, floor }, source: '面板' });
    showToast('已写入场景动作日志 · 演示数据');
  };

  // 点击避难层 → switchFloor + batchHighlight
  const focusRefuge = (f: Facility) => {
    const floor = f.name.replace('避难层 ', '');
    addSceneAction({ action: 'switchFloor', target: `切换至 ${floor}`, params: { floor }, source: '面板' });
    addSceneAction({ action: 'batchHighlight', target: `${floor} 避难层设施`, params: { floor }, source: '面板' });
    showToast('已写入场景动作日志 · 演示数据');
  };

  const copyPhone = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    showToast('已复制消控室电话 · 演示数据');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：建筑名 + 摘要 + 状态演示 */}
      <div className="border-b border-line px-4 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[16px] font-bold text-text-1">{meta.name}</span>
              <ReadinessBadge buildingName={meta.name} />
              <DemoTag />
            </div>
            <div className="mt-0.5 text-[13px] text-text-2">
              {meta.floors} · {meta.structure}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StateSelect value={demoState} onChange={setDemoState} title="状态演示" prefix="状态演示" />
            <div className="relative">
              <select
                value={curBuildingId}
                onChange={(e) => switchBuilding(e.target.value)}
                className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
                title="切换建筑"
              >
                {BUILDING_LIST.map((b) => (
                  <option key={b.id} value={b.id}>切换建筑：{b.name}</option>
                ))}
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
            onRetry={state === 'error' ? () => load(curBuildingId, 'ok') : undefined}
            skeletonRows={9}
          />
        </div>
      ) : (
        profile && (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:thin]">
            {GROUPS.map((g) => (
              <AccordionGroup
                key={g}
                title={g}
                icon={groupIcon(g)}
                open={!!expanded[g]}
                onToggle={() => toggleGroup(g)}
              >
                {g === '建筑概况' && <OverviewGroup profile={profile} />}
                {g === '供水设施' && <WaterGroup profile={profile} onRow={focusFacility} />}
                {g === '关键部位' && <KeyPartsGroup profile={profile} onRow={focusFacility} onRefuge={focusRefuge} />}
                {g === '室内固定消防设施' && <IndoorGroup profile={profile} onRow={focusIndoor} />}
                {g === '联系人' && <ContactsGroup profile={profile} onCopyPhone={copyPhone} />}
              </AccordionGroup>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function StateSelect({
  value,
  onChange,
  title,
  prefix,
}: {
  value: FetchState;
  onChange: (v: FetchState) => void;
  title: string;
  prefix: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FetchState)}
        className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
        title={title}
      >
        {STATE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{prefix}：{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
    </div>
  );
}

function groupIcon(g: string): LucideIcon {
  switch (g) {
    case '建筑概况': return Building2;
    case '供水设施': return Droplets;
    case '关键部位': return DoorOpen;
    case '室内固定消防设施': return FlameKindling;
    default: return Phone;
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
      <span className="w-16 shrink-0 text-text-3">{label}</span>
      <span className="min-w-0 flex-1 text-text-1">{children}</span>
    </div>
  );
}

function OverviewGroup({ profile }: { profile: BuildingProfile }) {
  const o = profile.overview;
  const fields: Array<{ label: string; node: React.ReactNode }> = [
    { label: '单位名称', node: o.name },
    { label: '地址', node: o.address },
    { label: '结构', node: o.structure },
    { label: '层数', node: o.floors },
    { label: '面积', node: o.area },
    {
      label: '功能分区',
      node: (
        <span className="flex flex-wrap gap-1">
          {o.zones.map((z) => (
            <span key={z} className="rounded border border-line bg-bg-panel-2 px-1.5 py-px text-[12px] text-text-2">{z}</span>
          ))}
        </span>
      ),
    },
    { label: '毗邻', node: o.adjacent.join(' / ') },
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

function FacilityRow({
  facility,
  onClick,
  right,
}: {
  facility: Facility;
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-text-1">{facility.name}</div>
        {facility.location && <div className="truncate text-[12px] text-text-3">{facility.location}</div>}
      </div>
      {right ?? <StatusBadge label={facility.status} variant={statusVariantOf(facility.status)} pulse={facility.status === '告警'} />}
    </button>
  );
}

function SubList({ title, items, onRow }: { title: string; items: Facility[]; onRow?: (f: Facility) => void }) {
  return (
    <div className="mb-1.5">
      <div className="px-2 py-1 text-[12px] font-bold text-text-2">
        {title} <span className="ml-1 font-mono text-[11px] text-text-3">{items.length} 项</span>
      </div>
      {items.map((f) => (
        <FacilityRow key={f.id} facility={f} onClick={onRow ? () => onRow(f) : undefined} />
      ))}
    </div>
  );
}

function WaterGroup({ profile, onRow }: { profile: BuildingProfile; onRow: (f: Facility) => void }) {
  const w = profile.waterSupply;
  return (
    <div>
      <SubList title="消防水池" items={w.pools} onRow={onRow} />
      <SubList title="消防水泵" items={w.pumps} onRow={onRow} />
      <SubList title="水泵接合器" items={w.adapters} onRow={onRow} />
      <SubList title="室外消火栓" items={w.outdoorHydrants} onRow={onRow} />
    </div>
  );
}

function KeyPartsGroup({
  profile,
  onRow,
  onRefuge,
}: {
  profile: BuildingProfile;
  onRow: (f: Facility) => void;
  onRefuge: (f: Facility) => void;
}) {
  const k = profile.keyParts;
  return (
    <div>
      <SubList title="首层安全出口" items={k.exits} onRow={onRow} />
      <SubList title="消防电梯" items={k.fireElevators} onRow={onRow} />
      <SubList title="防火分区" items={k.fireCompartments} onRow={onRow} />
      <SubList title="消控室" items={[k.controlRoom]} onRow={onRow} />
      <div className="mb-1.5">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-bold text-text-2">
          <Landmark className="h-3 w-3 text-cyan-dim" />
          避难层 <span className="font-mono text-[11px] font-normal text-text-3">{k.refugeFloors.length} 层</span>
        </div>
        {k.refugeFloors.map((f) => (
          <FacilityRow key={f.id} facility={f} onClick={() => onRefuge(f)} />
        ))}
      </div>
    </div>
  );
}

function IndoorGroup({
  profile,
  onRow,
}: {
  profile: BuildingProfile;
  onRow: (floor: string, item: { id: string; name: string }) => void;
}) {
  const floors = profile.indoorFacilities;
  const [sel, setSel] = useState(0);
  const cur = floors[Math.min(sel, floors.length - 1)];

  const alarmFloors = useMemo(
    () => new Set(floors.filter((f) => f.items.some((it) => it.status !== '正常')).map((f) => f.floor)),
    [floors],
  );

  if (!cur) return <FloorEmpty />;
  const total = cur.items.length;
  const normal = cur.items.filter((i) => i.status === '正常').length;
  const warn = cur.items.filter((i) => i.status === '告警').length;
  const offline = total - normal - warn;

  return (
    <div>
      {/* 楼层 Tabs */}
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {floors.map((f, i) => (
          <button
            key={f.floor}
            onClick={() => setSel(i)}
            className={`relative shrink-0 rounded-md border px-2 py-1 font-mono text-[12px] transition ${
              i === sel
                ? 'border-cyan/60 bg-cyan/10 text-cyan shadow-[0_0_8px_rgba(34,211,238,.2)]'
                : 'border-line bg-bg-panel-2 text-text-2 hover:border-line-glow hover:text-text-1'
            }`}
          >
            {f.floor}
            {alarmFloors.has(f.floor) && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* 统计行 */}
      {total > 0 && (
        <div className="mb-1.5 flex items-center gap-1 rounded-md border border-line bg-bg-panel-2/60 px-2 py-1.5 text-[12px] text-text-2">
          <Layers className="h-3.5 w-3.5 text-cyan-dim" />
          本层设施 <span className="font-num text-text-1">{total}</span> 项 · 正常
          <span className="font-num text-green">{normal}</span> · 告警
          <span className="font-num text-amber">{warn}</span> · 离线
          <span className="font-num text-red">{offline}</span>
        </div>
      )}

      {/* 设施列表 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={cur.floor}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
        >
          {total === 0 ? (
            <FloorEmpty />
          ) : (
            cur.items.map((it) => (
              <button
                key={it.id}
                onClick={() => onRow(cur.floor, it)}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]"
              >
                <span className="shrink-0 font-mono text-[12px] text-text-3">{it.id}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">{it.name}</span>
                <span className="shrink-0 rounded border border-line px-1 py-px text-[11px] text-text-3">{it.type}</span>
                <StatusBadge label={it.status} variant={statusVariantOf(it.status)} pulse={it.status === '告警'} />
              </button>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FloorEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <img src="/empty-box.svg" alt="" className="h-[72px] w-[96px] opacity-80" />
      <div className="text-[12px] text-text-3">该楼层暂无登记设施 · 演示数据</div>
    </div>
  );
}

function ContactsGroup({ profile, onCopyPhone }: { profile: BuildingProfile; onCopyPhone: (t: string) => void }) {
  const c = profile.contacts;
  const rows: Array<{ label: string; node: React.ReactNode }> = [
    {
      label: '消控室电话',
      node: (
        <button
          onClick={() => onCopyPhone(c.controlRoomPhone)}
          className="inline-flex cursor-pointer items-center gap-1 font-mono text-cyan transition hover:brightness-110"
          title="点击复制"
        >
          {c.controlRoomPhone}
          <Copy className="h-3 w-3" />
        </button>
      ),
    },
    { label: '法人', node: c.legalPerson },
    { label: '消防负责人', node: c.fireManager },
    { label: '专兼职管理人', node: c.partTimeManager },
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

/** 左上「当前对象」小卡（受控组件，需与面板共享 buildingId 状态） */
export function BuildingSwitcherCard({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const meta = BUILDING_LIST.find((b) => b.id === value) ?? BUILDING_LIST[0];
  return (
    <div className="w-[280px] rounded-lg border border-line bg-bg-panel/90 p-3 shadow-xl backdrop-blur-[8px]">
      <div className="mb-1 flex items-center gap-2 text-[12px] text-text-3">
        当前对象
        <DemoTag />
      </div>
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0 text-cyan" />
        <span className="truncate text-[14px] font-bold text-text-1">{meta.name}（演示数据）</span>
      </div>
      <div className="mt-0.5 truncate pl-6 text-[12px] text-text-2">{meta.address}</div>
      <div className="relative mt-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-7 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
        >
          {BUILDING_LIST.map((b) => (
            <option key={b.id} value={b.id}>切换建筑：{b.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
      </div>
    </div>
  );
}
