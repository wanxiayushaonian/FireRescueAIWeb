import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Layers, FlaskConical, Users, Crosshair, ChevronDown, Minus, Plus, Zap } from 'lucide-react';
import type { FetchState } from '@/mock/types';
import {
  FIRE_MATERIALS,
  buildDrillPlan,
  fetchBuildingFloors,
  fetchDrillBuildings,
} from '@/mock/drill';
import type { DrillBuilding } from '@/mock/drill';
import { beginGenerate, finishGenerate, subscribeDrill } from '@/mock/drillStore';
import { beginConfrontation } from '@/mock/drillStore';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';
import ConfrontationPanel from '@/components/drill/ConfrontationPanel';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

const selectCls =
  'h-9 w-full appearance-none rounded-md border border-line bg-bg-panel-2 pl-8 pr-7 text-[13px] text-text-1 focus:border-line-glow focus:outline-none';
const labelCls = 'mb-1 block text-[13px] text-text-2';

function SelectWrap({ icon: Icon, children }: { icon: typeof Building2; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
      {children}
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
    </div>
  );
}

export default function ScenarioPanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');
  const [buildings, setBuildings] = useState<DrillBuilding[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [floorLoading, setFloorLoading] = useState(false);

  const [buildingId, setBuildingId] = useState('');
  const [floor, setFloor] = useState('');
  const [material, setMaterial] = useState<string>(FIRE_MATERIALS[0]);
  const [trapped, setTrapped] = useState(3);
  const [picking, setPicking] = useState(false);
  const [bump, setBump] = useState(0);

  const loadBuildings = useCallback(async (s: FetchState) => {
    setState('loading');
    if (s === 'loading') return;
    try {
      const list = await fetchDrillBuildings({ state: s });
      setBuildings(list);
      setState(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { loadBuildings(demoState); }, [demoState, loadBuildings]);

  // 切换建筑联动刷新楼层
  useEffect(() => {
    if (!buildingId) { setFloors([]); setFloor(''); return; }
    let cancelled = false;
    setFloorLoading(true);
    fetchBuildingFloors(buildingId)
      .then((fs) => { if (!cancelled) { setFloors(fs); setFloor(''); } })
      .catch(() => { if (!cancelled) setFloors([]); })
      .finally(() => { if (!cancelled) setFloorLoading(false); });
    return () => { cancelled = true; };
  }, [buildingId]);

  const building = buildings.find((b) => b.id === buildingId);
  const canGenerate = !!buildingId && !!floor && !floorLoading;

  // 外部（智能体）写入灾情参数时同步表单：onOpenPanel('drill-scenario') 会经 drillStore 广播 scenario
  const lastGenRef = useRef(0);
  const pendingFloorRef = useRef<string | null>(null);
  useEffect(
    () =>
      subscribeDrill((s) => {
        if (s.scenario && s.generation !== lastGenRef.current) {
          lastGenRef.current = s.generation;
          pendingFloorRef.current = s.scenario.floor;
          setBuildingId(s.scenario.buildingId);
          setMaterial(s.scenario.material);
          setTrapped(s.scenario.trapped);
        }
      }),
    [],
  );
  // 楼层选项加载完成后再回填楼层（建筑切换会异步拉取楼层列表）
  useEffect(() => {
    if (pendingFloorRef.current && floors.includes(pendingFloorRef.current)) {
      setFloor(pendingFloorRef.current);
      pendingFloorRef.current = null;
    }
  }, [floors]);

  // 场景选点（模拟）：1.4s 选点动画后自动填入楼层并写日志
  const handlePickPoint = () => {
    if (!buildingId || picking) return;
    setPicking(true);
    window.setTimeout(() => {
      const b = buildings.find((x) => x.id === buildingId);
      const list = b?.floors ?? [];
      const above = list.filter((f) => f.endsWith('F'));
      const picked = above[Math.min(4, Math.max(0, above.length - 1))] ?? '5F';
      setFloor(picked);
      setPicking(false);
      addSceneAction({ action: 'addMarker', target: `着火点 @${picked}`, params: { building: b?.name, floor: picked }, source: '面板' });
      showToast(`已选定着火点：${b?.name ?? ''} ${picked} · 演示数据`);
    }, 1400);
  };

  const step = (d: number) => {
    setTrapped((v) => Math.min(99, Math.max(0, v + d)));
    setBump((n) => n + 1);
  };

  const handleGenerate = () => {
    if (!canGenerate || !building) return;
    const scenario = {
      buildingId,
      buildingName: building.name,
      floor,
      material,
      trapped,
    };
    beginGenerate(scenario);
    // 预案内容即刻就绪，由预案输出面板负责分组流式展示
    window.setTimeout(() => finishGenerate(buildDrillPlan(scenario)), 600);
    showToast('灾情设定已生成，预案输出智能体推演中 · 演示数据');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 对抗模式二级视图（Portal 全屏覆盖，inactive 时渲染 null） */}
      <ConfrontationPanel />
      {/* 工具行：状态演示 */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] text-text-3">
          <Zap className="h-3.5 w-3.5 text-cyan" /> 灾情参数（设定后点「生成灾情设定」）
        </span>
        <div className="relative">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            className="h-8 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-7 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
            title="状态演示"
          >
            {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>状态演示：{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {state !== 'ok' ? (
        state === 'empty' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
            <div className="text-[13px] text-text-2">暂无可选建筑 · 演示数据</div>
          </div>
        ) : (
          <PanelStateView state={state} onRetry={() => loadBuildings('ok')} skeletonRows={6} />
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            className="flex flex-col gap-4"
          >
            {/* 着火建筑 */}
            <motion.div variants={{ hidden: { y: 8, opacity: 0 }, show: { y: 0, opacity: 1 } }}>
              <label className={labelCls}>着火建筑</label>
              <SelectWrap icon={Building2}>
                <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={selectCls}>
                  <option value="">请选择建筑</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </SelectWrap>
            </motion.div>

            {/* 着火楼层 + 场景选点 */}
            <motion.div variants={{ hidden: { y: 8, opacity: 0 }, show: { y: 0, opacity: 1 } }}>
              <label className={labelCls}>着火楼层 {floorLoading && <span className="text-text-3">（联动刷新中…）</span>}</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SelectWrap icon={Layers}>
                    <select
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      disabled={!buildingId || floorLoading}
                      className={`${selectCls} disabled:opacity-40`}
                    >
                      <option value="">{buildingId ? '请选择楼层' : '先选择建筑'}</option>
                      {floors.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </SelectWrap>
                </div>
                <button
                  onClick={handlePickPoint}
                  disabled={!buildingId || picking}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-cyan/60 px-3 text-[12px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.35)] disabled:opacity-40"
                >
                  <Crosshair className={`h-3.5 w-3.5 ${picking ? 'animate-spin' : ''}`} />
                  {picking ? '选点中…' : '场景选点（模拟）'}
                </button>
              </div>
              <AnimatePresence>
                {picking && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-cyan/50 bg-cyan/5 px-3 py-2 text-[12px] text-cyan">
                      <motion.span
                        animate={{ rotate: 360, scale: [1, 1.15, 1] }}
                        transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.2, repeat: Infinity } }}
                      >
                        <Crosshair className="h-4 w-4" />
                      </motion.span>
                      请点击场景选择着火点（模拟）· 演示数据
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 着火物质 */}
            <motion.div variants={{ hidden: { y: 8, opacity: 0 }, show: { y: 0, opacity: 1 } }}>
              <label className={labelCls}>着火物质</label>
              <SelectWrap icon={FlaskConical}>
                <select value={material} onChange={(e) => setMaterial(e.target.value)} className={selectCls}>
                  {FIRE_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </SelectWrap>
            </motion.div>

            {/* 被困人数步进器 */}
            <motion.div variants={{ hidden: { y: 8, opacity: 0 }, show: { y: 0, opacity: 1 } }}>
              <label className={labelCls}>被困人数</label>
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-text-3" />
                <button
                  onClick={() => step(-1)}
                  disabled={trapped <= 0}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-bg-panel-2 text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <motion.div
                  key={bump}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className="flex h-9 w-16 items-center justify-center rounded-md border border-line bg-bg-panel-2 font-mono text-[16px] text-text-1"
                >
                  {trapped}
                </motion.div>
                <button
                  onClick={() => step(1)}
                  disabled={trapped >= 99}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-bg-panel-2 text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="text-[12px] text-text-3">范围 0-99 人</span>
              </div>
            </motion.div>

            {/* 生成按钮 */}
            <motion.div variants={{ hidden: { y: 8, opacity: 0 }, show: { y: 0, opacity: 1 } }} className="pt-1">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`h-10 w-full rounded-md text-[14px] font-bold transition ${
                  canGenerate
                    ? 'bg-cyan text-bg-deep hover:brightness-110 hover:shadow-[0_0_16px_rgba(34,211,238,.45)] active:brightness-90'
                    : 'cursor-not-allowed bg-bg-panel-2 text-text-3'
                }`}
              >
                生成灾情设定
              </button>
              {!canGenerate && (
                <div className="mt-1.5 text-center text-[12px] text-text-3">请先完善着火位置信息</div>
              )}
              {/* 进入对抗模式（二级界面）：预案输出智能体随机生成灾情 + 对抗智能体主动特情 */}
              <button
                onClick={() => beginConfrontation(demoState)}
                className="mt-2 h-9 w-full rounded-md border border-orange/70 text-[13px] font-bold text-orange transition hover:bg-orange/10 hover:shadow-[0_0_12px_rgba(249,115,22,.35)]"
              >
                进入对抗模式 →
              </button>
              <div className="mt-3 flex justify-center"><DemoTag /></div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
