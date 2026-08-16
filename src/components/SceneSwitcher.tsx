'use client';
// 3D 场景左上角切换浮层:仅在非 overview(3D)模块显示。
// 从 TopBar 迁出,避免在态势总览(GIS 地图)页也露出 3D 场景切换。
// 触发器为紧凑卡片,Popover 展开场景列表;空场景列表时整体不渲染。
import { Layers, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';

interface SceneSwitcherProps {
  scenes: { scene_id: string; scene_name: string }[];
  selectedSceneId?: string;
  onSelectScene?: (id: string) => void;
}

export default function SceneSwitcher({ scenes, selectedSceneId, onSelectScene }: SceneSwitcherProps) {
  if (!scenes || scenes.length === 0) return null;
  const current = scenes.find((s) => s.scene_id === selectedSceneId);

  // z-40:弹层须浮在 DraggablePanel(z-30)之上,展开的场景列表不被左侧面板遮挡
  return (
    <div className="absolute left-3 top-3 z-40">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-lg border border-line bg-bg-panel/90 px-3 py-2 text-[12px] text-text-1 backdrop-blur-[8px] transition hover:border-line-glow hover:text-cyan"
            title="切换场景"
          >
            <Layers className="h-4 w-4 shrink-0 text-cyan" />
            <span className="max-w-[160px] truncate">{current?.scene_name || current?.scene_id || '未选择场景'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="max-h-72 w-56 overflow-y-auto p-1"
        >
          <div className="px-2 py-1.5 text-[11px] text-text-3">场景列表</div>
          {scenes.map((s) => {
            const active = s.scene_id === selectedSceneId;
            return (
              <button
                key={s.scene_id}
                onClick={() => onSelectScene?.(s.scene_id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition ${
                  active ? 'bg-cyan/10 text-cyan' : 'text-text-2 hover:bg-white/5 hover:text-text-1'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{s.scene_name || s.scene_id}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
