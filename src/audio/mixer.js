/**
 * The mixer (doc 05 §3): Music, SFX and Ambience buses into a Master bus,
 * then a limiter and a meter. Music has a second gain stage for ducking, so
 * the visitor's own level and the duck never fight over one parameter.
 *
 *   music -> duck --\
 *   sfx -------------> master -> limiter -> meter -> destination
 *   ambience -------/
 *
 * The limiter is what "no clipping with 12 voices" rests on: one-shots are
 * already levelled so a dozen rarely sum past full scale, and the
 * compressor catches the rest.
 */
const RAMP = 0.05

export function createMixer(ctx) {
  const master = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.12
  const meter = ctx.createAnalyser()
  meter.fftSize = 2048
  master.connect(limiter)
  limiter.connect(meter)
  meter.connect(ctx.destination)

  const bus = (destination) => {
    const gain = ctx.createGain()
    gain.connect(destination)
    return gain
  }
  const duck = bus(master)
  const buses = { master, music: bus(duck), sfx: bus(master), ambience: bus(master) }

  const samples = new Float32Array(meter.fftSize)
  const bins = new Float32Array(meter.frequencyBinCount)

  return {
    buses,
    /** Set a bus level (0..1) smoothly. `master` also carries the mute. */
    setLevel(name, value) {
      buses[name].gain.setTargetAtTime(value, ctx.currentTime, RAMP)
    },
    /** Music multiplier, 1 = no duck. */
    setDuck(value) {
      duck.gain.setTargetAtTime(value, ctx.currentTime, 0.25)
    },
    /** Peak absolute sample in the last ~43 ms of output (after the limiter). */
    peak() {
      meter.getFloatTimeDomainData(samples)
      let peak = 0
      for (let i = 0; i < samples.length; i++) {
        const v = Math.abs(samples[i])
        if (v > peak) peak = v
      }
      return peak
    },
    /** Spectral centroid of the output, Hz: a rough "how high is it" for tests. */
    centroid() {
      meter.getFloatFrequencyData(bins)
      let sum = 0
      let weighted = 0
      for (let i = 1; i < bins.length; i++) {
        const power = 10 ** (bins[i] / 10)
        sum += power
        weighted += power * i
      }
      return sum > 0 ? (weighted / sum) * (ctx.sampleRate / meter.fftSize) : 0
    },
    /** Gain reduction the limiter is applying right now, dB (negative). */
    get reduction() {
      return limiter.reduction
    },
  }
}
