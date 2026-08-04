import { NextResponse } from 'next/server';
import { getSceneInstanceTree } from '@/lib/ustudio';
import { countSceneNodes, type SceneNodeLike } from '@/lib/scene-stats';

export const dynamic = 'force-dynamic';

const MAX_SCENES = 20;
const CONCURRENCY = 3;

export type SceneOverview = {
  sceneId: string;
  /** 楼层节点数 */
  storyCount: number;
  /** 设备叶子节点数（排除楼栋/楼层/空间/墙/门/窗/柱等容器结构） */
  deviceCount: number;
  /** 消防设备叶子节点数 */
  fireDeviceCount: number;
  ok: boolean;
  error?: string;
};

async function overviewOne(sceneId: string): Promise<SceneOverview> {
  try {
    const tree = await getSceneInstanceTree({ sceneId });
    const counted = countSceneNodes(tree as SceneNodeLike);
    return {
      sceneId,
      storyCount: counted.story,
      deviceCount: counted.device,
      fireDeviceCount: counted.fire,
      ok: true,
    };
  } catch (error) {
    return {
      sceneId,
      storyCount: 0,
      deviceCount: 0,
      fireDeviceCount: 0,
      ok: false,
      error: error instanceof Error ? error.message : '统计失败',
    };
  }
}

export async function POST(request: Request) {
  let body: { sceneIds?: unknown };
  try {
    body = (await request.json()) as { sceneIds?: unknown };
  } catch {
    return NextResponse.json({ message: '请求体不是合法 JSON' }, { status: 400 });
  }

  const ids = Array.isArray(body.sceneIds)
    ? (body.sceneIds as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, MAX_SCENES)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ results: [] as SceneOverview[] });
  }

  const results: SceneOverview[] = new Array(ids.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await overviewOne(ids[index]);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker());
  await Promise.all(workers);

  return NextResponse.json({ results });
}
