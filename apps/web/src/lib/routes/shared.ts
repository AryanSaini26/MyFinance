import type { Pool, PoolClient } from "pg";
import { db } from "../db";
import { ApiError, assertFound } from "../errors";
export async function json(req: Request, limit = 32768) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "CONTENT_TYPE", "Send application/json");
  if (Number(req.headers.get("content-length")) > limit)
    throw new ApiError(413, "TOO_LARGE", "Request too large");
  // Read incrementally so chunked requests cannot bypass the limit.
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "Missing JSON body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "TOO_LARGE", "Request too large");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Invalid JSON");
  }
}
export const ok = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export async function ownedAccount(
  id: string,
  user: string,
  c: Pool | PoolClient = db(),
) {
  return assertFound(
    (
      await c.query(
        "SELECT * FROM accounts WHERE id=$1 AND user_id=$2 AND active=true",
        [id, user],
      )
    ).rows[0],
  );
}
export async function validCategory(id: string, c: Pool | PoolClient = db()) {
  if (!(await c.query("SELECT 1 FROM categories WHERE id=$1", [id])).rowCount)
    throw new ApiError(400, "INVALID_CATEGORY", "Unknown category");
}
