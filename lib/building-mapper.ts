// 建筑档案映射:znya key_buildings(详情)+ fire_facilities → RealBuildingProfile。
// 纯函数,不 import src/(类型用 import type,运行时无依赖)。供 src/api/building-profile.ts 组装。
// 设计依据:znya 实际响应(见 /home/ljb/program/FireRescueAI/znya_jjxf119/server/app/schemas/key_building.py)。
import type { FetchState } from '../src/mock/types';

// ---- znya 原始响应形态(read-only 快照,字段与 znya schema 对齐) ----

export interface ZnyaStructureDesign {
  id?: string;
  structure_type?: string | null;
  fire_resistance_rating?: string | null;
  fire_compartment_count?: number | null;
  max_fire_compartment_area?: number | null;
  smoke_compartment_count?: number | null;
  stair_type?: string | null;
  total_stair_width?: number | null;
  fire_elevator_count?: number | null;
  fire_elevator_location?: string | null;
  refuge_floor?: string | null;
  refuge_floor_area?: number | null;
  fire_shutter_location?: string | null;
  firewall?: string | null;
  insulation_material?: string | null;
  curtain_wall?: string | null;
  remark?: string | null;
}

export interface ZnyaBuildingSurrounding {
  id?: string;
  surrounding_roads?: string | null;
  fire_lane?: string | null;
  fire_lane_width?: number | null;
  fire_lane_height?: number | null;
  fire_lane_turning_radius?: number | null;
  aerial_operation_site?: string | null;
  aerial_site_location?: string | null;
  aerial_site_size?: string | null;
  aerial_site_load?: string | null;
  rescue_window?: string | null;
  natural_water_source?: string | null;
  municipal_hydrant?: string | null;
  adjacent_building_spacing?: string | null;
}

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

/** znya key_buildings/{id} 详情响应(包含嵌套 structure_designs/surroundings/key_floors/drawings)。 */
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
  district_code?: string | null;
  key_unit_id?: string | null;
  scene_id?: string | null;
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
  status?: string | null;
  completion_rate?: number | null;
  structure_designs?: ZnyaStructureDesign[];
  surroundings?: ZnyaBuildingSurrounding[];
  key_floors?: ZnyaBuildingKeyFloor[];
  drawings?: unknown[];
}

/** znya fire_facilities 响应项(ref_type=key_building 关联到建筑)。 */
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
  district_code?: string | null;
  extra_attrs?: {
    inspection_date?: string | null;
    design_parameters?: string | null;
    inspection_result?: string | null;
    quantity_capacity?: string | null;
    control_room_location?: string | null;
    water_supply_connection_location?: string | null;
    remark?: string | null;
    quantity?: number | null;
  } | null;
  ai_description?: string | null;
}

// ---- 映射后的领域类型 ----

export interface BuildingOverview {
  id: string;
  name: string;
  address: string;
  buildingType: string;
  buildingUsage: string;
  builtYear: number | null;
  heightMeters: number | null;
  floorAreaSqm: number | null;
  groundFloors: number | null;
  undergroundFloors: number | null;
  standardFloorAreaSqm: number | null;
  buildingLength: number | null;
  buildingWidth: number | null;
  propertyOwner: string;
  managementUnit: string;
  sceneId: string | null;
  status: string;
  completionRate: number | null;
  lng: number | null;
  lat: number | null;
}

export interface StructureDesign {
  structureType: string;
  fireResistanceRating: string;
  fireCompartmentCount: number | null;
  maxFireCompartmentArea: number | null;
  smokeCompartmentCount: number | null;
  stairType: string;
  totalStairWidth: number | null;
  fireElevatorCount: number | null;
  fireElevatorLocation: string;
  refugeFloor: string;
  refugeFloorArea: number | null;
  fireShutterLocation: string;
  firewall: string;
  insulationMaterial: string;
  curtainWall: string;
}

export interface BuildingSurrounding {
  surroundingRoads: string;
  fireLane: string;
  fireLaneWidth: number | null;
  fireLaneHeight: number | null;
  fireLaneTurningRadius: number | null;
  aerialOperationSite: string;
  aerialSiteLocation: string;
  aerialSiteSize: string;
  aerialSiteLoad: string;
  rescueWindow: string;
  naturalWaterSource: string;
  municipalHydrant: string;
  adjacentBuildingSpacing: string;
}

