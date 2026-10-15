import { z } from "zod";
import { db, transaction } from "../db";
import { ApiError, assertFound } from "../errors";

import { category, currency, date, entry, uuid } from "../validation";

import { classify } from "../classification";
import { importKey, parseCsv } from "../imports";
import { json, ok, ownedAccount, validCategory } from "./shared";
export async function transactions(req: Request, path: string[], user: string) {
  const method = req.method,
    route = path.join("/"),
    url = new URL(req.url);
  if (route === "transactions" && method === "GET") {
    const filter = z
      .object({
        accountId: uuid.optional(),
        categoryId: category.optional(),
        currency: currency.optional(),
        search: z.string().max(100).optional(),
        from: date.optional(),
        to: date.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .strict()
      .parse(Object.fromEntries(url.searchParams));
    const values: unknown[] = [user];
    const conditions = ["t.user_id=$1", "t.removed_at IS NULL"];
    for (const [v, column] of [
      [filter.accountId, "t.account_id"],
      [filter.currency, "t.currency"],
      [
        filter.categoryId,
        "COALESCE(t.category_override_id,t.predicted_category_id)",
      ],
      [filter.from, "t.date >="],
      [filter.to, "t.date <="],
    ] as const)
      if (v) {
        values.push(v);
        conditions.push(
          column +
            (column.endsWith(">=") || column.endsWith("<=") ? "" : " =") +
            ` $${values.length}`,
        );
      }
    if (filter.search) {
      values.push(filter.search);
      conditions.push(
        `strpos(lower(t.description), lower($${values.length})) > 0`,
      );
    }
    values.push(filter.limit, filter.offset);
    return ok(
      (
        await db().query(
          `SELECT t.id,t.account_id,t.description,t.amount,t.currency,to_char(t.date,'YYYY-MM-DD') AS date,t.pending,t.source,t.predicted_category_id,t.category_override_id,COALESCE(t.category_override_id,t.predicted_category_id) AS category_id FROM transactions t WHERE ${conditions.join(" AND ")} ORDER BY t.date DESC,t.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows,
    );
  }
  if (route === "transactions" && method === "POST") {
    const body = entry.parse(await json(req));
    const result = await transaction(async (c) => {
      const a = await ownedAccount(body.accountId, user, c);
      if (a.item_id)
        throw new ApiError(
          400,
          "LINKED_ACCOUNT",
          "Use a manual account for manual transactions",
        );
      if (body.categoryId) await validCategory(body.categoryId, c);
      return (
        await c.query(
          `INSERT INTO transactions(user_id,account_id,description,amount,currency,date,source,predicted_category_id,category_override_id,import_key) VALUES($1,$2,$3,$4,$5,$6,'manual',$7,$8,$9) RETURNING id`,
          [
            user,
            a.id,
            body.description,
            body.amount,
            a.currency,
            body.date,
            classify(body.description).category,
            body.categoryId ?? null,
            body.idempotencyKey ? "manual:" + body.idempotencyKey : null,
          ],
        )
      ).rows[0];
    });
    return ok(result, 201);
  }
  if (path[0] === "transactions" && path.length === 2 && method === "PATCH") {
    const id = uuid.parse(path[1]);
    const body = z
      .object({ categoryId: category.nullable() })
      .strict()
      .parse(await json(req));
    if (body.categoryId) await validCategory(body.categoryId);
    assertFound(
      (
        await db().query(
          "UPDATE transactions SET category_override_id=$1,updated_at=now() WHERE id=$2 AND user_id=$3 AND removed_at IS NULL RETURNING id",
          [body.categoryId, id, user],
        )
      ).rows[0],
    );
    return ok({ ok: true });
  }
  if (route === "imports/csv" && method === "POST") {
    const body = z
      .object({ accountId: uuid, csv: z.string().max(1_000_000) })
      .strict()
      .parse(await json(req, 1_100_000));
    const rows = parseCsv(body.csv);
    const inserted = await transaction(async (c) => {
      const a = await ownedAccount(body.accountId, user, c);
      if (a.item_id)
        throw new ApiError(
          400,
          "LINKED_ACCOUNT",
          "Use a manual account for CSV imports",
        );
      let count = 0;
      for (const row of rows) {
        const key = importKey(a.id, row.external_id);
        const r = await c.query(
          `INSERT INTO transactions(user_id,account_id,description,amount,currency,date,source,predicted_category_id,import_key) VALUES($1,$2,$3,$4,$5,$6,'csv',$7,$8) ON CONFLICT(user_id,import_key) DO NOTHING RETURNING id`,
          [
            user,
            a.id,
            row.description,
            row.amount,
            a.currency,
            row.date,
            classify(row.description).category,
            key,
          ],
        );
        if (r.rowCount) count++;
        else {
          const old = (
            await c.query(
              "SELECT description,amount::text,to_char(date,'YYYY-MM-DD') AS date FROM transactions WHERE user_id=$1 AND import_key=$2",
              [user, key],
            )
          ).rows[0];
          if (
            old.description !== row.description ||
            Number(old.amount) !== Number(row.amount) ||
            old.date !== row.date
          )
            throw new ApiError(
              409,
              "IMPORT_CONFLICT",
              "An external_id was reused with different data",
            );
        }
      }
      return count;
    });
    return ok({ inserted, duplicates: rows.length - inserted }, 201);
  }

  return null;
}
