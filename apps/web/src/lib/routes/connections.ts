import { z } from "zod";
import { db, transaction } from "../db";
import { ApiError, assertFound } from "../errors";

import { bankAccounts, exchange, linkToken, removeItem } from "../plaid";
import { decryptToken, encryptToken } from "../security";
import { currency, uuid } from "../validation";

import { json, ok } from "./shared";
export async function connections(req: Request, path: string[], user: string) {
  const method = req.method,
    route = path.join("/");
  if (route === "items" && method === "GET")
    return ok(
      (
        await db().query(
          `SELECT i.id,i.institution_name,i.status,s.cursor<>'' AS has_cursor,s.last_synced_at,s.last_error FROM plaid_items i JOIN sync_state s ON s.item_id=i.id WHERE i.user_id=$1 ORDER BY i.created_at`,
          [user],
        )
      ).rows,
    );
  if (route === "plaid/link-token" && method === "POST")
    return ok(await linkToken(user));
  if (route === "plaid/exchange" && method === "POST") {
    const body = z
      .object({ publicToken: z.string().min(1).max(1000) })
      .strict()
      .parse(await json(req));
    const tokens = await exchange(body.publicToken);
    try {
      const metadata = await bankAccounts(tokens.accessToken);
      const item = await transaction(async (c) => {
        const r = await c.query(
          "INSERT INTO plaid_items(user_id,plaid_item_id,institution_name,access_token_encrypted) VALUES($1,$2,$3,$4) RETURNING id",
          [
            user,
            tokens.itemId,
            metadata.institution,
            encryptToken(tokens.accessToken),
          ],
        );
        const id = r.rows[0].id;
        for (const a of metadata.accounts)
          await c.query(
            `INSERT INTO accounts(user_id,item_id,plaid_account_id,name,mask,type,currency,current_balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              user,
              id,
              a.account_id,
              a.name,
              a.mask,
              a.type,
              currency.parse(a.balances.iso_currency_code),
              a.balances.current,
            ],
          );
        await c.query("INSERT INTO sync_state(item_id) VALUES($1)", [id]);
        return id;
      });
      return ok({ id: item }, 201);
    } catch (e) {
      try {
        await removeItem(tokens.accessToken);
      } catch {
        /* No token or provider payload is logged. */
      }
      throw e;
    }
  }
  if (
    path[0] === "items" &&
    path.length === 3 &&
    path[2] === "sync" &&
    method === "POST"
  ) {
    const id = uuid.parse(path[1]);
    assertFound(
      (
        await db().query(
          "SELECT id FROM plaid_items WHERE id=$1 AND user_id=$2 AND status='active'",
          [id, user],
        )
      ).rows[0],
    );
    const secret = process.env.SYNC_SERVICE_SECRET;
    if (!secret || secret.length < 32)
      throw new ApiError(
        503,
        "SYNC_UNAVAILABLE",
        "Synchronization service is not configured",
      );
    let r: Response;
    try {
      r = await fetch(
        `${process.env.SYNC_SERVICE_URL ?? "http://localhost:8080"}/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ item_id: id, user_id: user }),
          signal: AbortSignal.timeout(95000),
        },
      );
    } catch {
      throw new ApiError(
        503,
        "SYNC_UNAVAILABLE",
        "Synchronization service is unavailable; retry safely",
      );
    }
    if (!r.ok)
      throw new ApiError(
        r.status === 409 ? 409 : 502,
        "SYNC_FAILED",
        r.status === 409
          ? "This institution is already synchronizing"
          : "Synchronization failed; retry safely",
      );
    return ok(await r.json());
  }
  if (path[0] === "items" && path.length === 2 && method === "DELETE") {
    const id = uuid.parse(path[1]);
    // Durable disconnect intent before the network call. Failed revocation is retryable.
    const token = await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        id,
      ]);
      const item = assertFound(
        (
          await c.query(
            "SELECT * FROM plaid_items WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [id, user],
          )
        ).rows[0],
      );
      if (item.status === "disconnected") return null;
      await c.query(
        "UPDATE plaid_items SET status='disconnecting' WHERE id=$1",
        [id],
      );
      return decryptToken(item.access_token_encrypted);
    });
    if (token) await removeItem(token);
    await transaction(async (c) => {
      await c.query(
        "UPDATE plaid_items SET status='disconnected',access_token_encrypted=NULL WHERE id=$1 AND user_id=$2",
        [id, user],
      );
      await c.query(
        "UPDATE accounts SET active=false WHERE item_id=$1 AND user_id=$2",
        [id, user],
      );
    });
    return ok({ ok: true });
  }

  return null;
}
