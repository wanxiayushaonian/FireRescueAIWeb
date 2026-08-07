// 数据层 TypeScript 接口（design.md §4 Data Layer）
export type FetchState = 'ok' | 'loading' | 'empty' | 'error';

export interface Station {
  id: string;
  name: string;
  type: '救援大队' | '救援站' | '政府专职站' | '企业专职站' | '微型消防站';
  contact: string;
  dutyPhone: string;
  address: string;
  lng: number;
  lat: number;
  personnel: number;
  vehicles: number;
  status?: string; // normal/维修/停用(后端 fire_stations.status)
}

export interface ResourceItem {
  id: string;
  name: string;
  category: '人员' | '车辆' | '装备';
  subtype: string;
  stationId: string;
  status: '在位' | '出警' | '维保' | '正常' | '告警' | '离线';
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  status: '正常' | '告警' | '离线';
  location?: string;
}

export interface BuildingProfile {
  overview: {
    name: string;
    address: string;
    structure: string;
    floors: string;
    area: string;
    zones: string[];
    adjacent: string[];
  };
  waterSupply: {
    pools: Facility[];
    pumps: Facility[];
    adapters: Facility[];
    outdoorHydrants: Facility[];
  };
  keyParts: {
    exits: Facility[];
    fireElevators: Facility[];
    fireCompartments: Facility[];
    controlRoom: Facility;
    refugeFloors: Facility[];
  };
  indoorFacilities: Array<{
    floor: string;
    items: Array<{
      id: string;
      name: string;
      type: '室内消火栓' | '烟感' | '喷淋' | '灭火器箱' | '手动报警装置';
      status: '正常' | '告警' | '离线';
    }>;
  }>;
  contacts: {
    controlRoomPhone: string;
    legalPerson: string;
    fireManager: string;
    partTimeManager: string;
  };
}

export interface DrillPlan {
  responseLevel: string;
  forces: string[];
  tactics: string[];
  keyPoints: string[];
  routes: { attack: string[]; evacuate: string[] };
  safetyControls: string[];
}

export interface WaterSource {
  id: string;
  name: string;
  type: string; // 市政消火栓 / 消防水池 / 天然水源
  lat: number;
  lng: number;
  address: string;
  districtCode: string;
  district: string; // 区名(DISTRICT_NAME 映射)
  status: string;
}
