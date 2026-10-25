import { settings } from '../config.js'
import { t } from '../content/ui.js'

/**
 * The HUD's corners (doc 05 §5) and their behaviour:
 *
 *   - auto-hide: after `settings.hud.idleHide` s of driving with nothing new
 *     happening, the corners fade right down. A stop, any game event, the
 *     pointer, or keyboard focus inside the HUD brings them back (CSS
 *     `:focus-within` too, so a tabbing user never loses them). They fade,
 *     never `display: none`, so screen readers always reach them.
 *   - the contextual hint, bottom centre: how to drive until the first
 *     25 m, then how to open the station you're in, a nudge towards your
 *     first station, and a Passport pointer after the first stamp.
 */
export function createHud({ root, hint, vehicle, areas, content, game, isTouch }) {
  let drivingFor = 0
  let faded = false
  let lastHint = null
  let passportHintUntil = 0
  let clock = 0

  function wake() {
    drivingFor = 0
    if (faded) {
      faded = false
      root.classList.remove('is-faded')
    }
  }

  for (const type of ['stamp', 'badge', 'rank', 'collect', 'dash', 'station-open', 'minigame', 'easter-egg', 'finale']) {
    game.events.on(type, wake)
  }
  game.events.on('stamp', () => {
    passportHintUntil = clock + 8
  })
  window.addEventListener('pointermove', wake, { passive: true })
  root.addEventListener('focusin', wake)

  function hintText() {
    const touch = isTouch()
    const active = areas.active
    if (active && (active.phase === 'ready' || active.phase === 'closed')) {
      const title = content.get(active.id)?.title
      if (title) return t(touch ? 'hud.hintTap' : 'hud.hintEnter', { title })
    }
    const state = game.store.state
    if ((state.counters.distance ?? 0) < settings.game.firstDriveDistance) return t(touch ? 'hud.hintTouch' : 'hud.hintDrive')
    if (Object.keys(state.opened).length === 0) return t('hud.hintFindStation')
    if (clock < passportHintUntil && !touch) return t('hud.hintPassport')
    return ''
  }

  function update(dt) {
    clock += dt
    const moving = vehicle.state.speed > 1.5
    if (moving && !areas.active) {
      drivingFor += dt
      if (!faded && drivingFor > settings.hud.idleHide) {
        faded = true
        root.classList.add('is-faded')
      }
    } else if (!moving) {
      wake()
    }

    const text = hintText()
    if (text !== lastHint) {
      lastHint = text
      hint.textContent = text
      hint.classList.toggle('is-empty', !text)
    }
  }

  return { update, wake }
}
