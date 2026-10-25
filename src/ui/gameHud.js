import * as THREE from 'three'

import { t } from '../content/ui.js'

/**
 * The game's on-screen feedback (doc 05 §5), driven by `game.events`:
 *
 *   - status chip (top left): rank, XP, and an 11-segment passport ring in
 *     the district colours
 *   - collectible counters (top right, `countsRoot`)
 *   - the Deadline Dash panel: step, timer, distance and a compass arrow
 *     pointing at the next checkpoint relative to the camera
 *   - toasts for stamps, badges, ranks, skins, dash and mini-game moments,
 *     in an aria-live region so screen readers hear them too
 */
const TOAST_MS = 3600
const MAX_TOASTS = 4

export function createGameHud({ root, countsRoot, dashRoot, toastRoot, game, seed, camera }) {
  const districts = [...seed.territories, ...seed.pillars]

  // ---- status chip ---------------------------------------------------------
  root.innerHTML = `
    <svg class="gh-ring" viewBox="0 0 44 44" role="img"></svg>
    <div class="gh-text">
      <strong class="gh-rank"></strong>
      <span class="gh-xp"></span>
    </div>
  `
  const ring = root.querySelector('.gh-ring')
  const rankEl = root.querySelector('.gh-rank')
  const xpEl = root.querySelector('.gh-xp')
  const countsEl = countsRoot

  const segments = districts.map((d, i) => {
    const a0 = (i / districts.length) * Math.PI * 2 - Math.PI / 2 + 0.06
    const a1 = ((i + 1) / districts.length) * Math.PI * 2 - Math.PI / 2 - 0.06
    const r = 18
    const p = (a) => `${22 + r * Math.cos(a)} ${22 + r * Math.sin(a)}`
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`)
    path.setAttribute('stroke', d.color)
    ring.append(path)
    return { id: d.id, path }
  })

  function renderStatus() {
    const p = game.progression
    const stamps = p.stamps
    const count = stamps.filter((s) => s.stamped).length
    for (const seg of segments) seg.path.classList.toggle('is-stamped', stamps.find((s) => s.id === seg.id).stamped)
    ring.setAttribute('aria-label', t('game.passportLabel', { count, total: stamps.length }))
    const rank = p.rank
    rankEl.textContent = rank.name
    const next = rank.next && typeof rank.next[1] === 'number' ? t('game.nextRank', { xp: rank.next[1] - p.xp, rank: rank.next[0] }) : ''
    xpEl.textContent = `${t('game.xp', { xp: p.xp })}${next ? ` · ${next}` : ''}`
    const n = game.collectibles.counts()
    countsEl.textContent =
      `${t('game.dots')} ${n.got.dot}/${n.expected.dot} · ` +
      `${t('game.golden')} ${n.got.golden}/${n.expected.golden} · ` +
      `${t('game.shuriken')} ${n.got.shuriken}/${n.expected.shuriken}`
  }

  // ---- toasts --------------------------------------------------------------
  function toast(text, tone = 'info') {
    const el = document.createElement('div')
    el.className = `toast toast--${tone}`
    el.textContent = text
    toastRoot.append(el)
    while (toastRoot.children.length > MAX_TOASTS) toastRoot.firstElementChild.remove()
    setTimeout(() => el.remove(), TOAST_MS)
  }

  const badgeTitle = (id) => t(`badges.${id}.title`)
  const placeName = (district) =>
    district === 'hq' ? t('dash.hq') : districts.find((d) => d.id === district)?.name ?? district

  const ev = game.events
  ev.on('stamp', ({ name }) => { toast(t('game.toastStamp', { district: name }), 'stamp'); renderStatus() })
  ev.on('badge', ({ id }) => { toast(t('game.toastBadge', { badge: badgeTitle(id) }), 'badge'); renderStatus() })
  ev.on('rank', ({ rank }) => toast(t('game.toastRank', { rank }), 'badge'))
  ev.on('skin-unlock', ({ id }) => toast(t('game.toastSkin', { skin: t(`skins.${id}`) }), 'badge'))
  ev.on('xp', renderStatus)
  ev.on('collect', ({ kind, combo }) => {
    renderStatus()
    if (kind === 'dot' && combo > 1 && combo % 5 === 0) toast(t('game.toastCombo', { combo }))
  })
  ev.on('finale', () => toast(t('game.finale'), 'badge'))
  ev.on('easter-egg', ({ id }) => {
    const text = { konami: t('game.konami'), beacon_morse: t('game.beacon'), pptx_trophy: t('game.trophy') }[id]
    if (text) toast(text, 'badge')
  })
  ev.on('minigame', (m) => {
    if (m.id === 'coin_run' && m.phase === 'start') toast(t('game.coinRunStart', { seconds: m.seconds }))
    if (m.id === 'coin_run' && m.phase === 'fail') toast(t('game.coinRunFail', { got: m.got, of: m.of }))
    if (m.id === 'idea_spark' && m.phase === 'progress') toast(t('game.ideaSpark', { lit: m.lit, of: m.of }))
    if (m.id === 'pace_lap') toast(t(m.personalBest ? 'game.paceBest' : 'game.paceLap', { time: m.time.toFixed(2) }))
    if (m.id === 'paint_trail') toast(t('game.paint'), 'badge')
  })

  // ---- Deadline Dash -------------------------------------------------------
  dashRoot.innerHTML = `
    <p class="dash-title"></p>
    <p class="dash-step"></p>
    <p class="dash-time" aria-hidden="true"></p>
    <div class="dash-compass" role="img"><span class="dash-arrow" aria-hidden="true">&#9650;</span></div>
    <p class="dash-distance" aria-hidden="true"></p>
  `
  const dashTitle = dashRoot.querySelector('.dash-title')
  const dashStep = dashRoot.querySelector('.dash-step')
  const dashTime = dashRoot.querySelector('.dash-time')
  const dashCompass = dashRoot.querySelector('.dash-compass')
  const dashArrow = dashRoot.querySelector('.dash-arrow')
  const dashDistance = dashRoot.querySelector('.dash-distance')
  dashTitle.textContent = t('dash.title')
  dashCompass.setAttribute('aria-label', t('dash.compassLabel'))

  const stepLabel = (step) => t('dash.next', { step: t(`dash.step_${step.step}`), place: placeName(step.district) })

  ev.on('dash', (d) => {
    if (d.phase === 'countdown') {
      dashRoot.hidden = false
      dashStep.textContent = t('dash.countdown', { n: d.count })
    } else if (d.phase === 'start') {
      dashStep.textContent = stepLabel(d.next)
      toast(t('dash.go'), 'stamp')
    } else if (d.phase === 'checkpoint') {
      dashStep.textContent = stepLabel(d.next)
    } else if (d.phase === 'penalty') {
      toast(t('dash.penalty', { seconds: d.seconds }), 'warn')
    } else if (d.phase === 'finish') {
      dashRoot.hidden = true
      const time = d.time.toFixed(1)
      toast(d.margin >= 0 ? t('dash.finish', { time, margin: d.margin.toFixed(0) }) : t('dash.late', { time }), 'badge')
      if (d.medal) toast(t(`dash.medal_${d.medal}`), 'badge')
      if (d.personalBest) toast(t('dash.personalBest'))
    } else if (d.phase === 'cancel') {
      dashRoot.hidden = true
      toast(t('dash.cancelled'), 'warn')
    }
  })

  const camForward = new THREE.Vector3()
  /** Per frame: the dash clock and compass. */
  function update(carPosition) {
    const s = game.dash.state
    if (!s || s.phase !== 'running' || !s.target) return
    dashTime.textContent = `${(s.time + s.penalty).toFixed(1)} s`
    const dx = s.target.x - carPosition.x
    const dz = s.target.z - carPosition.z
    dashDistance.textContent = t('dash.distance', { m: Math.round(Math.hypot(dx, dz)) })
    camera.getWorldDirection(camForward)
    // Angle from "screen up" (camera forward on the ground) to the target, clockwise.
    const angle = Math.atan2(dx, -dz) - Math.atan2(camForward.x, -camForward.z)
    dashArrow.style.transform = `rotate(${angle}rad)`
  }

  renderStatus()
  return { update, toast, renderStatus }
}
