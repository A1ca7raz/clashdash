import { jwtVerify } from "jose/jwt/verify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, createTotpChallenge, verifySessionToken, verifyTotpChallenge } from "./session";

const originalTtl = process.env.JWT_SESSION_TTL;

beforeEach(() => {
  process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
  delete process.env.JWT_SESSION_TTL;
});

afterEach(() => {
  if (originalTtl === undefined) delete process.env.JWT_SESSION_TTL;
  else process.env.JWT_SESSION_TTL = originalTtl;
});

async function tokenLifetime(token: string): Promise<number> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
  return payload.exp! - payload.iat!;
}

describe("session tokens", () => {
  it("accepts only typed session tokens and exposes the auth version", async () => {
    const token = await createSessionToken(4);
    expect(await verifySessionToken(token)).toEqual({ authVersion: 4 });
    expect(await verifyTotpChallenge(token)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("invalid")).toBeNull();
  });

  it("keeps the TOTP preauthentication challenge separate", async () => {
    const challenge = await createTotpChallenge(7);
    expect(await verifyTotpChallenge(challenge)).toEqual({ authVersion: 7, attempts: 0 });
    expect(await verifySessionToken(challenge)).toBeNull();
  });

  it("uses a 24-hour session by default", async () => {
    expect(await tokenLifetime(await createSessionToken())).toBe(86400);
  });

  it("uses JWT_SESSION_TTL for the session and rejects invalid values", async () => {
    process.env.JWT_SESSION_TTL = "3600";
    expect(await tokenLifetime(await createSessionToken())).toBe(3600);

    for (const value of ["0", "-1", "1.5", "abc"]) {
      process.env.JWT_SESSION_TTL = value;
      expect(() => createSessionToken()).toThrow("JWT_SESSION_TTL 必须是正整数（秒）");
    }
  });
});

describe("totp challenge attempts", () => {
  it("carries the attempts counter", async () => {
    expect(await verifyTotpChallenge(await createTotpChallenge(3, 4))).toEqual({ authVersion: 3, attempts: 4 });
  });

  it("rejects tampered tokens", async () => {
    const token = await createTotpChallenge(3, 1);
    const tampered = `${token.slice(0, -2)}aa`;
    expect(await verifyTotpChallenge(tampered)).toBeNull();
  });
});