export interface BuildingKeyFloor {
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

/** 消防设施/系统(建筑级):取自 fire_facilities WHERE ref_type=key_building。 */
export interface FireSystemItem {
  id: string;
  facilityType: string;
  name: string;
  status: string;
  statusNormalized: FetchState;
  locationPath: string;
  inspectionDate: string;
  designParameters: string;
  inspectionResult: string;
  quantityCapacity: string;
  controlRoomLocation: string;
  waterSupplyConnectionLocation: string;
  aiDescription: string;
}

export interface BuildingContacts {
  contactName: string;
  contactPhone: string;
  propertyOwner: string;
  managementUnit: string;
}

/** 建筑档案(领域模型,直接对应 znya 数据,不强行套 mock 形态)。 */
export interface RealBuildingProfile {
  id: string;
  overview: BuildingOverview;
  structureDesigns: StructureDesign[];
  surroundings: BuildingSurrounding[];
  keyFloors: BuildingKeyFloor[];
  facilities: FireSystemItem[];
  contacts: BuildingContacts;
}

// ---- 映射纯函数 ----

const s = (v: string | null | undefined): string => (v ?? '').trim();

/** znya 设施 status('normal'/'offline'/...) → FetchState(给 StatusBadge 用)。 */
export function normalizeFacilityStatus(raw: string): FetchState {
  switch (raw) {
    case 'normal':
    case '正常':
      return 'ok';
    case 'offline':
    case '离线':
      return 'error';
    case '告警':
    case 'alarm':
      return 'empty';
    default:
      return 'empty'; // 未知状态 ≠ 正常,归空态提示人工核实(运营安全:避免消防设施"假正常")
  }
}

export function mapOverview(z: ZnyaKeyBuildingDetail): BuildingOverview {
  return {
    id: z.id,
    name: s(z.name),
    address: s(z.address),
    buildingType: s(z.building_type),
    buildingUsage: s(z.building_usage),
    builtYear: z.built_year ?? null,
    heightMeters: z.building_height ?? null,
    floorAreaSqm: z.floor_area ?? null,
    groundFloors: z.ground_floors ?? null,
    undergroundFloors: z.underground_floors ?? null,
    standardFloorAreaSqm: z.standard_floor_area ?? null,
    buildingLength: z.building_length ?? null,
    buildingWidth: z.building_width ?? null,
    propertyOwner: s(z.property_owner),
    managementUnit: s(z.management_unit),
    sceneId: z.scene_id ?? null,
    status: s(z.status),
    completionRate: z.completion_rate ?? null,
    lng: z.longitude ?? null,
    lat: z.latitude ?? null,
  };
}

export function mapStructureDesign(z: ZnyaStructureDesign): StructureDesign {
  return {
    structureType: s(z.structure_type),
    fireResistanceRating: s(z.fire_resistance_rating),
    fireCompartmentCount: z.fire_compartment_count ?? null,
    maxFireCompartmentArea: z.max_fire_compartment_area ?? null,
    smokeCompartmentCount: z.smoke_compartment_count ?? null,
    stairType: s(z.stair_type),
    totalStairWidth: z.total_stair_width ?? null,
    fireElevatorCount: z.fire_elevator_count ?? null,
    fireElevatorLocation: s(z.fire_elevator_location),
    refugeFloor: s(z.refuge_floor),
    refugeFloorArea: z.refuge_floor_area ?? null,
    fireShutterLocation: s(z.fire_shutter_location),
    firewall: s(z.firewall),
    insulationMaterial: s(z.insulation_material),
    curtainWall: s(z.curtain_wall),
  };
}

export function mapSurrounding(z: ZnyaBuildingSurrounding): BuildingSurrounding {
  return {
    surroundingRoads: s(z.surrounding_roads),
    fireLane: s(z.fire_lane),
    fireLaneWidth: z.fire_lane_width ?? null,
    fireLaneHeight: z.fire_lane_height ?? null,
    fireLaneTurningRadius: z.fire_lane_turning_radius ?? null,
    aerialOperationSite: s(z.aerial_operation_site),
    aerialSiteLocation: s(z.aerial_site_location),
    aerialSiteSize: s(z.aerial_site_size),
    aerialSiteLoad: s(z.aerial_site_load),
    rescueWindow: s(z.rescue_window),
    naturalWaterSource: s(z.natural_water_source),
    municipalHydrant: s(z.municipal_hydrant),
    adjacentBuildingSpacing: s(z.adjacent_building_spacing),
  };
}

export function mapKeyFloor(z: ZnyaBuildingKeyFloor): BuildingKeyFloor {
  return {
    id: z.id,
    name: s(z.name),
    floor: s(z.floor),
    func: s(z.function),
    fireHazard: s(z.fire_hazard),
    hazardSource: s(z.hazard_source),
    internalFacilities: s(z.internal_facilities),
    accessRoute: s(z.access_route),
    exitCount: z.exit_count ?? null,
    responsiblePerson: s(z.responsible_person),
  };
}

export function mapFireSystem(z: ZnyaFireFacility): FireSystemItem {
  const a = z.extra_attrs ?? {};
  return {
    id: z.id,
    facilityType: s(z.facility_type),
    name: s(z.name) || s(z.facility_type),
    status: s(z.status),
    statusNormalized: normalizeFacilityStatus(s(z.status)),
    locationPath: s(z.location_path),
    inspectionDate: s(a.inspection_date),
    designParameters: s(a.design_parameters),
    inspectionResult: s(a.inspection_result),
    quantityCapacity: s(a.quantity_capacity),
    controlRoomLocation: s(a.control_room_location),
    waterSupplyConnectionLocation: s(a.water_supply_connection_location),
    aiDescription: s(z.ai_description),
  };
}

export function mapContacts(z: ZnyaKeyBuildingDetail): BuildingContacts {
  return {
    contactName: s(z.contact_name),
    contactPhone: s(z.contact_phone),
    propertyOwner: s(z.property_owner),
    managementUnit: s(z.management_unit),
  };
}

/**
 * 组装建筑档案:znya key_buildings 详情 + fire_facilities(已按 ref_id 过滤)。
 * 纯函数,不发起网络请求;调用方负责并发拉取两份数据后传入。
 */
export function mapBuildingProfile(
  detail: ZnyaKeyBuildingDetail,
  facilities: ZnyaFireFacility[],
): RealBuildingProfile {
  return {
    id: detail.id,
    overview: mapOverview(detail),
    structureDesigns: (detail.structure_designs ?? []).map(mapStructureDesign),
    surroundings: (detail.surroundings ?? []).map(mapSurrounding),
    keyFloors: (detail.key_floors ?? []).map(mapKeyFloor),
    facilities: facilities.map(mapFireSystem),
    contacts: mapContacts(detail),
  };
}
