/**
 * The beacon's Morse "10" (doc 03 easter egg), shared by the light (VFX) and
 * the beeps (audio) so they stay in step: [on, off] seconds per symbol.
 */
export const MORSE_DOT = 0.18
export const MORSE_DASH = 0.54

const CODE = { 1: '.----', 0: '-----' }

export function morseTimeline(text = '10') {
  const steps = []
  for (const char of text) {
    const letter = CODE[char]
    for (let i = 0; i < letter.length; i++) {
      steps.push([letter[i] === '.' ? MORSE_DOT : MORSE_DASH, i === letter.length - 1 ? MORSE_DASH * 1.6 : MORSE_DOT])
    }
  }
  return steps
}
