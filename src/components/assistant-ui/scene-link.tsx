import { useState, type ReactNode } from 'react';
import { useScene } from '@/components/SceneProvider';
import { parseSceneLink } from '@/lib/scene-links';
import { storyIdsForFloorSpec } from '@/lib/floor-focus';
import { buildDeviceSearchIndex } from '@/lib/scene-pick';
import { showToast } from '@/components/Toast';

const LINK_COLOR = '#22d3ee'; // 场景锚点高亮色(cyan,与 SceneToolbar 一致)

/**
 * 智能体输出中的场景锚点(scene:// 链接):点击执行 3D 联动。
 * - floor:楼层聚焦(独显 + 飞向楼层段整体中心)
 * - device:飞向设备 + 高亮
 * - type:高亮该类型设备(可按楼层过滤) + 飞向设备所在楼层
 */
export function SceneLink({ href, children }: { href: string; children: ReactNode }) {
  const { tree, runtime, recipeStore } = useScene();
  const [busy, setBusy] = useState(false);
  const link = parseSceneLink(href);

  const onClick = async () => {
    if (!link || busy) return;
    setBusy(true);
    try {
      if (link.kind === 'floor') {
        if (!tree || !recipeStore) {
          showToast('3D 场景未就绪,无法聚焦楼层');
          return;
        }
        const storyIds = storyIdsForFloorSpec(tree, link.spec);
        if (storyIds.length === 0) {
          showToast(`场景中未找到楼层 ${link.spec}`);
          return;
        }
        const multi = storyIds.length > 1;
        recipeStore.patchStructural({
          visibleStories: storyIds,
          yExtend: multi,
          hideDevices: multi,
        });
        if (runtime && typeof runtime.flyToObjects === 'function') {
          await runtime.flyToObjects(storyIds).catch(() => {});
        } else {
          await runtime?.flyToObject(storyIds[0]).catch(() => {});
        }
        showToast(`已聚焦 ${link.spec}`);
      } else if (link.kind === 'device') {
        if (!runtime) {
          showToast('3D 场景未就绪,无法聚焦设备');
          return;
        }
        await runtime.flyToObject(link.id).catch(() => {});
        runtime.replaceHighlight([link.id], LINK_COLOR);
        showToast('已聚焦设备');
      } else if (link.kind === 'type') {
        if (!tree || !recipeStore || !runtime) {
          showToast('3D 场景未就绪,无法高亮设备');
          return;
        }
        const q = link.type.toLowerCase();
        const floorQ = link.floor?.toLowerCase();
        const hits = buildDeviceSearchIndex(tree).filter(
          (d) =>
            (d.type.toLowerCase().includes(q) || (d.typeLabel ?? '').toLowerCase().includes(q)) &&
            (!floorQ || (d.storyLabel ?? '').toLowerCase().includes(floorQ)),
        );
        if (hits.length === 0) {
          showToast(`场景中未找到类型 ${link.type}${link.floor ? `(楼层 ${link.floor})` : ''}`);
          return;
        }
        const shown = hits.slice(0, 12);
        runtime.replaceHighlight(shown.map((h) => h.outId), LINK_COLOR);
        // 飞向命中设备所在楼层(去重,优先合并盒一次看全)
        const floorIds = [...new Set(hits.flatMap((h) => (h.storyLabel ? storyIdsForFloorSpec(tree, h.storyLabel) : [])))];
        if (floorIds.length > 0 && typeof runtime.flyToObjects === 'function') {
          await runtime.flyToObjects(floorIds).catch(() => {});
        } else if (shown.length > 0) {
          await runtime.flyToObject(shown[0].outId).catch(() => {});
        }
        showToast(`已高亮 ${link.type}${hits.length > 12 ? ` 前12/共${hits.length}` : ` ×${hits.length}`}${link.floor ? `(${link.floor})` : ''}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      title={link ? `点击${busy ? '…' : '联动场景'}` : href}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded border border-cyan/40 bg-cyan/10 px-1.5 py-px align-baseline text-[0.9em] font-medium text-cyan transition hover:bg-cyan/20 disabled:opacity-60"
    >
      <svg viewBox="0 0 16 16" className="mr-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3 2.5 5 4.5 8 2-3 4.5-5 4.5-8A4.5 4.5 0 0 0 8 1.5Z" />
        <circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" />
      </svg>
      {children}
    </button>
  );
}
