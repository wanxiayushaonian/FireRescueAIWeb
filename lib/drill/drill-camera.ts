/**
 * drill-camera.ts — 演练 3D/相机联动的纯函数解析层(2026-08-18 事件树整改)。
 *
 * 职责:从演练事件里解析楼层 spec(供 storyIdsForFloorSpec 消费)、按火势等级
 * 映射聚焦范围(蔓延近似)。纯逻辑无 React/DOM 依赖,vitest 直接单测。
 *
 * 楼层表述兼容:'5F' / '5层' / 'B1' / 'B1F' / '-1F' / '13-15F'(取首层)。
 */

/** 从自由文本(location/description)解析楼层 spec(供 floor-focus 的 spec 格式)。
 *  返回如 '5F' / 'B1F';解析不到返回 null。 */
export function extractFloorSpec(text: string | undefined | null): string | null {
  if (!text) return null;
  // 地下:B1 / B1F / B1层 / 地下1层
  const basement = text.match(/B\s*(\d+)\s*[F层]?/i) ?? text.match(/地下\s*(\d+)\s*层?/);
  if (basement) return `B${basement[1]}F`;
  // 地上:5F / 5层(排除纯度数/速度等场景——楼层表述后必跟 F 或 层)
  const floor = text.match(/(\d{1,2})\s*(?:F|层)/i);
  if (floor) return `${floor[1]}F`;
  return null;
}

/** 事件 payload/描述 → 楼层 spec(location 优先,description 兜底)。 */
export function floorSpecFromEvent(payload: Readonly<Record<string, unknown>>): string | null {
  const loc = typeof payload.location === 'string' ? payload.location : undefined;
  const desc = typeof payload.description === 'string' ? payload.description : undefined;
  return extractFloorSpec(loc) ?? extractFloorSpec(desc);
}

/**
 * 火势等级 → 聚焦楼层集合(蔓延近似,确定性规则):
 * - 1-2 级:单层聚焦着火层
 * - 3 级:着火层 + 上 1 层(炸开)
 * - 4 级:着火层 + 上 2 层(炸开)
 * - 0(熄灭):返回 null(调用方恢复全楼视角)
 * fireFloor 形如 '5F';返回 spec 数组如 ['5F','6F']。地下/顶层越界由调用方
 * storyIdsForFloorSpec 自然过滤(找不到的楼层无 story)。
 */
export function spreadFloorSpecs(fireFloor: string, fireLevel: number): string[] | null {
  if (fireLevel <= 0) return null;
  const m = fireFloor.match(/^(\d+)F$/i);
  if (!m) return [fireFloor]; // 地下层不扩散(B1 向上逻辑不直观,保持单层)
  const base = Number(m[1]);
  const up = fireLevel >= 4 ? 2 : fireLevel >= 3 ? 1 : 0;
  const specs: string[] = [];
  for (let i = 0; i <= up; i += 1) specs.push(`${base + i}F`);
  return specs;
}
