import { z } from "zod";
import { db } from "../db";

import { sessionCookie, sessionToken } from "../auth";
import { mockMode } from "../plaid";
import { digest } from "../security";
import { currency } from "../validation";

import { json, ok } from "./shared";
export async function accounts(req: Request, path: string[], user: string) {
  const method = req.method,
    route = path.join("/");
  if (route === "auth/me" && method === "GET")
    return ok({
      user: (await db().query("SELECT id,email FROM users WHERE id=$1", [user]))
        .rows[0],
      mode: mockMode() ? "mock" : "sandbox",
    });
  if (route === "auth/logout" && method === "POST") {
    await db().query("DELETE FROM sessions WHERE token_hash=$1", [
      digest(sessionToken(req)),
    ]);
    return ok({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
  }
  if (route === "categories" && method === "GET")
    return ok(
      (await db().query("SELECT * FROM categories ORDER BY name")).rows,
    );
  if (route === "accounts" && method === "GET")
    return ok(
      (
        await db().query(
          "SELECT id,item_id,name,mask,type,currency,current_balance,active FROM accounts WHERE user_id=$1 ORDER BY name",
          [user],
        )
      ).rows,
    );
  if (route === "accounts" && method === "POST") {
    const body = z
      .object({ name: z.string().trim().min(1).max(100), currency })
      .strict()
      .parse(await json(req));
    return ok(
      (
        await db().query(
          "INSERT INTO accounts(user_id,name,type,currency) VALUES($1,$2,'manual',$3) RETURNING id,name,currency",
          [user, body.name, body.currency],
        )
      ).rows[0],
      201,
    );
  }

  return null;
}
