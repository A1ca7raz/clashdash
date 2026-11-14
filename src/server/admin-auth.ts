import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { generateSecret, generateURI, verify } from "otplib";
import type { Db } from "@/db";
import { adminAuth, type AdminAuth } from "@/db/schema";

const scryptAsync = promisify(scrypt);
const ADMIN_ID = 1;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type AuthDb = Db | Tx;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPasswordHash(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function ensureAdminAuth(db: Db): Promise<AdminAuth> {
  const [existing] = await db.select().from(adminAuth).where(eq(adminAuth.id, ADMIN_ID));
  if (existing) return existing;
  const initialPassword = process.env.ADMIN_PASSWORD;
  if (!initialPassword) throw new Error("管理员尚未初始化，请设置 ADMIN_PASSWORD");
  const passwordHash = await hashPassword(initialPassword);
  await db.insert(adminAuth).values({ id: ADMIN_ID, passwordHash }).onConflictDoNothing();
  const [row] = await db.select().from(adminAuth).where(eq(adminAuth.id, ADMIN_ID));
  if (!row) throw new Error("管理员初始化失败");
  return row;
}

export async function verifyAdminPassword(db: Db, password: string): Promise<AdminAuth | null> {
  const row = await ensureAdminAuth(db);
  return (await verifyPasswordHash(password, row.passwordHash)) ? row : null;
}

async function consumeTotp(db: AuthDb, row: AdminAuth, secret: string, token: string) {
  if (!/^\d{6}$/.test(token.trim())) throw new Error("请输入六位验证码");
  const result = await verify({
    strategy: "totp",
    secret,
    token: token.trim(),
    epochTolerance: 30,
    afterTimeStep: row.totpLastCounter ?? undefined,
  });
  if (!result.valid || !("timeStep" in result)) throw new Error("验证码无效或已使用");
  const accepted = await db
    .update(adminAuth)
    .set({ totpLastCounter: result.timeStep })
    .where(
      and(
        eq(adminAuth.id, ADMIN_ID),
        or(isNull(adminAuth.totpLastCounter), lt(adminAuth.totpLastCounter, result.timeStep)),
      ),
    )
    .returning({ id: adminAuth.id });
  if (!accepted.length) throw new Error("验证码无效或已使用");
}

export async function changeAdminPassword(db: Db, currentPassword: string, newPassword: string, token: string) {
  if (!(await verifyAdminPassword(db, currentPassword))) throw new Error("当前密码错误");
  if (newPassword.length < 8) throw new Error("新密码至少需要 8 个字符");
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(adminAuth).where(eq(adminAuth.id, ADMIN_ID));
    if (!row) throw new Error("管理员不存在");
    if (row.totpSecret) await consumeTotp(tx, row, row.totpSecret, token);
    const authVersion = row.authVersion + 1;
    await tx.update(adminAuth).set({ passwordHash, authVersion, updatedAt: new Date() }).where(eq(adminAuth.id, ADMIN_ID));
    return authVersion;
  });
}

export async function startTotpEnrollment(db: Db, password: string) {
  if (!(await verifyAdminPassword(db, password))) throw new Error("当前密码错误");
  const row = await ensureAdminAuth(db);
  if (row.totpSecret) throw new Error("两步验证已启用");
  const secret = generateSecret();
  await db.update(adminAuth).set({ totpPendingSecret: secret, updatedAt: new Date() }).where(eq(adminAuth.id, ADMIN_ID));
  return { secret, uri: generateURI({ issuer: "ClashDash", label: "admin", secret }) };
}

export async function confirmTotpEnrollment(db: Db, token: string) {
  await ensureAdminAuth(db);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(adminAuth).where(eq(adminAuth.id, ADMIN_ID));
    if (!row?.totpPendingSecret) throw new Error("请先生成两步验证密钥");
    if (row.totpSecret) throw new Error("两步验证已启用");
    await consumeTotp(tx, row, row.totpPendingSecret, token);
    const authVersion = row.authVersion + 1;
    await tx
      .update(adminAuth)
      .set({
        totpSecret: row.totpPendingSecret,
        totpPendingSecret: null,
        authVersion,
        updatedAt: new Date(),
      })
      .where(eq(adminAuth.id, ADMIN_ID));
    return authVersion;
  });
}

export async function disableAdminTotp(db: Db, password: string, token: string) {
  if (!(await verifyAdminPassword(db, password))) throw new Error("当前密码错误");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(adminAuth).where(eq(adminAuth.id, ADMIN_ID));
    if (!row?.totpSecret) throw new Error("两步验证未启用");
    await consumeTotp(tx, row, row.totpSecret, token);
    const authVersion = row.authVersion + 1;
    await tx
      .update(adminAuth)
      .set({ totpSecret: null, totpPendingSecret: null, totpLastCounter: null, authVersion, updatedAt: new Date() })
      .where(eq(adminAuth.id, ADMIN_ID));
    return authVersion;
  });
}

export async function verifyTotpLogin(db: Db, token: string, authVersion: number) {
  await ensureAdminAuth(db);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(adminAuth).where(eq(adminAuth.id, ADMIN_ID));
    if (!row?.totpSecret || row.authVersion !== authVersion) throw new Error("登录验证已失效，请重新输入密码");
    await consumeTotp(tx, row, row.totpSecret, token);
    return row.authVersion;
  });
}
