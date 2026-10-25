import { BADGES } from '../game/progression.js'

/**
 * Debug-only (`#debug`): earn every badge through the game's real detection
 * paths -- the car is moved, props are knocked over, stations opened -- and
 * report which badges unlocked. The acceptance test for doc 06 Phase 6.
 *
 * It changes your progress; use Passport -> Reset progress afterwards.
 */
export async function runGameTest({ game, gameWorld, vehicle, reveal, stationPanel, content, seed }) {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const frames = async (n) => { for (let i = 0; i < n; i++) await frame() }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const log = []
  const step = (name) => log.push(name)

  const place = (x, z, y = 0.5) => {
    vehicle.body.setTranslation({ x, y, z }, true)
    vehicle.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    vehicle.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    vehicle.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
  const knock = (props) => {
    for (const p of props) {
      const h = p.home.position
      p.body.setTranslation({ x: h.x + 2.5, y: h.y + 0.5, z: h.z + 2.5 }, true)
      p.body.setAngvel({ x: 6, y: 0, z: 4 }, true)
    }
  }
  const propsOf = (district, type) => gameWorld.props.props.filter((p) => p.district === district && p.type === type)

  // Everything visible and settled first, so reveals can't undo a knock.
  await gameWorld.streamRest()
  for (const id of reveal.pending) reveal.revealDistrict(id)
  await wait(3500)

  step('first_drive: drive 30 m')
  for (let i = 0; i < 30; i++) {
    place(-40 + i, 120)
    await frame()
  }

  step('decade_historian + proposal_ninja: collect every golden dot and shuriken by driving onto them')
  for (const c of gameWorld.collectibles.filter((x) => x.kind !== 'dot')) {
    place(c.position.x, c.position.z, Math.max(c.position.y - 0.4, 0.5))
    await frames(18)
  }

  step('variance_found / coin_collector / bright_strike / red_tape_cutter: knock the props')
  knock(propsOf('audit', 'barblock'))
  knock(propsOf('tax', 'coin'))
  knock(propsOf('rnr', 'pin'))
  knock(propsOf('toolkit', 'brick'))
  step('bright_idea: hit every bulb')
  for (const bulb of propsOf('consulting', 'bulb')) bulb.body.applyImpulse({ x: 2.5, y: 0, z: 0 }, true)
  await wait(1200)

  step('pole_position: a lap of the PACE oval')
  const { ovalCentre, catalyst, bridge } = game.minigames.geometry
  for (let i = 0; i <= 44; i++) {
    const a = (i / 40) * Math.PI * 2
    place(ovalCentre.x + Math.sin(a) * 6, ovalCentre.z + Math.cos(a) * 6)
    await frame()
  }
  place(ovalCentre.x + 30, ovalCentre.z)
  await frames(3)

  step('across_time_zones: over the Catalyst gap, land on the far deck')
  const over = catalyst.toWorld(0, bridge.lz)
  place(over.x, over.z, 3.2)
  await frames(4)
  const far = catalyst.toWorld(3.5, bridge.lz)
  place(far.x, far.z, bridge.farHeight + 0.6)
  await frames(45)

  step('social_butterfly / lifelong_learner / toolkit_pro: open every station there')
  for (const id of ['culture', 'lnd', 'toolkit']) {
    for (const s of seed.pillars.find((d) => d.id === id).stations) stationPanel.show(content.get(s.id))
  }
  stationPanel.hide()

  step('loop_the_0: through the 0')
  const loop = gameWorld.triggers.find((t) => t.name === 'trigger_loop_zero')
  place(loop.position.x + 6, loop.position.z + 6)
  await frames(3)
  place(loop.position.x, loop.position.z)
  await frames(3)

  step('airtime: a launch (leaving the ground at 15 m/s)')
  place(20, 120)
  await frames(20)
  vehicle.body.setTranslation({ x: 20, y: 16, z: 120 }, true)
  vehicle.body.setLinvel({ x: 15, y: 0, z: 0 }, true)
  await frames(110)

  step('pursuit_legend: every gateway + one station per district')
  for (const d of [...seed.territories, ...seed.pillars]) {
    const gate = gameWorld.triggers.find((t) => t.name === `trigger_stamp_${d.id}`)
    place(gate.position.x, gate.position.z)
    await frames(3)
    place(gate.position.x + 15, gate.position.z + 15)
    await frames(2)
    stationPanel.show(content.get(d.stations[0].id))
  }
  stationPanel.hide()

  step('deadline_hero: start the Dash and hit every checkpoint fast')
  stationPanel.show(content.get('gate_deadline_dash'))
  stationPanel.hide()
  await wait(3300)
  for (let i = 0; i < 6 && game.dash.state; i++) {
    const target = game.dash.state.target
    place(target.x, target.z)
    await frames(4)
  }

  const results = BADGES.map((id) => ({ badge: id, unlocked: Boolean(game.store.state.badges[id]) }))
  return {
    passed: results.every((r) => r.unlocked),
    results,
    rank: game.progression.rank.name,
    xp: game.progression.xp,
    stamps: game.progression.stamps.filter((s) => s.stamped).length,
    steps: log,
  }
}
