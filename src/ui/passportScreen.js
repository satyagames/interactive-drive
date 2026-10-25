import { t } from '../content/ui.js'

/**
 * The Pursuit Passport screen (P, or its button; doc 03 §2.1, doc 05 §5):
 * stamps, badges, collectibles, records, skins, and Reset progress.
 *
 * Non-modal like the other panels; keyboard-operable (Tab through, Esc via
 * main.js closes it). Reset is two-step -- the button turns into a confirm
 * -- rather than a blocking browser dialog. Rebuilt from the game state each
 * time it opens.
 */
export function createPassportScreen({ root, launcher, game, onClose }) {
  root.classList.add('passport')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'false')
  root.setAttribute('aria-labelledby', 'passport-title')

  let confirming = false

  function section(title, body) {
    const el = document.createElement('section')
    const h = document.createElement('h3')
    h.textContent = title
    el.append(h, body)
    return el
  }

  function list(items, className) {
    const ul = document.createElement('ul')
    ul.className = className
    for (const item of items) ul.append(item)
    return ul
  }

  function li(text, { state, note, colour } = {}) {
    const el = document.createElement('li')
    if (state) el.dataset.state = state
    if (colour) el.style.setProperty('--district', colour)
    const label = document.createElement('span')
    label.textContent = text
    el.append(label)
    if (note) {
      const small = document.createElement('small')
      small.textContent = note
      el.append(small)
    }
    return el
  }

  function render() {
    const p = game.progression
    const header = document.createElement('header')
    const title = document.createElement('h2')
    title.id = 'passport-title'
    title.textContent = t('passport.title')
    title.tabIndex = -1
    const meta = document.createElement('p')
    meta.textContent = `${p.rank.name} · ${t('game.xp', { xp: p.xp })}`
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'passport__close'
    close.setAttribute('aria-label', t('passport.close'))
    close.innerHTML = '<span aria-hidden="true">&times;</span>'
    close.addEventListener('click', hide)
    header.append(title, meta, close)

    const stamps = list(p.stamps.map((s) => li(s.district.name, {
      state: s.stamped ? 'on' : 'off',
      note: s.stamped ? t('passport.stamped') : t('passport.notStamped'),
      colour: s.district.color,
    })), 'passport__stamps')

    const badges = list(p.badges.map((b) => li(t(`badges.${b.id}.title`), {
      state: b.unlocked ? 'on' : 'off',
      note: b.unlocked ? t(`badges.${b.id}.description`) : `${t('passport.locked')} · ${t(`badges.${b.id}.description`)}`,
    })), 'passport__badges')

    const n = game.collectibles.counts()
    const collect = list([
      li(`${t('game.dots')}: ${n.got.dot} / ${n.expected.dot}`),
      li(`${t('game.golden')}: ${n.got.golden} / ${n.expected.golden}`),
      li(`${t('game.shuriken')}: ${n.got.shuriken} / ${n.expected.shuriken}`),
    ], 'passport__plain')

    const best = game.store.state.best
    const fmt = (s) => (s === undefined ? t('passport.none') : t('passport.seconds', { s: s.toFixed(1) }))
    const records = list([
      li(`${t('passport.dashBest')}: ${fmt(best.dash)}`),
      li(`${t('passport.paceBest')}: ${fmt(best.paceLap)}`),
    ], 'passport__plain')

    const skins = list(p.skins.map((s) => {
      const el = li(t(`skins.${s.id}`), { state: s.unlocked ? 'on' : 'off', note: s.unlocked ? '' : t('passport.locked') })
      if (s.unlocked) {
        const use = document.createElement('button')
        use.type = 'button'
        use.textContent = s.active ? t('passport.inUse') : t('passport.useSkin')
        use.disabled = s.active
        use.addEventListener('click', () => {
          p.setSkin(s.id)
          render()
          root.querySelector('.passport__skins button:not(:disabled)')?.focus()
        })
        el.append(use)
      }
      return el
    }), 'passport__skins')

    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'passport__reset'
    reset.textContent = confirming ? t('passport.resetConfirm') : t('passport.reset')
    reset.addEventListener('click', () => {
      if (!confirming) {
        confirming = true
        render()
        root.querySelector('.passport__reset')?.focus()
        return
      }
      game.resetProgress()
    })

    const body = document.createElement('div')
    body.className = 'passport__body'
    body.append(
      section(t('passport.stamps'), stamps),
      section(t('passport.badges'), badges),
      section(t('passport.collectibles'), collect),
      section(t('passport.records'), records),
      section(t('passport.skins'), skins),
      reset,
    )
    root.replaceChildren(header, body)
  }

  function show() {
    confirming = false
    render()
    root.hidden = false
    launcher.setAttribute('aria-expanded', 'true')
    root.querySelector('#passport-title')?.focus()
  }

  function hide() {
    if (root.hidden) return
    const hadFocus = root.contains(document.activeElement)
    root.hidden = true
    launcher.setAttribute('aria-expanded', 'false')
    if (hadFocus) launcher.focus()
    onClose?.()
  }

  launcher.addEventListener('click', () => (root.hidden ? show() : hide()))
  // Keep an open passport current as things happen.
  for (const type of ['stamp', 'badge', 'xp', 'skin', 'skin-unlock', 'collect']) {
    game.events.on(type, () => {
      if (!root.hidden && !confirming) render()
    })
  }

  return {
    show,
    hide,
    toggle: () => (root.hidden ? show() : hide()),
    get isOpen() {
      return !root.hidden
    },
  }
}
