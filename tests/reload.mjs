// Reabre cada tela com os dados guardados no aparelho (cache local), como acontece no uso real.
// Uso: build de produção servido em BASE (ex.: vite build --mode demo && vite preview)
import { chromium } from '@playwright/test'
const base = process.env.BASE ?? 'http://localhost:5191'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const routes = ['/', '/extrato', '/contas', '/contas/acc-1', '/contas/acc-4', '/planejar', '/planejar/recorrentes',
  '/planejar/metas', '/relatorios', '/importar', '/nomes', '/categorias', '/ajustes']
let failed = 0
for (const r of routes) {
  await page.goto(base + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500) // espera o cache local ser gravado
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const broken = await page.getByText(/Unexpected Application Error|Não foi possível abrir esta tela/).count()
  if (broken) failed++
  console.log(`${broken ? 'FAIL' : 'ok  '} ${r}`)
}
await browser.close()
if (errors.length) console.log('ERROS:', [...new Set(errors)])
process.exit(failed || errors.length ? 1 : 0)
