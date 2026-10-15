import { randomBytes } from "node:crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { digest } from "./security";
export const cookieName = "myfinance_session";
export function sessionToken(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1) ?? ""
  );
}
export async function requireUser(req: Request): Promise<string> {
  const token = sessionToken(req);
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "UNAUTHORIZED", "Please sign in");
  const r = await db().query(
    "SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
    [digest(token)],
  );
  if (!r.rowCount) throw new ApiError(401, "UNAUTHORIZED", "Please sign in");
  return r.rows[0].user_id;
}
export async function newSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db().query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(token), userId],
  );
  return token;
}
export function sessionCookie(token: string, clear = false) {
  const secure = process.env.COOKIE_SECURE !== "false";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${secure ? "; Secure" : ""}`;
}
// Origin is mandatory on mutations, including login, preventing login CSRF.
export function checkOrigin(req: Request) {
  const allowed = process.env.APP_ORIGIN;
  if (!allowed || req.headers.get("origin") !== allowed)
    throw new ApiError(403, "ORIGIN_REJECTED", "Invalid request origin");
}
export async function limitAuth(email: string) {
  const r = await db().query(
    `INSERT INTO auth_attempts(key,attempts,window_start) VALUES($1,1,now())
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END,
 window_start=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_start END RETURNING attempts`,
    [digest(email)],
  );
  if (r.rows[0].attempts > 10)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many attempts; try again in 15 minutes",
    );
}
