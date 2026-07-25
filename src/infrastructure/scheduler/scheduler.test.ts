import { describe, expect, it } from 'vitest'

import { cronExpressionForInterval } from './node-cron-scheduler.ts'

describe('provider scheduler', () => {
  it('uses cron only when an interval can be represented exactly', () => {
    expect(cronExpressionForInterval(10)).toBe('*/10 * * * * *')
    expect(cronExpressionForInterval(300)).toBe('0 */5 * * * *')
    expect(cronExpressionForInterval(3600)).toBe('0 0 */1 * * *')
    expect(cronExpressionForInterval(90)).toBeUndefined()
  })
})
