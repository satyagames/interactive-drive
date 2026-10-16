/**
 * The exhibit info overlay: a passive HTML/CSS card, not in-3D UI. It never
 * pauses driving -- it just shows whatever `show()` was last given until
 * `hide()` is called (on trigger exit, the close button, or Escape).
 */
export function createExhibitPanel({ root, closeButton, image, title, pitch, description }) {
  let currentId = null

  function show(entry) {
    currentId = entry.id
    title.textContent = entry.title
    pitch.textContent = entry.pitch
    description.textContent = entry.description

    if (entry.image) {
      image.src = entry.image
      image.alt = entry.title
      image.hidden = false
    } else {
      image.hidden = true
      image.removeAttribute('src')
    }

    root.hidden = false
  }

  function hide() {
    root.hidden = true
    currentId = null
  }

  closeButton.addEventListener('click', hide)
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) hide()
  })

  return {
    show,
    hide,
    /** The content id currently shown, or null when hidden. */
    get currentId() {
      return currentId
    },
  }
}
