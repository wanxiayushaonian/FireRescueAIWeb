'use client';

import { useEffect, useState } from 'react';
import type { SoonspaceSemanticClickInfo } from '@/lib/soonspace-runtime';
import type { SceneTreeNode } from '@/lib/device-tree';

type ClickInfo = SoonspaceSemanticClickInfo & {
  twins_instance_name?: string;
  name?: string;
};

function findNode(tree: SceneTreeNode | null, info: ClickInfo): { node: SceneTreeNode | null; story: SceneTreeNode | null } {
  if (!tree) return { node: null, story: null };
  type Entry = { node: SceneTreeNode; story: SceneTreeNode | null };
  const matchId = (value: string | undefined): Entry | null => {
    if (!value) return null;
    const stack: Entry[] = [{ node: tree, story: null }];
    while (stack.length > 0) {
      const { node, story } = stack.pop()!;
      if (node.id === value || node.out_instance_id === value || node.twins_instance_id === value) {
        return { node, story };
      }
      for (const child of node.children ?? []) {
        stack.push({ node: child, story: node.type === 'Story' || node.type === 'story' ? node : story });
      }
    }
    return null;
  };
  const candidates = [info.out_instance_id, info.twins_instance_id, info.story_id];
  for (const value of candidates) {
    const hit = matchId(value);
    if (hit?.node) return hit;
  }
  return { node: null, story: null };
}

export function SceneObjectInfoCard({
  sceneId,
  info,
  onClose,
  onAddPathPoint,
}: {
  sceneId: string;
  info: ClickInfo;
  onClose: () => void;
  onAddPathPoint: (info: ClickInfo) => void;
}) {
  const [tree, setTree] = useState<SceneTreeNode | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as SceneTreeNode;
        if (alive) setTree(data);
      } catch {
        // 名称反查失败时降级为原始字段展示
      }
    })();
    return () => {
      alive = false;
    };
  }, [sceneId]);

  const { node, story } = findNode(tree, info);
  const asString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
  const rawName = asString(info.twins_instance_name) ?? asString(info.name);
  const displayName = node?.name ?? rawName ?? asString(info.twins_instance_id) ?? asString(info.out_instance_id) ?? '未知对象';
  const displayType = node?.type ?? asString(info.twins_identifier) ?? '未知类型';
  const displayStory = story?.name ?? '—';
  const storyId = story?.id ?? asString(info.story_id) ?? '';
  const instanceId = node?.twins_instance_id ?? asString(info.twins_instance_id) ?? '';
  const outId = node?.id ?? asString(info.out_instance_id) ?? '';

  const run = async (action: 'highlight' | 'fly' | 'addPath', fn: () => Promise<void>): Promise<void> => {
    setBusy(action);
    setMessage(null);
    try {
      await fn();
      if (action === 'addPath') setMessage('已添加为镜头路径点');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="soc-card" role="dialog" aria-label="场景对象信息">
      <div className="soc-head">
        <span className="soc-title">场景对象</span>
        <button type="button" className="soc-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>
      <div className="soc-body">
        <div className="soc-name" title={displayName}>
          {displayName}
        </div>
        <div className="soc-grid">
          <span className="soc-label">类型</span>
          <span className="soc-value">{displayType}</span>
          <span className="soc-label">楼层</span>
          <span className="soc-value">{displayStory}</span>
          <span className="soc-label">实例 ID</span>
          <span className="soc-value soc-value--code" title={instanceId || outId}>
            {instanceId || outId}
          </span>
        </div>
        {message && <div className="soc-message">{message}</div>}
        <div className="soc-actions">
          <button
            type="button"
            className="soc-btn"
            disabled={busy !== null}
            onClick={() => void run('highlight', async () => {
              const sdk = (await import('@/lib/scene-sdk')).sceneSdk();
              sdk.heighLight?.(outId || instanceId);
            })}
          >
            {busy === 'highlight' ? '高亮中…' : '高亮'}
          </button>
          <button
            type="button"
            className="soc-btn"
            disabled={busy !== null}
            onClick={() => void run('fly', async () => {
              const { sceneSdk } = await import('@/lib/scene-sdk');
              const sdk = sceneSdk();
              if (typeof sdk.fly === 'function') {
                await sdk.fly(outId || instanceId);
              } else {
                throw new Error('当前场景不支持飞行定位');
              }
            })}
          >
            {busy === 'fly' ? '飞行中…' : '飞向'}
          </button>
          <button
            type="button"
            className="soc-btn soc-btn--primary"
            disabled={busy !== null}
            onClick={() => void run('addPath', async () => onAddPathPoint(info))}
          >
            {busy === 'addPath' ? '添加中…' : '＋ 添加为镜头路径点'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { ClickInfo };
