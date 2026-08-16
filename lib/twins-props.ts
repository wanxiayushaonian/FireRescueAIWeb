// 孪生实例详情 → 信息卡属性区的防御性提炼。
// detail 返回结构平台未文档化(模板 fire-devices 路由同款防御式解析)。
// 平台实测形态(21D 演示包):顶层 twins_name/category_name 等基础字段 +
// twins_instance_property_list 属性定义数组({property_name, property_format_value, ...}),
// 故优先按属性表提炼(中文标签直出);结构不符时兜底递归扁平化。

export interface TwinProperty {
  key: string;
  value: string;
}

const MAX_VALUE_LEN = 60;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return '';
}

/** 顶层基础字段(名称已在卡片标题;identifier 已作类型标签;icon/type 是噪声)。 */
const BASE_KEYS = ['twins_name', 'category_name'];

/** 平台保留的摆放属性(几何变换,CPS 导入/生成,多种 level 变体):对档案无信息量,过滤。 */
const PLACEMENT_KEYS = new Set(['position', 'scale', 'rotation']);

/**
 * 主入口:属性定义表优先(用户在建模后端配置的业务属性,中文标签直出),
 * 基础字段补充;两者皆空时兜底递归扁平化。
 * 摆放属性(position/scale/rotation)过滤;空值跳过、key 去重(首见保留)、
 * 超长值截断,最多 maxEntries 条。
 */
export function extractTwinProperties(detail: unknown, maxEntries = 16): TwinProperty[] {
  const obj = asRecord(detail);
  if (!obj) return [];
  const out: TwinProperty[] = [];
  const seen = new Set<string>();
  const push = (key: string, value: string): void => {
    const k = key.trim();
    // JSON 串值(多边形/质心坐标等)是元数据噪声;布尔串转中文
    const raw = value.trim();
    if (!k || !raw) return;
    const v = raw === 'true' ? '是' : raw === 'false' ? '否' : raw;
    if (v.startsWith('{') || v.startsWith('[')) return;
    if (seen.has(k) || out.length >= maxEntries) return;
    seen.add(k);
    out.push({ key: k, value: v.length > MAX_VALUE_LEN ? `${v.slice(0, MAX_VALUE_LEN)}…` : v });
  };
  // 1. 属性定义表:property_name(中文标签) > twins_property_identifier;格式化值优先
  const list = Array.isArray(obj.twins_instance_property_list) ? obj.twins_instance_property_list : [];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const identifier = str(rec.twins_property_identifier);
    if (PLACEMENT_KEYS.has(identifier)) continue;
    push(
      str(rec.property_name) || identifier,
      str(rec.property_format_value) || str(rec.property_value),
    );
  }
  // 2. 顶层基础字段
  for (const k of BASE_KEYS) push(k, str(obj[k]));
  // 3. 兜底:无属性表结构 → 通用递归扁平化
  if (out.length === 0) return flattenTwinProperties(detail, maxEntries);
  return out;
}

const MAX_DEPTH = 4;

/** 展示噪声:末段为裸 id/ids/uuid/guid,或任意 `xxx_id` 结尾 —— 纯标识字段对看板无信息量。 */
function isNoiseKey(key: string): boolean {
  const seg = key.split('.').pop() ?? '';
  return /^_*(id|ids|uuid|guid)$/i.test(seg) || /_id$/i.test(seg);
}

/**
 * 递归扁平化兜底:嵌套对象/数组下钻(深度上限 4),叶子标量收集为 `a.b.c` 点路径。
 * 过滤噪声 key/空值/重复 key(首见保留);标量数组拼顿号串。
 */
export function flattenTwinProperties(detail: unknown, maxEntries = 16): TwinProperty[] {
  const out: TwinProperty[] = [];
  const seen = new Set<string>();
  const push = (key: string, value: string): void => {
    if (!key || !value || isNoiseKey(key) || seen.has(key) || out.length >= maxEntries) return;
    seen.add(key);
    out.push({ key, value: value.length > MAX_VALUE_LEN ? `${value.slice(0, MAX_VALUE_LEN)}…` : value });
  };
  const visit = (value: unknown, path: string, depth: number): void => {
    if (value === null || value === undefined || out.length >= maxEntries) return;
    if (Array.isArray(value)) {
      // 数组只下钻对象元素,标量数组(标签列表等)拼为顿号串
      const scalars = value.filter((v) => typeof v !== 'object' || v === null);
      if (scalars.length > 0 && scalars.length === value.length) {
        push(path, scalars.map((v) => str(v)).filter(Boolean).join('、'));
        return;
      }
      if (depth < MAX_DEPTH) for (const item of value) visit(item, path, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      if (depth >= MAX_DEPTH) return;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, path ? `${path}.${k}` : k, depth + 1);
      }
      return;
    }
    push(path, str(value));
  };
  visit(detail, '', 0);
  return out;
}
