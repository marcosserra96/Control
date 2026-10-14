// Verifica que nenhuma tela tem rolagem horizontal no celular (390px).
// Uso: npm run demo (outro terminal) && node tests/overflow.mjs
import { chromium } from '@playwright/test'
const base = process.env.BASE ?? 'http://localhost:5180'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(base + '/', { waitUntil: 'networkidle' })
// Coleta as rotas, inclusive o detalhe de cada conta, navegando por dentro do app
const ids = await page.locator('a[href^="/contas/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))])
const routes = ['/', '/extrato', '/contas', ...ids, '/planejar', '/planejar/recorrentes', '/planejar/metas', '/relatorios', '/categorias', '/nomes', '/importar', '/ajustes', '/mais']
let failed = 0
for (const r of routes) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')) }, r)
  await page.waitForTimeout(500)
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  const ok = scroll <= client
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r} (${scroll}/${client})`)
}
await browser.close()
process.exit(failed ? 1 : 0)
