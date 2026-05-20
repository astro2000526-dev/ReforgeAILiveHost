// Fixed demo user. Matches the profile seeded by
// supabase/migrations/0002_demo_seed.sql. All MVP-demo projects belong to it.
//
// When we wire real Supabase Auth, replace usages with `session.user.id`.

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001'
