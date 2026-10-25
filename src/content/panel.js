import { birthdays, serviceAwards, upcomingEvents } from './feeds.js'
import { t } from './ui.js'

/**
 * The station panel (doc 05 §5): a right-hand drawer on desktop, a bottom
 * sheet on narrow screens. Non-modal -- it never pauses driving.
 *
 * Shows any content-model node (`content/model.js`): a header in the
 * district's colour, kicker + title, a "coming soon" badge for anything still
 * marked placeholder, team lead / role lines, image or gallery, body, links,
 * and -- for a station that names one -- a feed from the seed (today's
 * birthdays, service awards, upcoming events; src/content/feeds.js). Feed
 * entries still marked placeholder carry a visible "sample" tag.
 *
 * `show(node, { focus })`: pass `focus: true` when the user opened it on
 * purpose (Explore, keyboard) so focus moves to the title; a panel that pops
 * up because you drove into a trigger never steals focus.
 */
export function createStationPanel(root, { feeds = null } = {}) {
  root.classList.add('station-panel')
  root.setAttribute('aria-labelledby', 'station-title')
  root.innerHTML = `
    <header class="station-panel__header">
      <p class="station-panel__kicker"></p>
      <h2 class="station-panel__title" id="station-title" tabindex="-1"></h2>
      <p class="station-panel__badge" hidden></p>
      <button type="button" class="station-panel__close"><span aria-hidden="true">&times;</span></button>
    </header>
    <div class="station-panel__scroll">
      <ul class="station-panel__roles" hidden></ul>
      <p class="station-panel__lead" hidden></p>
      <div class="station-panel__gallery" hidden></div>
      <p class="station-panel__body"></p>
      <section class="station-panel__feed" hidden>
        <h3></h3>
        <ul></ul>
        <p></p>
      </section>
      <section class="station-panel__links" hidden>
        <h3></h3>
        <ul></ul>
      </section>
    </div>
  `
  const $ = (selector) => root.querySelector(selector)
  const header = $('.station-panel__header')
  const kicker = $('.station-panel__kicker')
  const title = $('.station-panel__title')
  const badge = $('.station-panel__badge')
  const closeButton = $('.station-panel__close')
  const roles = $('.station-panel__roles')
  const lead = $('.station-panel__lead')
  const gallery = $('.station-panel__gallery')
  const body = $('.station-panel__body')
  const links = $('.station-panel__links')
  const feed = $('.station-panel__feed')
  const scroll = $('.station-panel__scroll')

  closeButton.setAttribute('aria-label', t('panel.close'))
  badge.textContent = t('panel.placeholder')
  links.querySelector('h3').textContent = t('panel.links')

  let currentId = null
  let returnFocusTo = null
  const listeners = new Set()

  /**
   * `returnFocus`: where keyboard focus goes back to on close (e.g. the
   * Explore entry that opened it); the canvas otherwise.
   */
  function show(node, { focus = false, returnFocus = null } = {}) {
    currentId = node.id
    returnFocusTo = returnFocus
    const colour = node.group?.color ?? '#86BC25'
    header.style.setProperty('--district', colour)
    header.style.setProperty('--district-ink', readableInk(colour))

    setText(kicker, node.kicker)
    title.textContent = node.title
    badge.hidden = !node.placeholder

    roles.replaceChildren(...node.roles.map(({ name, role }) => {
      const li = document.createElement('li')
      const strong = document.createElement('strong')
      strong.textContent = name
      li.append(strong, document.createTextNode(` — ${role}`))
      return li
    }))
    roles.hidden = node.roles.length === 0

    setText(lead, node.lead)

    gallery.replaceChildren(...node.images.map((src, i) => {
      const img = document.createElement('img')
      img.src = src
      img.alt = t('panel.imageAlt', { title: node.images.length > 1 ? `${node.title} (${i + 1})` : node.title })
      img.loading = 'lazy'
      img.decoding = 'async'
      return img
    }))
    gallery.hidden = node.images.length === 0
    gallery.classList.toggle('is-gallery', node.images.length > 1)
    if (node.images.length > 1) gallery.setAttribute('aria-label', t('panel.gallery'))
    else gallery.removeAttribute('aria-label')

    body.textContent = node.body ?? ''
    renderFeed(node.feed)

    links.querySelector('ul').replaceChildren(...node.links.map(({ label, url }) => {
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = label
      const note = document.createElement('span')
      note.className = 'sr-only'
      note.textContent = ` ${t('panel.opensInNewTab')}`
      a.append(note)
      li.append(a)
      return li
    }))
    links.hidden = node.links.length === 0

    scroll.scrollTop = 0
    root.hidden = false
    if (focus) title.focus({ preventScroll: true })
    for (const listener of listeners) listener(node)
  }

  function renderFeed(name) {
    const list = feed.querySelector('ul')
    const empty = feed.querySelector('p')
    feed.hidden = !name || !feeds
    if (feed.hidden) return
    let heading
    let rows
    let none
    if (name === 'birthdays') {
      const { scope, entries } = birthdays(feeds)
      heading = t(scope === 'today' ? 'panel.birthdaysToday' : 'panel.birthdaysMonth')
      rows = entries.map((b) => [b.name, null, b.status])
      none = t('panel.birthdaysNone')
    } else if (name === 'serviceAwards') {
      heading = t('panel.serviceAwards')
      rows = serviceAwards(feeds).map((a) => [a.name, t('panel.serviceYears', { years: a.years }), a.status])
      none = t('panel.serviceNone')
    } else {
      heading = t('panel.events')
      rows = upcomingEvents(feeds).map((e) => [e.title, [e.date, e.time, e.place].filter(Boolean).join(' · '), e.status, e.link])
      none = t('panel.eventsNone')
    }
    feed.querySelector('h3').textContent = heading
    list.replaceChildren(...rows.map(([label, detail, status, link]) => {
      const li = document.createElement('li')
      const strong = document.createElement('strong')
      if (link) {
        const a = document.createElement('a')
        a.href = link.url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = label
        strong.append(a)
      } else {
        strong.textContent = label
      }
      li.append(strong)
      if (detail) li.append(document.createTextNode(` — ${detail}`))
      if (status === 'placeholder') {
        const tag = document.createElement('span')
        tag.className = 'station-panel__sample'
        tag.textContent = t('panel.sample')
        li.append(' ', tag)
      }
      return li
    }))
    list.hidden = rows.length === 0
    empty.textContent = rows.length ? '' : none
    empty.hidden = rows.length > 0
  }

  function hide() {
    if (root.hidden) return
    const hadFocus = root.contains(document.activeElement)
    root.hidden = true
    currentId = null
    // Don't leave keyboard focus stranded on a hidden element.
    if (hadFocus) {
      const back = returnFocusTo?.isConnected && returnFocusTo.offsetParent !== null
        ? returnFocusTo
        : document.getElementById('app')
      back?.focus({ preventScroll: true })
    }
    returnFocusTo = null
    for (const listener of listeners) listener(null)
  }

  closeButton.addEventListener('click', hide)

  return {
    show,
    hide,
    /** The content id currently shown, or null when hidden. */
    get currentId() {
      return currentId
    },
    get isOpen() {
      return !root.hidden
    },
    /** Called with the node on show and with null on hide. */
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function setText(el, text) {
  el.textContent = text ?? ''
  el.hidden = !text
}

/**
 * Black or white text, whichever contrasts more with the district colour --
 * for any background that guarantees at least 4.5:1 (WCAG 2.2 AA).
 */
export function readableInk(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255)
  const contrastWhite = 1.05 / (luminance + 0.05)
  const contrastBlack = (luminance + 0.05) / 0.05
  return contrastBlack >= contrastWhite ? '#000000' : '#FFFFFF'
}
