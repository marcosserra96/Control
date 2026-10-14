import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error script em JS puro
import { bundle } from '../../scripts/db-bundle.mjs'

describe('supabase/setup.sql', () => {
  it('está igual às migrações (rode npm run db:bundle se falhar)', async () => {
    const current = readFileSync(new URL('../../supabase/setup.sql', import.meta.url), 'utf8')
    expect(current).toBe(await bundle())
  })
})
