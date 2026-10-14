// Captura telas do modo demonstração para revisão visual.
// Uso: npm run demo (em outro terminal) e depois node tests/shots.mjs [rota...]
import { chromium } from '@playwright/test'

const base = process.env.BASE ?? 'http://localhost:5180'
const out = process.env.OUT ?? 'screenshots'
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/extrato', '/contas', '/planejar', '/relatorios']
const viewports = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } }
const only = process.env.VP

const browser = await chromium.launch()
const errors = []
for (const [name, viewport] of Object.entries(viewports)) {
  if (only && only !== name) continue
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`))
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const file = `${out}/${name}${r.replace(/\//g, '_') || '_root'}.png`
    await page.screenshot({ path: file, fullPage: process.env.FULL !== '0' })
    console.log(file)
  }
  await ctx.close()
}
await browser.close()
if (errors.length) console.log('ERROS:\n' + errors.join('\n'))
