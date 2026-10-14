export type ThemePref = 'dark' | 'light' | 'system'

const KEY = 'control:theme'

export function getTheme(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'system' ? v : 'dark'
}

export function applyTheme(pref: ThemePref = getTheme()) {
  document.documentElement.dataset.theme = pref
  const dark =
    pref === 'dark' || (pref === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1218' : '#f3f4f7')
}

export function setTheme(pref: ThemePref) {
  localStorage.setItem(KEY, pref)
  applyTheme(pref)
}
