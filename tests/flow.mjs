// Fluxo ponta a ponta no modo demonstração: lança uma compra parcelada no cartão
// e confere a fatura. Uso: npm run demo (outro terminal) && node tests/flow.mjs
import { chromium, expect } from '@playwright/test'

const base = process.env.BASE ?? 'http://localhost:5180'
const out = process.env.OUT ?? 'screenshots'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.screenshot({ path: `${out}/flow-1-home.png` })

// Reabrir o app usa os dados guardados no aparelho: nada pode quebrar
await page.waitForTimeout(2500) // o cache local é gravado a cada 2s
await page.reload({ waitUntil: 'networkidle' })
await expect(page.getByText('Saldo em contas')).toBeVisible()

await page.getByRole('button', { name: 'Novo lançamento' }).last().click()
const dialog = page.getByRole('dialog')
await expect(dialog.getByText('Nova despesa')).toBeVisible()
await dialog.getByLabel('Valor').fill('1.200,00')
await dialog.getByLabel('Descrição').fill('Fone de ouvido')
await dialog.getByRole('radio', { name: 'Compras' }).click()
await dialog.getByLabel('Pago com').selectOption({ label: 'Cartão roxo' })
await page.screenshot({ path: `${out}/flow-2-sheet.png` })
await dialog.getByRole('button', { name: 'Parcelar, repetir ou anotar' }).click()
await dialog.getByLabel('Parcelas').selectOption('6')
await expect(dialog.getByText('6× de R$')).toBeVisible()
await page.screenshot({ path: `${out}/flow-3-installments.png` })
await dialog.getByRole('button', { name: 'Salvar' }).click()
await expect(page.getByText('6 parcelas lançadas')).toBeVisible()

// Validação: salvar sem valor mostra erro
await page.getByRole('button', { name: 'Novo lançamento' }).last().click()
await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
await expect(page.getByRole('dialog').getByText('Informe um valor maior que zero.')).toBeVisible()
await page.keyboard.press('Escape')

// Fatura do cartão
await page.getByRole('link', { name: 'Mais' }).click()
await page.getByRole('link', { name: /Contas e cartões/ }).click()
await page.locator('a[href^="/contas/"]', { hasText: 'Cartão roxo' }).click()
await expect(page.getByText(/Fone de ouvido/).first()).toBeVisible()
await page.screenshot({ path: `${out}/flow-4-card.png`, fullPage: true })

// Pagar fatura abre transferência já preenchida
await page.getByRole('button', { name: 'Fatura anterior' }).click()
const pay = page.getByRole('button', { name: 'Pagar fatura' })
if (await pay.isVisible()) {
  await pay.click()
  await expect(page.getByRole('dialog').getByText('Nova transferência')).toBeVisible()
  await page.screenshot({ path: `${out}/flow-5-pay.png` })
  await page.keyboard.press('Escape')
}

// Editar e excluir parcela
await page.getByRole('link', { name: 'Extrato' }).click()
await page.getByRole('button', { name: /Fone de ouvido/ }).first().click()
await page.getByRole('button', { name: 'Excluir lançamento' }).click()
await expect(page.getByText('Excluir esta e as próximas')).toBeVisible()
await page.screenshot({ path: `${out}/flow-6-delete.png` })
await page.getByText('Excluir esta e as próximas').click()
await expect(page.getByText('Parcelas excluídas')).toBeVisible()

await browser.close()
if (errors.length) { console.log('ERROS:', errors); process.exit(1) }
console.log('fluxo OK')
