// 业务查询客户端:web BFF /api/business/*(经 WEB_BFF_URL)→ znya 业务数据。
// 与 bff-client.ts 同模式(独立子包,不 import 前端 lib/),但聚焦 znya 业务接口而非 ustudio 场景树。
// 业务查询工具(query_building_profile / query_facilities / query_key_parts)的数据来源。
//
// 信任模型:mcp→BFF 走 loopback/私网部署,信任靠网络层(非 header 鉴权)。
// BFF buildProxyHeaders(见 web/lib/znya-proxy.ts)只转 authorization+content-type,
// x-app-key 不被验证;mcp 侧不再发 x-app-key(旧实现是无效的死配置)。
//
// 字段语义与 znya schema 对齐:
//   - key_buildings(重点建筑):含嵌套 structure_designs / surroundings / key_floors / drawings
//   - fire_facilities(消防设施):ref_type=key_building + ref_id={building_id} 关联到建筑
// 见 lib/building-mapper.ts(web 端)与 znya server/app/schemas/key_building.py。

const BFF_URL = (process.env.WEB_BFF_URL || 'http://localhost:3000').replace(/\/$/, '');
const BFF_TIMEOUT_MS = 8000;

/** 业务查询超时包装。mcp→BFF 信任靠网络层(loopback/私网),非 header 鉴权。 */
async function businessFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(BFF_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  let res: Response;
  try {
    res = await fetch(`${BFF_URL}${path}`, {
      ...init,
      signal,
      headers: { ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(`BFF ${path} 网络错误或超时(${BFF_TIMEOUT_MS}ms): ${(e as Error).message}`);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    const snippet = detail ? ` | ${detail.slice(0, 500)}` : '';
    throw new Error(`BFF ${path} failed: ${res.status} ${res.statusText}${snippet}`);
  }
  return (await res.json()) as T;
}

// ---- znya 原始形态(read-only,与 lib/building-mapper.ts Znya* 接口对齐) ----

export interface ZnyaBuildingKeyFloor {
  id: string;
  name: string;
  floor: string;
  function: string;
  fire_hazard: string;
  hazard_source?: string | null;
  internal_facilities?: string | null;
  access_route?: string | null;
  exit_count?: number | null;
  responsible_person?: string | null;
  remark?: string | null;
}

export interface ZnyaKeyBuildingDetail {
  id: string;
  name: string;
  credit_code?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  building_type?: string | null;
  building_usage?: string | null;
  built_year?: number | null;
  building_height?: number | null;
  floor_area?: number | null;
  ground_floors?: number | null;
  underground_floors?: number | null;
  standard_floor_area?: number | null;
  building_length?: number | null;
  building_width?: number | null;
  property_owner?: string | null;
  management_unit?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  scene_id?: string | null;
  structure_designs?: unknown[];
  surroundings?: unknown[];
  key_floors?: ZnyaBuildingKeyFloor[];
}

export interface ZnyaFireFacility {
  id: string;
  ref_type: string;
  ref_id: string;
  facility_type: string;
  name: string;
  status: string;
  location_path?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  extra_attrs?: Record<string, unknown> | null;
  ai_description?: string | null;
}

interface ZnyaFacilityPage {
  items: ZnyaFireFacility[];
  total: number;
}

// ---- 工具返回的精简领域形态(面向 agent 上下文消费,字段更扁平、关键字段突出) ----

export interface BuildingProfileSummary {
  id: string;
  name: string;
  address: string;
  sceneId: string | null;
  location: { lng: number | null; lat: number | null };
  buildingType: string;
  buildingUsage: string;
  builtYear: number | null;
  heightMeters: number | null;
  groundFloors: number | null;
  undergroundFloors: number | null;
  floorAreaSqm: number | null;
  propertyOwner: string;
  managementUnit: string;
  contactName: string;
  contactPhone: string;
  structureDesignCount: number;
  surroundingCount: number;
  keyFloorCount: number;
  // 透传原始嵌套结构(agent 可深入读 structure_designs/surroundings,字段 schema 与 znya 对齐)
  structureDesigns: unknown[];
  surroundings: unknown[];
}

export interface FacilitySummary {
  id: string;
  facilityType: string;
  name: string;
  status: string;
  locationPath: string;
  lng: number | null;
  lat: number | null;
  aiDescription: string;
  extraAttrs: Record<string, unknown> | null;
}

export interface KeyPartSummary {
  id: string;
  name: string;
  floor: string;
  func: string;
  fireHazard: string;
  hazardSource: string;
  internalFacilities: string;
  accessRoute: string;
  exitCount: number | null;
  responsiblePerson: string;
}

const s = (v: unknown): string => (v == null ? '' : String(v));

/**
 * 拉取建筑档案概要(znya key_buildings/{id} 详情)。
 * 透传 structure_designs/surroundings 原始数组供 agent 深入查询;
 * key_floors 经 getKeyParts 单独暴露(避免重复拉取 + 字段聚焦)。
 */
export async function getBuildingProfile(buildingId: string): Promise<BuildingProfileSummary> {
  const d = await businessFetch<ZnyaKeyBuildingDetail>(
    `/api/business/key-buildings/${encodeURIComponent(buildingId)}`,
  );
  return {
    id: d.id,
    name: s(d.name),
    address: s(d.address),
    sceneId: d.scene_id ?? null,
    location: { lng: d.longitude ?? null, lat: d.latitude ?? null },
    buildingType: s(d.building_type),
    buildingUsage: s(d.building_usage),
    builtYear: d.built_year ?? null,
    heightMeters: d.building_height ?? null,
    groundFloors: d.ground_floors ?? null,
    undergroundFloors: d.underground_floors ?? null,
    floorAreaSqm: d.floor_area ?? null,
    propertyOwner: s(d.property_owner),
    managementUnit: s(d.management_unit),
    contactName: s(d.contact_name),
    contactPhone: s(d.contact_phone),
    structureDesignCount: (d.structure_designs ?? []).length,
    surroundingCount: (d.surroundings ?? []).length,
    keyFloorCount: (d.key_floors ?? []).length,
    structureDesigns: d.structure_designs ?? [],
    surroundings: d.surroundings ?? [],
  };
}

/**
 * 拉取建筑的消防设施清单(ref_type=key_building + ref_id={buildingId})。
 * 可选过滤:
 *   - type: facility_type 模糊匹配(包含子串,大小写不敏感)
 *   - floor: location_path 模糊匹配(包含子串,如 "三层" / "B1")—— znya fire_facilities 用
 *     自由文本 location_path 表达楼层,无结构化字段,故用子串匹配。
 */
export async function getFacilities(
  buildingId: string,
  opts: { floor?: string; type?: string } = {},
): Promise<FacilitySummary[]> {
  // znya cap: page_size ≤ 100(bbox 视口查询除外);用 100 拿全量单页。
  const page = await businessFetch<ZnyaFacilityPage>(
    `/api/business/fire-facilities?ref_type=key_building&ref_id=${encodeURIComponent(buildingId)}&page=1&page_size=100`,
  );
  const items = page.items ?? [];
  const typeFilter = opts.type?.trim().toLowerCase();
  const floorFilter = opts.floor?.trim();
  return items
    .filter((f) => !typeFilter || s(f.facility_type).toLowerCase().includes(typeFilter))
    .filter((f) => !floorFilter || s(f.location_path).includes(floorFilter))
    .map((f) => ({
      id: f.id,
      facilityType: s(f.facility_type),
      name: s(f.name) || s(f.facility_type),
      status: s(f.status),
      locationPath: s(f.location_path),
      lng: f.longitude ?? null,
      lat: f.latitude ?? null,
      aiDescription: s(f.ai_description),
      extraAttrs: f.extra_attrs ?? null,
    }));
}

/**
 * 拉取重点部位聚合(key_floors,嵌套在 key_buildings/{id} 详情里)。
 * 与 getBuildingProfile 共享一次详情请求的成本 —— 这里独立发请求是为工具语义清晰;
 * 调用方若同时需要两者,应分别调用(各发一次请求,znya 响应快,可接受)。
 */
export async function getKeyParts(buildingId: string): Promise<KeyPartSummary[]> {
  const d = await businessFetch<ZnyaKeyBuildingDetail>(
    `/api/business/key-buildings/${encodeURIComponent(buildingId)}`,
  );
  return (d.key_floors ?? []).map((k) => ({
    id: k.id,
    name: s(k.name),
    floor: s(k.floor),
    func: s(k.function),
    fireHazard: s(k.fire_hazard),
    hazardSource: s(k.hazard_source),
    internalFacilities: s(k.internal_facilities),
    accessRoute: s(k.access_route),
    exitCount: k.exit_count ?? null,
    responsiblePerson: s(k.responsible_person),
  }));
}

// ---- 知识库 RAG 检索(znya pgvector 191 chunks 真实预案)----

/** 历史预案知识库(由 seed_kb_from_plans.py 灌入的 12 个真实预案)。 */
export const DEFAULT_KB_ID = '265da1fb-a9c9-4046-b732-00b811b8564c';

export interface KnowledgeChunk {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  score: number;
  chunk_index: number;
  kb_id?: string;
}

/**
 * 检索历史预案知识库(znya pgvector 余弦检索,经 web BFF /api/business 代理 + service token)。
 * agent 用本工具回答消防预案/风险/处置类问题(基于真实预案,非 LLM 通用知识)。
 */
export async function getKnowledge(
  query: string,
  opts: { topK?: number; kbId?: string } = {},
): Promise<{ query: string; kbId: string; count: number; chunks: KnowledgeChunk[] }> {
  const kbId = opts.kbId || DEFAULT_KB_ID;
  const topK = opts.topK ?? 5;
  const r = await businessFetch<{ items: KnowledgeChunk[] }>(
    `/api/business/knowledge/bases/${encodeURIComponent(kbId)}/retrieve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK }),
    },
  );
  const chunks = r.items ?? [];
  return { query, kbId, count: chunks.length, chunks };
}
