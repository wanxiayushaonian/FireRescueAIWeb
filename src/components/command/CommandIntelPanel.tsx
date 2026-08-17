'use client';

// 实战指挥 · 作战要素卡片(ref 5.5 左下角展示框):
// 周边水源分布及取水点 / 内部消防设施完好情况 / 着火物质理化性质 / 被困人员位置。
// 数据:水源=znya water-sources 建筑周边 bbox;设施=21号楼档案 facilities 状态;
// 物质/被困=警情类型 + 灾情变量(演示值标注)。选中警情变化时加载。
import { useEffect, useMemo, useState } from 'react';
import { Droplets, ShieldCheck, FlaskConical, Users } from 'lucide-react';
import { fetchWaterSourcesInBbox } from '@/api/water';
import { fetchBuildingProfile, DRILL_DEMO_BUILDING_ID } from '@/api/building-profile';
import type { Incident } from '@/mock/incidents';
import type { LiveVars } from '@/mock/liveChannel';

/** 着火物质理化性质(信息性静态表;演示用,后续可接 znya 物质库) */
const MATERIAL_KNOWN = {
  建筑火灾: {
    name: '建筑可燃物(固/电器类)',
    props: ['闪点不一(固材>200℃居多)', '受限空间易积聚烟气', '电气火忌直流水扑救带电设备'],
    agent: '水 / ABC 干粉 / 泡沫;电气设备先断电',
  },
  危化品: {
    name: '危化品(按品名核实)',
    props: ['闪点/爆炸极限依品名而定', '泄漏可形成蒸气云', '毒性/腐蚀性需防化处置'],
    agent: '依介质选型;严禁盲目用水',
  },
  抢险救援: {
    name: '非火灾警情',
    props: ['无燃烧物质', '以结构/人员救援为主'],
    agent: '破拆/顶撑/救生器材',
  },
} as const;

/** 被困位置(信息性;演示口径) */
const TRAPPED_LOCATION = ['着火层及相邻上层为主', '疏散通道/避难区优先核查', '结合搜救小组反馈更新'];

function Card({
  icon: Icon,
  title,
  loading,
  children,
}: {
  icon: React.ElementType;
  title: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line/60 bg-bg-panel-2/40 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-2">
        <Icon className="h-3.5 w-3.5 text-cyan" />
        {title}
      </div>
      {loading ? (
        <div className="py-2 text-[10px] text-text-3/70">加载中…</div>
      ) : (
        <div className="text-[11px] leading-relaxed text-text-2">{children}</div>
      )}
    </div>
  );
}

export default function CommandIntelPanel({
  incident,
  vars,
}: {
  incident: Incident | null;
  vars: LiveVars | null;
}) {
  // 周边水源(警情坐标周边 bbox)
  const [water, setWater] = useState<Array<{ name: string; type: string; km: number }>>([]);
  const [waterLoading, setWaterLoading] = useState(false);
  // 设施完好(21号楼档案,缓存一次)
  const [facility, setFacility] = useState<{ total: number; normal: number; abnormal: number } | null>(null);
  const [facilityLoading, setFacilityLoading] = useState(false);

  useEffect(() => {
    if (!incident) {
      setWater([]);
      return;
    }
    let alive = true;
    setWaterLoading(true);
    const d = 0.015;
    fetchWaterSourcesInBbox({
      minLng: incident.lng - d, minLat: incident.lat - d,
      maxLng: incident.lng + d, maxLat: incident.lat + d,
    })
      .then((rows) => {
        if (!alive) return;
        const km = (a: { lng: number; lat: number }): number => {
          const dx = (a.lng - incident.lng) * Math.cos(((incident.lat * Math.PI) / 180)) * 111.32;
          const dy = (a.lat - incident.lat) * 110.57;
          return Math.hypot(dx, dy);
        };
        setWater(
          rows
            .filter((w) => w.lng != null && w.lat != null)
            .map((w) => ({ name: w.name, type: w.type, km: km({ lng: w.lng!, lat: w.lat! }) }))
            .sort((a, b) => a.km - b.km)
            .slice(0, 4),
        );
        setWaterLoading(false);
      })
      .catch(() => {
        if (alive) {
          setWater([]);
          setWaterLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [incident]);

  useEffect(() => {
    if (facility || !incident) return;
    let alive = true;
    setFacilityLoading(true);
    fetchBuildingProfile(DRILL_DEMO_BUILDING_ID)
      .then((p) => {
        if (!alive) return;
        const total = p.facilities.length;
        const normal = p.facilities.filter((f) => f.statusNormalized === 'ok').length;
        setFacility({ total, normal, abnormal: total - normal });
        setFacilityLoading(false);
      })
      .catch(() => {
        if (alive) {
          setFacility(null);
          setFacilityLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident, facility]);

  const material = useMemo(
    () => (incident ? (MATERIAL_KNOWN[incident.type] ?? MATERIAL_KNOWN.建筑火灾) : null),
    [incident],
  );
  const trapped = vars?.trapped ?? (incident ? 0 : null);

  if (!incident) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {['周边水源', '设施完好', '物质理化', '被困位置'].map((t) => (
          <div key={t} className="rounded-md border border-line/40 bg-bg-panel-2/20 px-2.5 py-2 text-[11px] text-text-3">
            {t} · 请先选择警情
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Card icon={Droplets} title="周边水源 · 取水点" loading={waterLoading}>
        {water.length === 0 ? (
          <span className="text-text-3/70">周边 1.5km 无水源数据</span>
        ) : (
          <ul className="space-y-0.5">
            {water.map((w, i) => (
              <li key={i} className="truncate">
                <span className="text-text-1">{w.name}</span>
                <span className="text-text-3"> {w.type} · {Math.round(w.km * 1000)}m</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={ShieldCheck} title="内部设施完好情况" loading={facilityLoading}>
        {facility ? (
          <span>
            21号楼档案设施 {facility.total} 项:
            <span className="text-green"> 正常 {facility.normal}</span>
            {facility.abnormal > 0 && <span className="text-orange"> / 异常 {facility.abnormal}</span>}
          </span>
        ) : (
          <span className="text-text-3/70">档案未连通</span>
        )}
      </Card>

      <Card icon={FlaskConical} title="着火物质理化性质">
        {material ? (
          <div>
            <div className="text-text-1">{material.name}</div>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-3 text-text-3">
              {material.props.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
            <div className="mt-1 text-text-2">适用: {material.agent}</div>
          </div>
        ) : (
          <span className="text-text-3/70">—</span>
        )}
      </Card>

      <Card icon={Users} title="被困人员位置">
        <div>
          <span className="text-text-1">被困 {trapped ?? '—'} 人</span>
          {vars?.temperature != null && <span className="text-text-3"> · 现场 {Math.round(vars.temperature)}℃</span>}
        </div>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-3 text-text-3">
          {TRAPPED_LOCATION.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
