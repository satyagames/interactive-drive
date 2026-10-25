import { t } from '../content/ui.js'

/**
 * The Sound panel (doc 05 §3 "global mixer"): mute plus Master / Music /
 * Effects / Ambience sliders, opened from Menu → Audio; M mutes from
 * anywhere. Native checkbox and range inputs keep it keyboard- and
 * screen-reader-usable for free; mute changes are announced through
 * `announce`, and every `[data-sound-state]` label shows "Sound muted".
 */
const BUSES = ['master', 'music', 'sfx', 'ambience']

export function createSoundPanel({ root, launcher, returnFocus, audio, announce }) {
  root.dataset.capturesKeys = '' // arrow keys move a slider, not the car
  root.className = 'sound-panel'

  const header = document.createElement('header')
  const title = document.createElement('h2')
  title.id = 'sound-title'
  title.tabIndex = -1
  title.textContent = t('sound.title')
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'passport__close'
  close.setAttribute('aria-label', t('sound.close'))
  close.innerHTML = '<span aria-hidden="true">&times;</span>'
  close.addEventListener('click', () => hide())
  header.append(title, close)
  root.setAttribute('aria-labelledby', 'sound-title')

  const muteLabel = document.createElement('label')
  muteLabel.className = 'sound-panel__mute'
  const mute = document.createElement('input')
  mute.type = 'checkbox'
  mute.addEventListener('change', () => audio.setMuted(mute.checked))
  const muteText = document.createElement('span')
  muteText.textContent = t('sound.mute')
  const muteKey = document.createElement('kbd')
  muteKey.textContent = t('sound.muteHint')
  muteLabel.append(mute, muteText, muteKey)

  const sliders = {}
  const rows = BUSES.map((name) => {
    const row = document.createElement('div')
    row.className = 'sound-panel__row'
    const label = document.createElement('label')
    label.htmlFor = `sound-${name}`
    label.textContent = t(`sound.${name}`)
    const input = document.createElement('input')
    input.type = 'range'
    input.id = `sound-${name}`
    input.min = '0'
    input.max = '100'
    input.step = '5'
    const output = document.createElement('output')
    output.htmlFor = input.id
    input.addEventListener('input', () => audio.setVolume(name, Number(input.value) / 100))
    row.append(label, input, output)
    sliders[name] = { input, output }
    return row
  })

  const note = document.createElement('p')
  note.className = 'sound-panel__note'
  note.textContent = t('sound.placeholder')

  root.replaceChildren(header, muteLabel, ...rows, note)

  function sync(prefs) {
    mute.checked = prefs.muted
    for (const name of BUSES) {
      const percent = Math.round(prefs.volumes[name] * 100)
      sliders[name].input.value = String(percent)
      sliders[name].output.textContent = `${percent}%`
      sliders[name].input.disabled = prefs.muted && name !== 'master'
    }
    for (const state of document.querySelectorAll('[data-sound-state]')) state.textContent = prefs.muted ? t('sound.muted') : ''
  }
  sync(audio.prefs)

  let lastMuted = audio.muted
  audio.onChange((prefs) => {
    sync(prefs)
    if (prefs.muted !== lastMuted) {
      lastMuted = prefs.muted
      announce(prefs.muted ? t('sound.muted') : t('sound.unmuted'))
    }
  })

  function show() {
    root.hidden = false
    launcher.setAttribute('aria-expanded', 'true')
    title.focus()
  }

  function hide() {
    if (root.hidden) return
    const hadFocus = root.contains(document.activeElement)
    root.hidden = true
    launcher.setAttribute('aria-expanded', 'false')
    // The launcher may sit in the closed Esc menu: then focus `returnFocus`.
    if (hadFocus) (launcher.offsetParent ? launcher : returnFocus ?? launcher).focus()
  }

  launcher.addEventListener('click', () => (root.hidden ? show() : hide()))

  return {
    show,
    hide,
    toggle: () => (root.hidden ? show() : hide()),
    get isOpen() {
      return !root.hidden
    },
  }
}
