import { NextResponse } from 'next/server';
import { getSceneInstanceTree } from '@/lib/ustudio';
import { FIRE_TYPE_IDENTIFIERS } from '@/lib/fire-types';

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

type TreeLike = {
  type?: string;
  children?: unknown[];
};

const STORY_PATTERN = /story|floor|楼层|层$/i;
const CONTAINER_PATTERN =
  /building|story|floor|space|wall|door|window|column|pillar|corridor|楼栋|楼层|空间|墙|门|窗|柱|走廊/i;

function countNode(node: TreeLike, depth: number): { story: number; device: number; fire: number } {
  const type = String(node.type ?? '');
  const children = Array.isArray(node.children) ? (node.children as TreeLike[]) : [];
  const isStory = STORY_PATTERN.test(type);

  let stats = { story: isStory ? 1 : 0, device: 0, fire: 0 };

  if (children.length === 0) {
    if (FIRE_TYPE_IDENTIFIERS.has(type)) stats.fire = 1;
    else if (type !== '' && !CONTAINER_PATTERN.test(type)) stats.device = 1;
    return stats;
  }

  for (const child of children) {
    const c = countNode(child, depth + 1);
    stats.story += c.story;
    stats.device += c.device;
    stats.fire += c.fire;
  }
  return stats;
}

async function overviewOne(sceneId: string): Promise<SceneOverview> {
  try {
    const tree = await getSceneInstanceTree({ sceneId });
    const counted = countNode(tree as TreeLike, 0);
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
