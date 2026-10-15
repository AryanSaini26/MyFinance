import { z } from "zod";
export const uuid = z.uuid();
export const currency = z.enum(["CAD", "USD"]);
export const category = z.string().min(1).max(40);
export const calendarMonth = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "Invalid calendar month");
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return (
      !v.startsWith("0000") &&
      !isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v
    );
  }, "Invalid calendar date");
export const money = z
  .string()
  .regex(
    /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/,
    "Use a decimal amount with at most two decimal places",
  );
export const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
export const entry = z
  .object({
    accountId: uuid,
    description: z.string().trim().min(1).max(300),
    amount: money,
    date,
    categoryId: category.optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();
