import { randomUUID } from "node:crypto";
import { z } from "zod";
import { checkOrigin, requireUser } from "./auth";
import { db } from "./db";
import { ApiError } from "./errors";
import { accounts } from "./routes/accounts";
import { authentication } from "./routes/authentication";
import { connections } from "./routes/connections";
import { reporting } from "./routes/reporting";
import { ok } from "./routes/shared";
import { transactions } from "./routes/transactions";
export async function handle(req: Request, path: string[]): Promise<Response> {
  const requestId = randomUUID();
  try {
    if (!["GET", "HEAD"].includes(req.method)) checkOrigin(req);
    if (path.join("/") === "health" && req.method === "GET") {
      await db().query("SELECT 1");
      return ok({ status: "ok" });
    }
    const publicResponse = await authentication(req, path);
    if (publicResponse) return publicResponse;
    const user = await requireUser(req);
    for (const handler of [accounts, connections, transactions, reporting]) {
      const response = await handler(req, path, user);
      if (response) return response;
    }
    throw new ApiError(404, "NOT_FOUND", "Route not found");
  } catch (e) {
    if (e instanceof ApiError)
      return ok(
        { error: { code: e.code, message: e.message }, requestId },
        e.status,
      );
    if (e instanceof z.ZodError)
      return ok(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Invalid input",
            fields: e.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          requestId,
        },
        400,
      );
    const code = (e as { code?: string })?.code;
    if (code === "23505")
      return ok(
        {
          error: { code: "CONFLICT", message: "Record already exists" },
          requestId,
        },
        409,
      );
    // Log only a generated correlation id; provider errors can contain access tokens.
    console.error("Request failed", requestId);
    return ok(
      {
        error: { code: "INTERNAL_ERROR", message: "Request failed; try again" },
        requestId,
      },
      500,
    );
  }
}
