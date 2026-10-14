// Importação de extrato ponta a ponta no modo demonstração.
// Uso: npm run demo (outro terminal) && node tests/import.mjs
import { chromium, expect } from '@playwright/test'
import { emulateModernBrowser } from './modern-browser.mjs'

const base = process.env.BASE ?? 'http://localhost:5180'
const out = process.env.OUT ?? 'screenshots'
const fixture = (f) => new URL(`./fixtures/${f}`, import.meta.url).pathname
const browser = await chromium.launch()
const errors = []

for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1 })
  await emulateModernBrowser(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  // Consulta pública de CNPJ simulada (o teste não depende da internet)
  await page.route('https://brasilapi.com.br/api/cnpj/v1/**', (route) => route.fulfill({
    json: { nome_fantasia: 'ACADEMIA CORPO SÃO', razao_social: 'CORPO SAO FITNESS LTDA', cnae_fiscal_descricao: 'Atividades de condicionamento físico' },
  }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  if (name === 'mobile') {
    await page.getByRole('link', { name: 'Mais' }).click()
    await page.getByRole('link', { name: /Importar extrato/ }).click()
  } else {
    await page.getByRole('link', { name: 'Importar extrato' }).click()
  }
  await page.screenshot({ path: `${out}/import-1-${name}.png`, fullPage: true })

  // Extrato da conta: salário, aluguel e pagamento da fatura já existem no app
  await page.getByLabel('Arquivo do extrato').setInputFiles(fixture('nubank-conta.ofx'))
  await expect(page.getByRole('tab', { name: 'Novos (5)' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Já no app (3)' })).toBeVisible()
  await expect(page.getByLabel('Extrato de qual conta?')).toHaveValue(/.+/)
  // De/para que já existe e nome encontrado pelo CNPJ
  await expect(page.locator('input[value="Feira do José"]')).toBeVisible()
  await expect(page.getByText('seu nome')).toBeVisible()
  await expect(page.locator('input[value="Academia Corpo São"]')).toBeVisible()
  await expect(page.getByText('pelo CNPJ')).toBeVisible()
  // Corrigir um nome oferece lembrar
  await page.locator('input[value="Restaurante Sabor Caseiro"]').fill('Almoço com a equipe')
  await expect(page.getByText('Lembrar este nome nas próximas importações')).toBeVisible()
  await page.screenshot({ path: `${out}/import-2-${name}.png`, fullPage: name === 'desktop' })
  await page.getByRole('tab', { name: 'Já no app (3)' }).click()
  await page.screenshot({ path: `${out}/import-3-${name}.png` })
  await page.getByRole('tab', { name: 'Novos (5)' }).click()
  await page.getByRole('button', { name: 'Importar 5' }).click()
  await expect(page.getByText('5 lançamentos importados')).toBeVisible()
  await expect(page.getByText(/1 nome corrigido foi lembrado/)).toBeVisible()
  await expect(page.getByText(/3 lançamentos que você já tinha feito/)).toBeVisible()
  await page.screenshot({ path: `${out}/import-4-${name}.png` })

  // Importar de novo o mesmo arquivo não duplica nada
  await page.getByRole('button', { name: 'Importar outro arquivo' }).click()
  await page.getByLabel('Arquivo do extrato').setInputFiles(fixture('nubank-conta.ofx'))
  await expect(page.getByRole('tab', { name: 'Novos (0)' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Já no app (8)' })).toBeVisible()

  // Fatura do cartão: escolhe o cartão e ignora o pagamento
  await page.getByRole('button', { name: 'Trocar arquivo' }).click()
  await page.getByLabel('Arquivo do extrato').setInputFiles(fixture('Nubank_2026-11-10.csv'))
  await page.getByLabel('Fatura de qual cartão?').selectOption({ label: 'Cartão roxo' })
  await expect(page.getByRole('tab', { name: 'Ignorados (1)' })).toBeVisible()
  await page.screenshot({ path: `${out}/import-5-${name}.png`, fullPage: name === 'desktop' })

  // Desfazer
  const importBtn = page.getByRole('button', { name: /^Importar \d+$/ })
  await importBtn.click()
  await page.getByRole('button', { name: 'Desfazer importação' }).click()
  await expect(page.getByText(/Importação desfeita/)).toBeVisible()

  // A regra aprendida aparece em Nomes do extrato
  await page.getByRole('link', { name: name === 'mobile' ? 'Início' : 'Nomes do extrato' }).first().click()
  if (name === 'mobile') {
    await page.getByRole('link', { name: 'Mais' }).click()
    await page.getByRole('link', { name: /Nomes do extrato/ }).click()
  }
  await expect(page.getByText('restaurante sabor caseiro')).toBeVisible()
  await expect(page.getByText('Almoço com a equipe')).toBeVisible()
  await page.screenshot({ path: `${out}/import-6-${name}.png` })
  await page.close()
}

await browser.close()
if (errors.length) { console.log('ERROS:', errors); process.exit(1) }
console.log('importação OK')
