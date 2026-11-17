import { eq } from "drizzle-orm";
import { generate } from "otplib";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { adminAuth } from "@/db/schema";
import { exportAll, importAll } from "@/server/backup";
import {
  applyAdminPasswordOverride,
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
const oldPassword = process.env.ADMIN_INITIAL_PASSWORD;
const oldOverridePassword = process.env.ADMIN_OVERRIDE_PASSWORD;

beforeEach(async () => {
  process.env.ADMIN_INITIAL_PASSWORD = "initial-password";
  delete process.env.ADMIN_OVERRIDE_PASSWORD;
  db = await createDb("memory://");
}, 60_000);

afterEach(() => {
  if (oldPassword === undefined) delete process.env.ADMIN_INITIAL_PASSWORD;
  else process.env.ADMIN_INITIAL_PASSWORD = oldPassword;
  if (oldOverridePassword === undefined) delete process.env.ADMIN_OVERRIDE_PASSWORD;
  else process.env.ADMIN_OVERRIDE_PASSWORD = oldOverridePassword;
});

describe("admin authentication", () => {
  it("initializes a scrypt password from the environment only once", async () => {
    const row = await ensureAdminAuth(db);
    expect(row.passwordHash).not.toContain("initial-password");
    expect(await verifyPasswordHash("initial-password", row.passwordHash)).toBe(true);
    expect(await verifyPasswordHash("wrong", row.passwordHash)).toBe(false);

    process.env.ADMIN_INITIAL_PASSWORD = "changed-environment";
    expect((await verifyAdminPassword(db, "initial-password"))?.id).toBe(1);
    expect(await verifyAdminPassword(db, "changed-environment")).toBeNull();
  });

  it("changes the password and increments the session version", async () => {
    await ensureAdminAuth(db);
    expect(await changeAdminPassword(db, "initial-password", "new-password", "")).toBe(2);
    expect(await verifyAdminPassword(db, "initial-password")).toBeNull();
    expect((await verifyAdminPassword(db, "new-password"))?.authVersion).toBe(2);
    await expect(changeAdminPassword(db, "wrong", "another-password", "")).rejects.toThrow("当前密码错误");
  });

  it("overrides the password, clears TOTP, and invalidates previous sessions on each startup", async () => {
    await ensureAdminAuth(db);
    await db
      .update(adminAuth)
      .set({ totpSecret: "enabled-secret", totpPendingSecret: "pending-secret", totpLastCounter: 42 })
      .where(eq(adminAuth.id, 1));
    process.env.ADMIN_OVERRIDE_PASSWORD = "recovery-password";
    await expect(applyAdminPasswordOverride(db)).resolves.toBe(true);
    expect(await verifyAdminPassword(db, "initial-password")).toBeNull();
    const recovered = await verifyAdminPassword(db, "recovery-password");
    expect(recovered).toMatchObject({
      authVersion: 2,
      totpSecret: null,
      totpPendingSecret: null,
      totpLastCounter: null,
    });

    await expect(applyAdminPasswordOverride(db)).resolves.toBe(true);
    expect((await verifyAdminPassword(db, "recovery-password"))?.authVersion).toBe(3);
    delete process.env.ADMIN_OVERRIDE_PASSWORD;
    await expect(applyAdminPasswordOverride(db)).resolves.toBe(false);
    expect((await ensureAdminAuth(db)).authVersion).toBe(3);
  });

  it("enrolls TOTP, prevents token replay and disables it", async () => {
    await ensureAdminAuth(db);
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
