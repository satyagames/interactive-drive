import { t } from './ui.js'

/**
 * Explore mode (doc 03 §4, doc 05 §6): every district and station from the
 * content tree as a plain list of buttons, so the whole arena is reachable
 * without driving -- for keyboard and screen-reader users, and for anyone in
 * a hurry. Picking a station flies the camera there and opens its panel;
 * picking a district heading just flies there.
 *
 * Keyboard: Tab / Shift+Tab or Up / Down / Home / End move between entries,
 * Enter or Space picks, Esc closes (routed through `main.js` so it can close
 * an open station panel first). While focus is inside, driving keys are
 * ignored (`data-captures-keys`, see input/keyboard.js).
 */
export function createExploreMenu({ root, launcher, model, onPickNode, onPickGroup, onClose }) {
  root.classList.add('explore')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'false')
  root.setAttribute('aria-labelledby', 'explore-title')
  root.dataset.capturesKeys = ''

  const header = document.createElement('header')
  header.className = 'explore__header'
  const title = document.createElement('h2')
  title.id = 'explore-title'
  title.textContent = t('explore.title')
  const intro = document.createElement('p')
  intro.className = 'explore__intro'
  intro.textContent = t('explore.intro')
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'explore__close'
  close.setAttribute('aria-label', t('explore.close'))
  close.innerHTML = '<span aria-hidden="true">&times;</span>'
  header.append(title, intro, close)

  const nav = document.createElement('nav')
  nav.setAttribute('aria-labelledby', 'explore-title')
  nav.append(buildList(model.tree, 2))

  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'explore__back'
  back.textContent = t('explore.backToCar')

  root.replaceChildren(header, nav, back)

  function buildList(entries, level) {
    const ul = document.createElement('ul')
    ul.className = 'explore__list'
    for (const entry of entries) {
      const li = document.createElement('li')
      li.className = 'explore__group'
      li.style.setProperty('--district', entry.color)

      const heading = document.createElement(`h${Math.min(level + 1, 6)}`)
      const groupButton = document.createElement('button')
      groupButton.type = 'button'
      groupButton.className = 'explore__group-button'
      groupButton.textContent = entry.label
      groupButton.addEventListener('click', () => onPickGroup(entry))
      heading.append(groupButton)
      li.append(heading)

      if (entry.items.length) {
        const items = document.createElement('ul')
        items.className = 'explore__items'
        for (const id of entry.items) items.append(nodeItem(model.get(id)))
        li.append(items)
      }
      if (entry.groups?.length) li.append(buildList(entry.groups, level + 1))
      ul.append(li)
    }
    return ul
  }

  function nodeItem(node) {
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'explore__item'
    button.dataset.node = node.id
    const label = document.createElement('span')
    label.textContent = node.kind === 'milestone' && node.kicker ? `${node.kicker}: ${node.title}` : node.title
    button.append(label)
    if (node.placeholder) {
      const tag = document.createElement('span')
      tag.className = 'explore__tag'
      tag.textContent = t('explore.placeholderTag')
      button.append(tag)
    }
    button.addEventListener('click', () => {
      onPickNode(node)
      if (narrow()) hide()
    })
    li.append(button)
    return li
  }

  const buttons = () => [...root.querySelectorAll('button')]

  root.addEventListener('keydown', (event) => {
    const list = buttons()
    const index = list.indexOf(document.activeElement)
    let next = null
    if (event.key === 'ArrowDown') next = list[Math.min(index + 1, list.length - 1)]
    else if (event.key === 'ArrowUp') next = list[Math.max(index - 1, 0)]
    else if (event.key === 'Home') next = list[0]
    else if (event.key === 'End') next = list[list.length - 1]
    if (next) {
      event.preventDefault()
      next.focus()
    }
  })

  close.addEventListener('click', () => hide())
  back.addEventListener('click', () => hide())
  launcher.addEventListener('click', () => (root.hidden ? show() : hide()))

  function show() {
    root.hidden = false
    launcher.setAttribute('aria-expanded', 'true')
    root.querySelector('.explore__item, .explore__group-button')?.focus()
  }

  function hide() {
    if (root.hidden) return
    const hadFocus = root.contains(document.activeElement)
    root.hidden = true
    launcher.setAttribute('aria-expanded', 'false')
    if (hadFocus) launcher.focus()
    onClose()
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

function narrow() {
  return window.matchMedia?.('(max-width: 640px)').matches
}
