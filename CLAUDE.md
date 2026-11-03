# IWSDK project guidance

@AGENTS.md

## Before every update (ben's rule, 2026-11-03)

Run the realistic-placement check before you merge any change that touches the sets, the
cast, the crew or the lights: `node scripts/placement-check.cjs https://localhost:8081/ <outDir>`
must pass, and look at its screenshots yourself (people through props, a head through a car
door, odd scale). Say in the update that you did.

