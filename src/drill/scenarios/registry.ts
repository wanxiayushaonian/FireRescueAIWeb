/**
 * Scenario Registry — 剧本注册表(Factory & Registry 模式)。
 *
 * 纯逻辑(无 React/DOM),可被 vitest 直接单测。
 * 剧本文件通过 registerScenario(def) 自注册;DrillView 通过 getScenario/listScenarios
 * 消费,不直接 import 具体剧本(解耦,新剧本零改动 UI)。
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.6
 */
import type { DrillScenarioDef } from './types';

/** 注册表内部存储(id → def)。 */
const REGISTRY = new Map<string, DrillScenarioDef>();

/** 默认剧本 id(DrillView 初始化用;启动时 registry 必须含此 id)。 */
export const DEFAULT_SCENARIO_ID = 'building-21';

/**
 * 注册一个剧本(剧本文件模块加载时调用)。
 * 重复 id 后注册覆盖先注册(registry 启动时确定性取决于 import 顺序,
 * 由 index.ts 显式 import 保证)。
 */
export function registerScenario(def: DrillScenarioDef): void {
  REGISTRY.set(def.id, def);
}

/** 取剧本(未注册返回 undefined;调用方处理)。 */
export function getScenario(id: string): DrillScenarioDef | undefined {
  return REGISTRY.get(id);
}

/**
 * 取默认剧本(必返回非空;未注册则 throw——registry 不变量)。
 * 用于组件 render 期取一个确定性非空剧本,避免 `DrillScenarioDef | undefined`
 * 散落到 UI。throw 封装在函数内(非 hook 前条件终止),不破坏 hooks 调用顺序。
 */
export function getDefaultScenario(): DrillScenarioDef {
  const def = REGISTRY.get(DEFAULT_SCENARIO_ID);
  if (!def) {
    throw new Error(
      `[scenario-registry] 默认剧本 '${DEFAULT_SCENARIO_ID}' 未注册;` +
        `确保 '@/drill/scenarios'(index.ts)被 import 以触发自注册。`,
    );
  }
  return def;
}

/**
 * 列出全部已注册剧本(DrillToolbar 下拉数据源)。
 * 按 id 字典序排序(稳定,不依赖 import 顺序)。
 */
export function listScenarios(): readonly DrillScenarioDef[] {
  return Array.from(REGISTRY.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

/** 清空注册表(仅测试用;生产不应调用)。 */
export function _clearRegistryForTests(): void {
  REGISTRY.clear();
}
