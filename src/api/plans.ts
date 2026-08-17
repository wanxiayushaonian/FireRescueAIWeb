// 预案库数据访问层：web /api/business/plans(BFF 代理 znya)→ 正式预案库(emergency_plans)。
// 演练预案评估通过后在此建档(draft)，预案库面板「正式预案」页签读取列表。
import { fetchAll } from '@/lib/http';

export interface ZnyaPlan {
  id: string;
  name: string;
  key_building_id: string;
  key_building_name?: string | null;
  plan_type?: string;
  status?: string;
  version?: number;
  review_status?: string | null;
  completion_rate?: number;
  command_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** 正式预案列表（分页拼齐，按更新时间倒序） */
export async function fetchPlans(): Promise<ZnyaPlan[]> {
  return fetchAll<ZnyaPlan>('/api/business/plans');
}

/**
 * 建档：新建 draft 预案记录（免审批）。返回创建的预案；请求失败返回 null（调用方降级）。
 * 后端 EmergencyPlanCreate：name / key_building_id 必填，plan_type 默认 fire。
 */
export async function createPlan(payload: {
  name: string;
  key_building_id: string;
  plan_type?: string;
}): Promise<ZnyaPlan | null> {
  try {
    const res = await fetch('/api/business/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as ZnyaPlan;
  } catch {
    return null;
  }
}
