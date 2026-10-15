import { handle } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function route(req: Request, context: Context) {
  return handle(req, (await context.params).path);
}
export { route as DELETE, route as GET, route as PATCH, route as POST };
