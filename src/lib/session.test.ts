import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, createTotpChallenge, verifySessionToken, verifyTotpChallenge } from "./session";

beforeEach(() => {
  process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
});

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
    expect(await verifyTotpChallenge(challenge)).toEqual({ authVersion: 7 });
    expect(await verifySessionToken(challenge)).toBeNull();
  });
});
