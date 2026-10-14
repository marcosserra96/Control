// Simula navegadores recentes (Chrome/Edge 15x), em que os métodos de rolagem devolvem Promise.
// O Chromium usado nos testes ainda devolve undefined; sem isto, bugs desse tipo passam despercebidos.
export async function emulateModernBrowser(context) {
  await context.addInitScript(() => {
    for (const target of [window, Element.prototype]) {
      for (const name of ['scrollTo', 'scroll', 'scrollBy']) {
        const original = target[name]
        if (typeof original !== 'function') continue
        target[name] = function (...args) {
          original.apply(this, args)
          return Promise.resolve()
        }
      }
    }
    const into = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) { into.apply(this, args); return Promise.resolve() }
  })
}
