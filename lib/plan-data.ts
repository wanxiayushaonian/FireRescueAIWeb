/**
 * 预案数据源抽象。
 *
 * 当前返回内置演示数据（MOCK_PLANS），界面以「演示数据」角标标识来源。
 * 接入真实预案 API 时只需替换 getPlans 实现并保持返回 EmergencyPlan[]：
 *   - 真实接口字段需与 lib/plan-mock-data.ts 的 EmergencyPlan 对齐
 *     （storyIds / routeIds / deviceIds 均为 twins_instance_id，执行时直接传给 SDK）
 *   - 建议约定：GET {接口}/api/emergency-plans → { data: EmergencyPlan[] }
 *   - 返回 source: 'api' 后，「演示数据」角标会自动消失
 */

import { MOCK_PLANS, type EmergencyPlan } from './plan-mock-data';

export type PlanSource = 'mock' | 'api';

export async function getPlans(): Promise<{ source: PlanSource; plans: EmergencyPlan[] }> {
  return { source: 'mock', plans: MOCK_PLANS };
}
