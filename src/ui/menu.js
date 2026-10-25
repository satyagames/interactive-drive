import { t, uiStrings } from '../content/ui.js'

/**
 * The Esc menu (doc 05 §5): Resume · Explore mode · Passport & badges ·
 * Controls · Audio · Graphics · Reset progress · Credits.
 *
 * A modal dialog: focus moves in, Tab is kept inside, Esc goes back a view
 * and then closes (routed through `main.js`), and focus returns to where it
 * was (the Menu button, or the game canvas when Esc opened it). The game pauses while it is open (`isOpen`, read by the loop).
 * Explore, Passport and Audio are their own screens; their buttons here are
 * those screens' launchers, and choosing one closes the menu first.
 */
const TIERS = ['low', 'medium', 'high']

export function createMenu({ root, launcher, gameFocus, game, getQuality, setQuality, onOpenChange }) {
  const dialog = root.querySelector('[role="dialog"]')
  const title = root.querySelector('#menu-title')
  const views = Object.fromEntries([...root.querySelectorAll('[data-view]')].map((v) => [v.dataset.view, v]))
  dialog.dataset.capturesKeys = '' // arrows and Space belong to the menu
  title.textContent = t('menu.title')
  let current = 'main'
  let returnTo = null

  const make = (tag, props = {}, ...children) => {
    const node = document.createElement(tag)
    Object.assign(node, props)
    node.append(...children)
    return node
  }

  function subview(name, heading, ...body) {
    const back = make('button', { type: 'button', className: 'menu__back', textContent: t('menu.back') })
    back.addEventListener('click', () => showView('main'))
    const h = make('h3', { id: `menu-${name}-title`, tabIndex: -1, textContent: heading })
    views[name].setAttribute('role', 'group')
    views[name].setAttribute('aria-labelledby', h.id)
    views[name].replaceChildren(h, ...body, back)
  }

  // ---- Controls ------------------------------------------------------------
  const c = uiStrings.controls
  const table = make('table', { className: 'menu__controls' })
  table.append(make('caption', { className: 'sr-only', textContent: c.title }))
  const head = make('tr')
  for (const key of ['action', 'keyboard', 'gamepad', 'touch']) head.append(make('th', { scope: 'col', textContent: c[key] }))
  table.append(make('thead', {}, head))
  const body = make('tbody')
  for (const row of c.rows) {
    const tr = make('tr', {}, make('th', { scope: 'row', textContent: row.action }))
    for (const key of ['keyboard', 'gamepad', 'touch']) tr.append(make('td', { textContent: row[key] }))
    body.append(tr)
  }
  table.append(body)
  subview('controls', c.title, make('div', { className: 'menu__scroll', tabIndex: 0 }, table))
  views.controls.querySelector('.menu__scroll').setAttribute('aria-label', c.title)

  // ---- Graphics --------------------------------------------------------------
  const fieldset = make('fieldset', { className: 'menu__tiers' })
  fieldset.append(make('legend', { className: 'sr-only', textContent: t('menu.graphics') }))
  const radios = TIERS.map((tier) => {
    const input = make('input', { type: 'radio', name: 'quality', value: tier, id: `quality-${tier}` })
    input.setAttribute('aria-describedby', `quality-${tier}-note`)
    input.addEventListener('change', () => input.checked && setQuality(tier))
    const label = make('label', { htmlFor: input.id },
      make('span', { className: 'menu__tier-name', textContent: t(`menu.${tier}`) }),
      make('span', { className: 'menu__tier-note', id: `quality-${tier}-note`, textContent: t(`menu.${tier}Note`) }))
    fieldset.append(make('div', { className: 'menu__tier' }, input, label))
    return input
  })
  subview('graphics', t('menu.graphics'), make('p', { textContent: t('menu.graphicsIntro') }), fieldset)

  // ---- Reset -----------------------------------------------------------------
  const confirm = make('button', { type: 'button', className: 'menu__danger', textContent: t('menu.resetConfirm') })
  confirm.addEventListener('click', () => game.resetProgress())
  const cancel = make('button', { type: 'button', textContent: t('menu.resetCancel') })
  cancel.addEventListener('click', () => showView('main'))
  subview('reset', t('menu.reset'), make('p', { textContent: t('menu.resetIntro') }), make('div', { className: 'menu__row' }, confirm, cancel))

  // ---- Credits -----------------------------------------------------------------
  const team = make('p', {}, t('credits.team'), ' ', make('span', { className: 'menu__tag', textContent: t('credits.placeholderTag') }))
  subview('credits', t('credits.title'),
    make('p', { textContent: t('credits.intro') }), team,
    make('p', { textContent: t('credits.software') }),
    make('p', { textContent: t('credits.reference') }),
    make('p', { textContent: t('credits.audio') }))

  // ---- main list -------------------------------------------------------------
  root.querySelector('[data-action="resume"]').addEventListener('click', () => hide())
  for (const button of root.querySelectorAll('[data-view-open]')) {
    button.addEventListener('click', () => showView(button.dataset.viewOpen))
  }
  // Explore / Passport / Audio open their own screens: close the menu first
  // (capture, so it runs before the screen's own launcher handler).
  for (const id of ['explore-open', 'passport-open', 'sound-open']) {
    root.querySelector(`#${id}`).addEventListener('click', () => hide({ restoreFocus: false }), true)
  }

  function showView(name) {
    for (const [key, view] of Object.entries(views)) view.hidden = key !== name
    const from = current
    current = name
    if (name === 'graphics') for (const r of radios) r.checked = r.value === getQuality()
    if (name === 'main') {
      // Back from a sub-view lands on the button that opened it.
      const opener = root.querySelector(`[data-view-open="${from}"]`)
      ;(opener ?? root.querySelector('[data-action="resume"]')).focus()
    } else {
      views[name].querySelector('h3').focus()
    }
  }

  // Keep Tab inside the dialog.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return
    const focusable = [...dialog.querySelectorAll('button, input, [tabindex="0"]')].filter((el) => el.offsetParent !== null && !el.disabled)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })
  root.addEventListener('click', (event) => {
    if (event.target === root) hide() // the backdrop
  })
  launcher.addEventListener('click', () => (root.hidden ? show() : hide()))

  function show() {
    if (!root.hidden) return
    returnTo = document.activeElement
    root.hidden = false
    launcher.setAttribute('aria-expanded', 'true')
    for (const [key, view] of Object.entries(views)) view.hidden = key !== 'main'
    current = 'main'
    root.querySelector('[data-action="resume"]').focus()
    onOpenChange?.(true)
  }

  function hide({ restoreFocus = true } = {}) {
    if (root.hidden) return
    root.hidden = true
    launcher.setAttribute('aria-expanded', 'false')
    // Back to where focus was; opened with Esc from the game, that's the game
    // itself -- not the Menu button, or Space (brake) would reopen the menu.
    if (restoreFocus) (returnTo && document.contains(returnTo) && returnTo !== document.body ? returnTo : gameFocus ?? launcher).focus()
    onOpenChange?.(false)
  }

  return {
    show,
    hide,
    toggle: () => (root.hidden ? show() : hide()),
    /** Esc: out of a sub-view first, then close. */
    back() {
      if (current !== 'main') showView('main')
      else hide()
    },
    get isOpen() {
      return !root.hidden
    },
  }
}
