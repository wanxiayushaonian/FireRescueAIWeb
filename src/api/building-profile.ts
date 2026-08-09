// 建筑档案数据访问层:web /api/business/*(BFF 代理 znya)→ RealBuildingProfile。
// 并发拉取 key_buildings/{id} 详情 + fire_facilities(ref_type=key_building 过滤),
// 经 lib/building-mapper.mapBuildingProfile 组装为演练推演可用的领域模型。
import { getJson } from '@/lib/http';
import {
  mapBuildingProfile,
  type ZnyaKeyBuildingDetail,
  type ZnyaFireFacility,
  type RealBuildingProfile,
} from '@/lib/building-mapper';

/** 21号楼(乐盈广场):演练对抗 MVP 示范建筑,scene_id=465718852859613184。 */
export const DRILL_DEMO_BUILDING_ID = '1c2d4772-831d-4c77-b88a-f9565ad589c7';

interface ZnyaFacilityPage {
  items: ZnyaFireFacility[];
  total: number;
}

/**
 * 拉取建筑档案:并发请求详情 + 设施,组装为 RealBuildingProfile。
 * 设施按 ref_type=key_building + ref_id={buildingId} 过滤(ref_id/ref_type 是 znya crud_factory 列表过滤参数)。
 */
export async function fetchBuildingProfile(buildingId: string): Promise<RealBuildingProfile> {
  const [detail, facilityPage] = await Promise.all([
    getJson<ZnyaKeyBuildingDetail>(`/api/business/key-buildings/${buildingId}`),
    getJson<ZnyaFacilityPage>(
      `/api/business/fire-facilities?ref_type=key_building&ref_id=${encodeURIComponent(buildingId)}&page=1&page_size=100`,
    ),
  ]);
  return mapBuildingProfile(detail, facilityPage.items ?? []);
}
