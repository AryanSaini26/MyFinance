import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const password = randomBytes(24).toString("hex");
const template = (await readFile(".env.example", "utf8"))
  .replaceAll("replace_with_local_database_password", password)
  .replace("replace_with_64_hex_characters", randomBytes(32).toString("hex"))
  .replace(
    "replace_with_a_random_secret_at_least_32_characters",
    randomBytes(32).toString("hex"),
  );
try {
  await writeFile(".env", template, { flag: "wx", mode: 0o600 });
  console.log("Created .env for local mock mode. Keep it private.");
} catch (e) {
  if (e.code === "EEXIST") {
    console.error(".env already exists; kept the existing configuration.");
    process.exitCode = 1;
  } else throw e;
}
