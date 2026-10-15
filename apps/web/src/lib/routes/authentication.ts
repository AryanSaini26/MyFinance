import { mockMode } from "../plaid";

import { limitAuth, newSession, sessionCookie } from "../auth";
import { db, transaction } from "../db";
import { ApiError } from "../errors";
import { hashPassword, verifyPassword } from "../security";
import { credentials } from "../validation";

import { json, ok } from "./shared";
export async function authentication(req: Request, path: string[]) {
  const method = req.method,
    route = path.join("/");
  if (
    (route === "auth/register" || route === "auth/login") &&
    method === "POST"
  ) {
    const input = credentials.parse(await json(req));
    await limitAuth(input.email);
    let user: string;
    if (route === "auth/register") {
      const hash = await hashPassword(input.password);
      user = await transaction(async (c) => {
        const r = await c.query(
          "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id",
          [input.email, hash],
        );
        await c.query(
          "INSERT INTO accounts(user_id,name,type,currency) VALUES($1,'Cash / CSV','manual','CAD')",
          [r.rows[0].id],
        );
        return r.rows[0].id;
      });
    } else {
      const r = await db().query(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [input.email],
      );
      // Run scrypt even for unknown users to reduce account enumeration through timing.
      const dummy =
        "scrypt$32768$8$3$00000000000000000000000000000000$" + "0".repeat(128);
      const valid = await verifyPassword(
        input.password,
        r.rows[0]?.password_hash ?? dummy,
      );
      if (!valid || !r.rowCount)
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "Invalid email or password",
        );
      user = r.rows[0].id;
    }
    const token = await newSession(user);
    return ok(
      {
        user: { id: user, email: input.email },
        mode: mockMode() ? "mock" : "sandbox",
      },
      route === "auth/register" ? 201 : 200,
      { "Set-Cookie": sessionCookie(token) },
    );
  }

  return null;
}
