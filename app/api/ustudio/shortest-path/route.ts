import { NextResponse } from 'next/server';
import { describeUStudioError, findShortestPath } from '@/lib/ustudio';

export const dynamic = 'force-dynamic';

/** kgraph 最短路(场内导航路径规划):source/target 为场景 xyz 坐标,可传 costModel。 */
export async function POST(request: Request) {
  let body: { sceneId?: string; source?: unknown; target?: unknown; costModel?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.source || !body.target) {
    return NextResponse.json({ message: 'source/target required ({x,y,z})' }, { status: 400 });
  }
  try {
    const result = await findShortestPath({
      sceneId: body.sceneId,
      source: body.source as { x: number; y: number; z: number },
      target: body.target as { x: number; y: number; z: number },
      costModel: body.costModel,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ustudio/shortest-path] failed', { error });
    const upstream = describeUStudioError(error);
    const message = error instanceof Error ? error.message : 'shortest-path failed';
    return NextResponse.json({ message, ...(upstream ?? {}) }, { status: 502 });
  }
}
