'use client';
// 地图图层控制条:底图(卫星/矢量)+ 图层显隐 + 九江全景重置。屏幕正上方居中,扁平药丸条。
// 队站类型/水源区划的细粒度显隐在各自业务面板(执勤力量/水源)里维护,本条只留总开关。
// 图层顺序:边界、消防站、重点单位(含重点建筑)、水源、警情、区域;底图默认矢量、卫星排前。
import { Map as MapIcon, Satellite, Maximize } from 'lucide-react';

interface Props {
  baseMap: 'vector' | 'satellite';
  onBaseMapChange: (b: 'vector' | 'satellite') => void;
  showStations: boolean;
  onToggleStations: () => void;
  showWater: boolean;
  onToggleWater: () => void;
  showBoundary: boolean;
  onToggleBoundary: () => void;
  /** 重点对象(重点单位+重点建筑)合并开关 */
  showKeyUnits: boolean;
  onToggleKeyUnits: () => void;
  showRegions: boolean;
  onToggleRegions: () => void;
  showIncidents: boolean;
  onToggleIncidents: () => void;
  /** 返回九江全景(默认中心/缩放) */
  onResetView: () => void;
}

export default function MapLayerControl({
  baseMap,
  onBaseMapChange,
  showStations,
  onToggleStations,
  showWater,
  onToggleWater,
  showBoundary,
  onToggleBoundary,
  showKeyUnits,
  onToggleKeyUnits,
  showRegions,
  onToggleRegions,
  showIncidents,
  onToggleIncidents,
  onResetView,
}: Props) {
  const layers = [
    { label: '边界', show: showBoundary, toggle: onToggleBoundary },
    { label: '消防站', show: showStations, toggle: onToggleStations },
    { label: '重点对象', show: showKeyUnits, toggle: onToggleKeyUnits },
    { label: '水源', show: showWater, toggle: onToggleWater },
    { label: '警情', show: showIncidents, toggle: onToggleIncidents },
    { label: '区域', show: showRegions, toggle: onToggleRegions },
  ];

  return (
    <div className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] shadow-lg backdrop-blur">
      {/* 底图 segmented(卫星在前,默认矢量) */}
      <div className="flex items-center gap-0.5">
        {(['satellite', 'vector'] as const).map((b) => (
          <button
            key={b}
            onClick={() => onBaseMapChange(b)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 transition ${
              baseMap === b ? 'bg-amber-300/15 text-amber-300' : 'text-text-3 hover:text-text-1'
            }`}
          >
            {b === 'vector' ? <MapIcon className="h-3 w-3" /> : <Satellite className="h-3 w-3" />}
            {b === 'vector' ? '矢量' : '卫星'}
          </button>
        ))}
      </div>
      <span className="h-4 w-px bg-line/60" />
      {/* 图层 toggle(紧凑横排;激活 cyan,隐藏灰) */}
      <div className="flex items-center gap-0.5">
        {layers.map((l) => (
          <button
            key={l.label}
            onClick={l.toggle}
            className={`rounded-full px-2 py-0.5 transition ${
              l.show ? 'bg-cyan/12 text-cyan' : 'text-text-3 hover:text-text-1'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <span className="h-4 w-px bg-line/60" />
      {/* 九江全景:一键返回全市俯瞰 */}
      <button
        onClick={onResetView}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-text-2 transition hover:bg-white/5 hover:text-text-1"
        title="返回九江市全景"
      >
        <Maximize className="h-3 w-3" />
        九江全景
      </button>
    </div>
  );
}
