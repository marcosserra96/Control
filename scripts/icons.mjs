// Gera os ícones PNG do app a partir de public/icon.svg (usa o Chromium do Playwright).
// Uso: node scripts/icons.mjs
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
// Versão "maskable": quadrada e com o desenho dentro da área segura (80%) do recorte do Android/iOS
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#e3ae4a"/>
  <path d="M328 170.2A112 112 0 1 0 328 341.8" fill="none" stroke="#1a1408" stroke-width="46" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="35" fill="#1a1408"/>
</svg>`

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, size, source] of [
  ['pwa-192.png', 192, svg], ['pwa-512.png', 512, svg], ['pwa-maskable-512.png', 512, maskable], ['apple-touch-icon.png', 180, maskable],
]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true })
}
await browser.close()
console.log('ícones gerados')
