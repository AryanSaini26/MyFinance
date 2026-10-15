import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors";
import { date, money } from "./validation";
const rowSchema = z
  .object({
    date,
    description: z.string().trim().min(1).max(300),
    amount: money,
    external_id: z.string().trim().min(1).max(100),
  })
  .strict();
export function parseCsv(text: string) {
  if (Buffer.byteLength(text) > 1_000_000)
    throw new ApiError(413, "TOO_LARGE", "CSV must be at most 1 MB");
  let rows: unknown[];
  try {
    rows = parse(text, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 2000,
    });
  } catch {
    throw new ApiError(400, "INVALID_CSV", "Malformed CSV");
  }
  if (rows.length < 1 || rows.length > 1000)
    throw new ApiError(400, "INVALID_CSV", "CSV must contain 1–1000 rows");
  return rows.map((r) => rowSchema.parse(r));
}
export function importKey(accountId: string, externalId: string) {
  return createHash("sha256")
    .update(`csv:${accountId}:${externalId}`)
    .digest("hex");
}
