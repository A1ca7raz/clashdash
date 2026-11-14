import { eq } from "drizzle-orm";
import { generate } from "otplib";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { adminAuth } from "@/db/schema";
import { exportAll, importAll } from "@/server/backup";
import {
  changeAdminPassword,
  confirmTotpEnrollment,
  disableAdminTotp,
  ensureAdminAuth,
  startTotpEnrollment,
  verifyAdminPassword,
  verifyPasswordHash,
  verifyTotpLogin,
} from "./admin-auth";

let db: Db;
const oldPassword = process.env.ADMIN_PASSWORD;

beforeEach(async () => {
  process.env.ADMIN_PASSWORD = "initial-password";
  db = await createDb("memory://");
}, 60_000);

afterEach(() => {
  if (oldPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = oldPassword;
});

describe("admin authentication", () => {
  it("initializes a scrypt password from the environment only once", async () => {
    const row = await ensureAdminAuth(db);
    expect(row.passwordHash).not.toContain("initial-password");
    expect(await verifyPasswordHash("initial-password", row.passwordHash)).toBe(true);
    expect(await verifyPasswordHash("wrong", row.passwordHash)).toBe(false);

    process.env.ADMIN_PASSWORD = "changed-environment";
    expect((await verifyAdminPassword(db, "initial-password"))?.id).toBe(1);
    expect(await verifyAdminPassword(db, "changed-environment")).toBeNull();
  });

  it("changes the password and increments the session version", async () => {
    expect(await changeAdminPassword(db, "initial-password", "new-password", "")).toBe(2);
    expect(await verifyAdminPassword(db, "initial-password")).toBeNull();
    expect((await verifyAdminPassword(db, "new-password"))?.authVersion).toBe(2);
    await expect(changeAdminPassword(db, "wrong", "another-password", "")).rejects.toThrow("当前密码错误");
  });

  it("enrolls TOTP, prevents token replay and disables it", async () => {
    const enrollment = await startTotpEnrollment(db, "initial-password");
    expect(enrollment.uri).toContain("otpauth://totp/");
    expect((await ensureAdminAuth(db)).totpSecret).toBeNull();

    const token = await generate({ secret: enrollment.secret });
    expect(await confirmTotpEnrollment(db, token)).toBe(2);
    const enabled = await ensureAdminAuth(db);
    expect(enabled.totpSecret).toBe(enrollment.secret);
    expect(enabled.totpPendingSecret).toBeNull();
    await expect(verifyTotpLogin(db, token, 2)).rejects.toThrow("验证码无效或已使用");

    await db.update(adminAuth).set({ totpLastCounter: null }).where(eq(adminAuth.id, 1));
    expect(await verifyTotpLogin(db, token, 2)).toBe(2);
    await expect(verifyTotpLogin(db, token, 2)).rejects.toThrow("验证码无效或已使用");
    await expect(verifyTotpLogin(db, token, 1)).rejects.toThrow("登录验证已失效");

    await db.update(adminAuth).set({ totpLastCounter: null }).where(eq(adminAuth.id, 1));
    expect(await disableAdminTotp(db, "initial-password", token)).toBe(3);
    expect((await ensureAdminAuth(db)).totpSecret).toBeNull();
  });

  it("keeps administrator credentials out of business backups", async () => {
    const before = await ensureAdminAuth(db);
    const backup = await exportAll(db);
    expect(backup.data).not.toHaveProperty("adminAuth");
    expect(JSON.stringify(backup)).not.toContain(before.passwordHash);
    await importAll(db, backup);
    expect(await ensureAdminAuth(db)).toEqual(before);
  });
});
