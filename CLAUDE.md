# IWSDK project guidance

@AGENTS.md

## Before every update (ben's rule, 2026-11-03)

Run the realistic-placement check before you merge any change that touches the sets, the
cast, the crew or the lights: `node scripts/placement-check.cjs https://localhost:8081/ <outDir>`
must pass, and look at its screenshots yourself (people through props, a head through a car
door, odd scale). Say in the update that you did.


## Writing in-game text (ben's rules, 2026-11-16)

- Every tip or Dee note must actually help you win under the scoring. ben: "if this doesn't
  actually help you win then it shouldn't be something he says." Example removed: "moving a
  light closer makes it brighter" (the main track scores brightness by the dimmer only).
- No camera- or player-relative directions ("camera-left", "your left", "toward you"): ben
  found them ambiguous, and they break once you walk into the set. Name something on the set
  that is in every scene: "toward the director" (-x), "toward craft services" (+x), "closer
  to / further from the camera" (z), raise/lower.
- A text never repeats: the phone drops a text already sent in the same step, and each
  nudge has its own once-per-scene flag (the car scene once sent the house-lights text 5x).
- On the phone, texts for the step you're on are bright; done or no-longer-relevant ones are
  dimmed. Give a nudge a topic (`phone.text(from, text, topic)`) and resolve it when fixed.
