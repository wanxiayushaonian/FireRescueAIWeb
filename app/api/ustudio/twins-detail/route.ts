import { NextResponse } from 'next/server';
import { getTwinsInstanceDetail } from '@/lib/ustudio';
import { extractTwinProperties } from '@/lib/twins-props';

export const dynamic = 'force-dynamic';

/** 孪生实例详情(点击信息卡属性区):BFF 持密钥调平台,扁平化为 KV 属性返回。 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ message: 'Missing twins instance id' }, { status: 400 });
  }
  try {
    const detail = await getTwinsInstanceDetail({ twinsInstanceId: id });
    const obj = (detail ?? {}) as Record<string, unknown>;
    const name = [obj.twins_instance_name, obj.name].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    return NextResponse.json({ name: name ?? '', properties: extractTwinProperties(detail) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load twins detail';
    return NextResponse.json({ message }, { status: 502 });
  }
}
