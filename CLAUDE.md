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
- No "camera-left/right": ben found it ambiguous (frame left, or the camera object's left?).
  Tips say "to your left/right" from where the player is looking, or name a landmark.
- On the phone, texts for the step you're on are bright; done or no-longer-relevant ones are
  dimmed. Give a nudge a topic (`phone.text(from, text, topic)`) and resolve it when fixed.
