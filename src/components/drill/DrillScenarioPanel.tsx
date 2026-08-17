'use client';

// 演练灾情参数设置条(ref 4.1):手动设定 / 随机生成 / 按建筑档案针对性生成。
// 应用后重建演练(DrillView handleStart 用 customScenario + 动态 briefing)。
// running 时禁用(running 中改参无意义);只读参数条横向排布。
import { useState } from 'react';
import { Dices, Sparkles, Check, Settings2, ChevronDown } from 'lucide-react';
import type { DisasterScenario } from '@/lib/drill/disaster-state';
import {
  MATERIAL_OPTIONS,
  generateRandomScenario,
  generateBuildingScenario,
  buildScenarioBriefing,
} from '@/lib/drill/scenario-gen';
import { fetchBuildingProfile, DRILL_DEMO_BUILDING_ID } from '@/api/building-profile';
import { showToast } from '@/components/Toast';

export interface ScenarioApplyResult {
  scenario: DisasterScenario;
  briefing: string;
}

const MATERIAL_LABELS: Record<string, string> = {
  电气: '电气火灾',
  燃气: '燃气泄漏',
  油类: '油类火灾',
  普通固体: '固体火灾',
  危化品: '危化品泄漏',
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-[10px] text-text-3">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'h-7 rounded border border-line bg-bg-panel-2 px-2 text-[12px] text-text-1 focus:border-line-glow focus:outline-none';

export default function DrillScenarioPanel({
  baseScenario,
  disabled,
  onApply,
}: {
  baseScenario: DisasterScenario;
  disabled: boolean;
  onApply: (r: ScenarioApplyResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState<string>(baseScenario.material);
  const [trappedCount, setTrappedCount] = useState(baseScenario.trappedCount);
  const [fireLevel, setFireLevel] = useState(baseScenario.initialFireLevel ?? 1);
  const [windDirection, setWindDirection] = useState(baseScenario.windDirection);
  const [windSpeed, setWindSpeed] = useState(baseScenario.windSpeed);
  const [fireFloor, setFireFloor] = useState(baseScenario.fireFloor ?? '5F');
  const [buildingLoading, setBuildingLoading] = useState(false);

  const fillForm = (s: DisasterScenario): void => {
    setMaterial(s.material);
    setTrappedCount(s.trappedCount);
    setFireLevel(s.initialFireLevel ?? 1);
    setWindDirection(s.windDirection);
    setWindSpeed(s.windSpeed);
    setFireFloor(s.fireFloor ?? fireFloor);
  };

  const apply = (): void => {
    const scenario: DisasterScenario = {
      ...baseScenario,
      material,
      trappedCount,
      windDirection,
      windSpeed,
      initialFireLevel: fireLevel,
      fireFloor: fireFloor.trim() || undefined,
    };
    onApply({ scenario, briefing: buildScenarioBriefing(scenario, scenario.fireFloor) });
  };

  const randomize = (): void => {
    fillForm(generateRandomScenario(baseScenario));
  };

  const fromBuilding = (): void => {
    setBuildingLoading(true);
    void fetchBuildingProfile(DRILL_DEMO_BUILDING_ID)
      .then((profile) => {
        const s = generateBuildingScenario(baseScenario, profile);
        if (!s) {
          showToast('档案无可用的重点部位,改用随机');
          fillForm(generateRandomScenario(baseScenario));
          return;
        }
        fillForm(s);
        showToast(`已按档案针对性生成:${s.fireFloor ?? '?'} ${s.material}`);
      })
      .catch(() => {
        showToast('档案加载失败,改用随机');
        fillForm(generateRandomScenario(baseScenario));
      })
      .finally(() => setBuildingLoading(false));
  };

  return (
    <div className="rounded-md border border-line bg-bg-panel/85 backdrop-blur-[8px]">
      {/* 折叠头:标题 + 三按钮 */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-text-2 transition hover:text-cyan"
          title="展开/收起灾情参数"
        >
          <Settings2 className="h-3.5 w-3.5 text-cyan" />
          灾情参数
          <ChevronDown className={`h-3 w-3 text-text-3 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        <span className="text-[10px] text-text-3">初始灾情 · 启动演练前可调</span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={fromBuilding}
            disabled={disabled || buildingLoading}
            className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[10px] text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
            title="按建筑档案(重点部位/功能)针对性生成"
          >
            <Sparkles className="h-3 w-3" />
            {buildingLoading ? '生成中…' : '按建筑生成'}
          </button>
          <button
            onClick={randomize}
            disabled={disabled}
            className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[10px] text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
            title="随机生成(合理范围)"
          >
            <Dices className="h-3 w-3" />
            随机
          </button>
          <button
            onClick={apply}
            disabled={disabled}
            className="flex items-center gap-1 rounded bg-cyan/20 px-2.5 py-1 text-[10px] font-medium text-cyan transition hover:bg-cyan/30 disabled:opacity-40"
            title="应用参数(重新启动演练时生效)"
          >
            <Check className="h-3 w-3" />
            应用参数
          </button>
        </div>
      </div>

      {/* 展开:参数表单 */}
      {open && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line/60 px-2.5 py-2">
          <Field label="着火楼层">
            <input
              value={fireFloor}
              onChange={(e) => setFireFloor(e.target.value)}
              disabled={disabled}
              className={`${inputCls} w-16`}
              placeholder="5F"
            />
          </Field>
          <Field label="物质">
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              disabled={disabled}
              className={`${inputCls} w-28`}
            >
              {MATERIAL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {MATERIAL_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="被困">
            <input
              type="number"
              min={0}
              max={30}
              value={trappedCount}
              onChange={(e) => setTrappedCount(Math.max(0, Number(e.target.value) || 0))}
              disabled={disabled}
              className={`${inputCls} w-14`}
            />
            <span className="text-[10px] text-text-3">人</span>
          </Field>
          <Field label="初始火势">
            <select
              value={fireLevel}
              onChange={(e) => setFireLevel(Number(e.target.value))}
              disabled={disabled}
              className={`${inputCls} w-16`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 级
                </option>
              ))}
            </select>
          </Field>
          <Field label="风向">
            <input
              type="number"
              min={0}
              max={359}
              value={windDirection}
              onChange={(e) => setWindDirection(Math.max(0, Math.min(359, Number(e.target.value) || 0)))}
              disabled={disabled}
              className={`${inputCls} w-14`}
            />
            <span className="text-[10px] text-text-3">°</span>
          </Field>
          <Field label="风速">
            <input
              type="number"
              min={0}
              max={20}
              value={windSpeed}
              onChange={(e) => setWindSpeed(Math.max(0, Number(e.target.value) || 0))}
              disabled={disabled}
              className={`${inputCls} w-14`}
            />
            <span className="text-[10px] text-text-3">m/s</span>
          </Field>
          <span className="ml-auto text-[9px] text-text-3/70">
            应用后需重新启动演练;运行中参数锁定
          </span>
        </div>
      )}
    </div>
  );
}
