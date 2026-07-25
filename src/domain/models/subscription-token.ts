import type { Profile } from './profile.ts'

export type SubscriptionToken = {
  id: string
  note?: string
  profile: Profile
  token: string
}
