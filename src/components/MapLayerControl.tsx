'use client';
// 地图图层控制条:底图(矢量/卫星)+ 6 图层显隐。屏幕正上方居中,扁平药丸条。
// 划定区域/补全坐标等低频动作移至 Ctrl+K 命令面板,本条只留高频查看项。
import { Map as MapIcon, Satellite } from 'lucide-react';

interface Props {
  baseMap: 'vector' | 'satellite';
  onBaseMapChange: (b: 'vector' | 'satellite') => void;
  showStations: boolean;
  onToggleStations: () => void;
  showWater: boolean;
  onToggleWater: () => void;
  showBoundary: boolean;
  onToggleBoundary: () => void;
  showKeyUnits: boolean;
  onToggleKeyUnits: () => void;
  showBuildings: boolean;
  onToggleBuildings: () => void;
  showRegions: boolean;
  onToggleRegions: () => void;
  showIncidents: boolean;
  onToggleIncidents: () => void;
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
  showBuildings,
  onToggleBuildings,
  showRegions,
  onToggleRegions,
  showIncidents,
  onToggleIncidents,
}: Props) {
  const layers = [
    { label: '消防站', show: showStations, toggle: onToggleStations },
    { label: '水源', show: showWater, toggle: onToggleWater },
    { label: '边界', show: showBoundary, toggle: onToggleBoundary },
    { label: '重点单位', show: showKeyUnits, toggle: onToggleKeyUnits },
    { label: '重点建筑', show: showBuildings, toggle: onToggleBuildings },
    { label: '区域', show: showRegions, toggle: onToggleRegions },
    { label: '警情', show: showIncidents, toggle: onToggleIncidents },
  ];

  return (
    <div className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] shadow-lg backdrop-blur">
      {/* 底图 segmented */}
      <div className="flex items-center gap-0.5">
        {(['vector', 'satellite'] as const).map((b) => (
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
    </div>
  );
}
