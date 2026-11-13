import strings from '../../content/ui.json'

/**
 * Interface copy lives in content/ui.json (CLAUDE.md: no copy in JS or HTML).
 *
 *   t('panel.close')                       -> "Close"
 *   t('panel.imageAlt', { title: 'X' })    -> "Image for X"
 *
 * Markup opts in with attributes, filled once at start-up by
 * `applyUiStrings()`: `data-ui="key"` sets the text, `data-ui-aria-label`
 * and `data-ui-title` set those attributes.
 */
export function t(key, vars) {
  const value = key.split('.').reduce((node, part) => node?.[part], strings)
  if (typeof value !== 'string') {
    if (import.meta.env?.DEV) console.warn(`ui.json: missing string "${key}"`)
    return key
  }
  return vars ? value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : value
}

export function applyUiStrings(root = document) {
  for (const el of root.querySelectorAll('[data-ui]')) el.textContent = t(el.dataset.ui)
  for (const el of root.querySelectorAll('[data-ui-aria-label]')) el.setAttribute('aria-label', t(el.dataset.uiAriaLabel))
  for (const el of root.querySelectorAll('[data-ui-title]')) el.setAttribute('title', t(el.dataset.uiTitle))
}

export const uiStrings = strings
