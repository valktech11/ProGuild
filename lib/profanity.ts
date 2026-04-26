// Lightweight profanity check — no npm package needed
// Whole-word match only to avoid false positives (e.g. "assessment" won't trigger "ass")

const BLOCKED: string[] = [
  'fuck', 'fucker', 'fucking', 'fucked',
  'shit', 'shitty',
  'bitch', 'asshole', 'bastard',
  'cunt', 'dick', 'cock',
  'idiot', 'stupid', 'moron',
  'crap', 'dumbass', 'jackass',
]

export function containsProfanity(text: string): boolean {
  if (!text) return false
  return BLOCKED.some((word) => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i')
    return pattern.test(text)
  })
}
