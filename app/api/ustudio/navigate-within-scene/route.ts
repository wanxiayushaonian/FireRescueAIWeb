import { NextResponse } from 'next/server';
import { describeUStudioError, navigateWithinSceneApi } from '@/lib/ustudio';

export const dynamic = 'force-dynamic';

/**
 * 场内导航规划(kgraph shortest-path-with-waypoints,平台编辑器同源):
 * {source, target, waypointNodeIds?} —— source/target 可为 {x,y,z} 或 {node_id}。
 */
export async function POST(request: Request) {
  let body: { sceneId?: string; source?: unknown; target?: unknown; waypointNodeIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.source || !body.target) {
    return NextResponse.json({ message: 'source/target required' }, { status: 400 });
  }
  try {
    const result = await navigateWithinSceneApi({
      sceneId: body.sceneId,
      source: body.source as Record<string, unknown>,
      target: body.target as Record<string, unknown>,
      waypointNodeIds: Array.isArray(body.waypointNodeIds) ? body.waypointNodeIds.filter((x): x is string => typeof x === 'string') : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ustudio/navigate-within-scene] failed', { error });
    const upstream = describeUStudioError(error);
    const message = error instanceof Error ? error.message : 'navigate-within-scene failed';
    return NextResponse.json({ message, ...(upstream ?? {}) }, { status: 502 });
  }
}
