import { jwtVerify, SignJWT } from 'jose'

import type { AdminTokenService } from '../../application/ports/admin-token-service.ts'

export type JoseAdminTokenOptions = {
  issuer?: string
  audience?: string
  expiresIn?: string | number
}

export class JoseAdminTokenService implements AdminTokenService {
  private readonly key: Uint8Array
  private readonly issuer: string
  private readonly audience: string
  private readonly expiresIn: string | number

  constructor(secret: Uint8Array | string, options: JoseAdminTokenOptions = {}) {
    this.key = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret
    if (this.key.byteLength < 32) throw new Error('JWT secret must contain at least 32 bytes')
    this.issuer = options.issuer ?? 'clashdash'
    this.audience = options.audience ?? 'clashdash-admin'
    this.expiresIn = options.expiresIn ?? '24h'
  }

  async issue(username: string): Promise<string> {
    if (!username) throw new Error('Username is required')
    return new SignJWT({ username })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(username)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.key)
  }

  async verify(token: string): Promise<{ username: string }> {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: this.issuer,
      audience: this.audience,
    })
    if (typeof payload.username !== 'string' || payload.username !== payload.sub) {
      throw new Error('Admin token has invalid claims')
    }
    return { username: payload.username }
  }
}
