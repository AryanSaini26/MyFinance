import { z } from "zod";
import { db } from "../db";
import { ApiError } from "../errors";

import { currency, money } from "../validation";

import { json, ok, validCategory } from "./shared";
export async function reporting(req: Request, path: string[], user: string) {
  const method = req.method,
    route = path.join("/"),
    url = new URL(req.url);
  if (route === "summary" && method === "GET") {
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(
        url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7),
      );
    const rows = await db().query(
      `SELECT currency,COALESCE(sum(amount) FILTER(WHERE amount>0),0)::text AS income,COALESCE(-sum(amount) FILTER(WHERE amount<0),0)::text AS expenses,count(*)::int AS count FROM transactions WHERE user_id=$1 AND removed_at IS NULL AND NOT pending AND COALESCE(category_override_id,predicted_category_id)<>'transfer' AND date >= $2::date AND date<($2::date+interval '1 month') GROUP BY currency`,
      [user, month + "-01"],
    );
    const spending = await db().query(
      `SELECT currency,COALESCE(category_override_id,predicted_category_id) AS category_id,(-sum(amount))::text AS amount FROM transactions WHERE user_id=$1 AND removed_at IS NULL AND NOT pending AND amount<0 AND COALESCE(category_override_id,predicted_category_id)<>'transfer' AND date >= $2::date AND date<($2::date+interval '1 month') GROUP BY currency,category_id ORDER BY sum(amount)`,
      [user, month + "-01"],
    );
    return ok({ totals: rows.rows, spending: spending.rows });
  }
  if (route === "budgets" && method === "POST") {
    const b = z
      .object({
        categoryId: z.string().max(40),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        currency,
        amount: money.refine((v) => Number(v) > 0),
      })
      .strict()
      .parse(await json(req));
    await validCategory(b.categoryId);
    if (["income", "transfer"].includes(b.categoryId))
      throw new ApiError(
        400,
        "INVALID_CATEGORY",
        "Budgets track spending categories",
      );
    return ok(
      (
        await db().query(
          `INSERT INTO budgets(user_id,category_id,month,currency,amount) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,category_id,month,currency) DO UPDATE SET amount=EXCLUDED.amount RETURNING id`,
          [user, b.categoryId, b.month + "-01", b.currency, b.amount],
        )
      ).rows[0],
      201,
    );
  }
  if (route === "budgets" && method === "GET")
    return ok(
      (
        await db().query(
          `SELECT b.id,b.category_id,to_char(b.month,'YYYY-MM') AS month,b.currency,b.amount,COALESCE((SELECT -sum(t.amount) FROM transactions t WHERE t.user_id=b.user_id AND t.currency=b.currency AND COALESCE(t.category_override_id,t.predicted_category_id)=b.category_id AND t.amount<0 AND NOT t.pending AND t.removed_at IS NULL AND t.date>=b.month AND t.date<b.month+interval '1 month'),0)::text AS spent FROM budgets b WHERE user_id=$1 ORDER BY month DESC,category_id`,
          [user],
        )
      ).rows,
    );

  return null;
}
