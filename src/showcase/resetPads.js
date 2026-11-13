import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { near } from './hotspots.js'

/**
 * Reset pads (doc 11 R3; the reference's playground has the same): a plate
 * on the floor beside a knock-down set. Drive onto it and press Enter (or
 * tap ↵) and the set is rebuilt: every prop of that type in the district
 * drops back in from above on the reveal's own kinematic tween, bottom rows
 * first, and lands standing and asleep.
 *
 * The plate is drawn in the shared floor-label batch (`world/areaMarkers.js`),
 * so a pad adds no draw call; the fence and the ENTER label come from the
 * hotspot it registers. Layout: `rebuild.showcase.resetPads`.
 */
export function createResetPads(ctx) {
  const pads = ctx.layout.resetPads ?? []
  if (!pads.length || !ctx.markers) return null
  const built = []

  function build(info) {
    for (const spec of pads.filter((p) => p.district === info.id)) {
      const frame = ctx.frames.get(info.id)
      const at = frame.toWorld(spec.lx, spec.lz)
      const props = () => ctx.gameWorld.props.props.filter((p) => p.district === info.id && p.type === spec.type)
      const action = t(`showcase.${spec.label}`)

      function reset() {
        const list = props()
        // Already on their way down: let them land.
        if (!list.length || list.some((p) => p.body.isKinematic())) return false
        const s = settings.showcase
        const floor = Math.min(...list.map((p) => p.home.position.y))
        // One group: nothing goes dynamic until the whole set is back (dynamicProps.dropIn).
        const group = {}
        list
          .slice()
          .sort((a, b) => a.home.position.y - b.home.position.y)
          .forEach((prop, i) => {
            ctx.gameWorld.props.dropIn(prop, {
              height: s.resetDropHeight,
              // Lower rows first, so a wall builds from the bottom up.
              delay: (prop.home.position.y - floor) * 0.12 + i * s.resetStagger,
              duration: settings.reveal.dropTime,
              group,
            })
          })
        ctx.announce?.(t('showcase.resetDone'))
        return true
      }

      ctx.markers.addPlate({
        x: at.x, z: at.z, width: 2.4, cell: 'reset',
        // Hidden with its district until that is revealed.
        shown: () => info.staticGroup.visible && info.staticGroup.scale.x > 0.5,
      })
      ctx.hotspots.add({
        test: near(at, settings.showcase.resetPadRadius),
        label: () => action,
        action: () => action,
        open: reset,
        anchor: () => ({ x: at.x, z: at.z, size: 3.2, color: ctx.colorOf(info.id) }),
      })
      built.push({ ...spec, at, reset, props })
    }
  }

  return {
    name: 'resetPads',
    districts: [...new Set(pads.map((p) => p.district))],
    build,
    /** For tests and the debug console: [{ district, type, at, reset(), props() }]. */
    get pads() {
      return built
    },
  }
}
