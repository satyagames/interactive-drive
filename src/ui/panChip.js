import { t } from '../content/ui.js'

/**
 * "Back to car" (doc 11 R1): a small chip that shows while the view is away
 * from the car -- after a drag, Alt + arrows, a minimap click or the Overview
 * key -- and glides it home. A native button: Tab reaches it, Enter or Space
 * activates it, and one aria-live message says it is there (and names the
 * key that does the same). It never takes focus by itself.
 *
 * When it goes away while focused, focus returns to the game canvas so the
 * driving keys keep working.
 */
export function createPanChip({ button, gameFocus, isPanned, isOverview, onHome, announce }) {
  let shown = false

  button.addEventListener('click', () => {
    onHome()
    gameFocus.focus()
  })

  function update() {
    const panned = isPanned()
    if (panned === shown) return
    shown = panned
    if (panned) {
      button.hidden = false
      announce(t(isOverview() ? 'hud.overviewAnnounce' : 'hud.pannedAnnounce'))
    } else {
      if (document.activeElement === button) gameFocus.focus()
      button.hidden = true
      announce(t('hud.backAtCarAnnounce'))
    }
  }

  return {
    update,
    get shown() {
      return shown
    },
  }
}
