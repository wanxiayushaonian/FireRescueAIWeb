/**
 * 消防设备类型共享定义。
 * 服务端统计（app/api/ustudio/overview）与前端面板（FireSafetyPanel）共用，
 * 避免两处各自维护一套类型清单导致统计与展示不一致。
 */

export const FIRE_TYPE_LABELS: Record<string, string> = {
  StandaloneSmokeAlarm: '感烟报警器',
  EmergencyLightingFixture: '应急照明',
  PortableCO2Extinguisher: '手提灭火器',
  ExtinguisherCabinet: '灭火器箱',
  HydrantButton: '室内消火栓',
  ClosedSprinklerHead: '闭式喷淋头',
};

export const FIRE_TYPE_ICONS: Record<string, string> = {
  StandaloneSmokeAlarm: '🚨',
  EmergencyLightingFixture: '💡',
  PortableCO2Extinguisher: '🧯',
  ExtinguisherCabinet: '🧰',
  HydrantButton: '🚒',
  ClosedSprinklerHead: '💦',
};

export const FIRE_TYPE_COLORS: Record<string, string> = {
  StandaloneSmokeAlarm: '#f87171',
  EmergencyLightingFixture: '#fbbf24',
  PortableCO2Extinguisher: '#34d399',
  ExtinguisherCabinet: '#60a5fa',
  HydrantButton: '#a78bfa',
  ClosedSprinklerHead: '#38bdf8',
};

export const FIRE_TYPE_ORDER = [
  'StandaloneSmokeAlarm',
  'EmergencyLightingFixture',
  'PortableCO2Extinguisher',
  'ExtinguisherCabinet',
  'HydrantButton',
  'ClosedSprinklerHead',
];

export const FIRE_TYPE_IDENTIFIERS = new Set(FIRE_TYPE_ORDER);

export type FireDeviceStatus = 'normal' | 'warning' | 'offline' | 'unknown';
