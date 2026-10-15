import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
} from "node:crypto";
const scrypt = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    rawScrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt)) as Buffer;
  return `scrypt$32768$8$3$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [method, n, r, p, salt, key] = hash.split("$");
  if (
    method !== "scrypt" ||
    n !== "32768" ||
    r !== "8" ||
    p !== "3" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(key ?? "")
  )
    return false;
  return timingSafeEqual(
    (await scrypt(password, salt)) as Buffer,
    Buffer.from(key, "hex"),
  );
}
function encryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes in hex");
  return Buffer.from(key, "hex");
}
// Wire format shared with Go: base64(nonce[12] | ciphertext | GCM tag[16]).
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  return Buffer.concat([
    iv,
    cipher.update(token, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function decryptToken(value: string) {
  const b = Buffer.from(value, "base64");
  const d = createDecipheriv("aes-256-gcm", encryptionKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString(
    "utf8",
  );
}
