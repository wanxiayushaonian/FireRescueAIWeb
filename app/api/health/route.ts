export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BFF 存活检查:只证明 Next.js 进程可接受请求,不暴露环境变量或上游信息。 */
export function GET(): Response {
  return Response.json({ status: 'ok', service: 'firerescue-bff' });
}
