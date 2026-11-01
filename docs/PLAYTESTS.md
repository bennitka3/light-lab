# Playtest log

ben's playtest notes and what was done with each. Newest first. Low-priority
ideas stay here as the backlog until ben picks them up.

## Round 3: 2026-11-01 (ben, desktop browser)

Rule from ben: **"everything is practical UI."** Nothing floats on its own. Anything on screen is a prop you hold (iPad, phone) or comes from a character on set.

| ben said | Status |
|---|---|
| "this should take up less space on screen. just the two shots at the bottom + the tip. the detailed notes below are either dialogue by characters or texts you receive" | **Done 2026-11-01.** During play the iPad is a slim strip: target, your shot, a match bar and one tip line. The scene brief and objective come from the director's speech bubble. The lesson and the gossip after a win arrive as texts from Dee. |
| "this card should just be in the ipad ui" (the floating LUCKY BREAK / Play in your room panel) | **Done 2026-11-01.** The floating panel is gone. The iPad's start page has a "Play in VR" button when the device can do VR. Otherwise it says "On a Quest? Open this page there to play in VR." |
| (follows from the rule) | Light names on hover now show on the iPad's tip line, in yellow, instead of a floating tag. The HOUSE switch moved out from under the director. |

## Round 2: 2026-11-01 (ben, desktop browser)

| ben said | Status |
|---|---|
| "the tips on this level were telling me to shift it toward camera right" / "swinging the backlight toward camera left puts it in the shot" | **Fixed.** Hints are now floor moves: camera-left/right, back/forward, "raise it until it hangs from the grid". There's no more "swing". |
| "the note about the real guy came on for level 3" | **Fixed.** Dee's win texts never mention a person. Each scene's gossip is written for that scene. |
| "when it switches to mom, you gotta just get a notification and see the preview" | **Done.** Mom arrives as a notification banner over the phone, not in the chat. |
| "phone should stay close to the frame... a little bigger, and minimize when you're not getting a message or hovering" | **Done.** The phone sits next to the iPad, tucks down when idle and pops up for a text or on hover. |
| "a little ipad you're holding center screen... only shows you your shot and the target... at the start that could say how to play, and be bigger until you say go" | **Done.** The iPad HUD replaced the monitor, the lower third and the how-to-play panel. |
| "the dialogue... should just come from characters on the set. we should fill the set with crew characters" | **Done.** The director speaks in speech bubbles. Crew models came from the art thread (PR #3). |
| "are the house lights taking a second to turn on intentional" | **Fixed.** That was a stall, not a choice. House lights now dim instead of being added and removed, so nothing recompiles. |

## Round 1: 2026-10-31 (ben, desktop browser, all seven scenes)

| ben said | Status |
|---|---|
| "level 3 I had the light in the frame and won. the light being visible in frame should be a loss." | **Fixed 2026-11-01.** Any light (on or off) whose head or stand the cine camera can see caps the match at 40% and the monitor says which light is in the shot; Dee texts about it too. |
| "level 5 I won with the light literally in front of the actor" | **Fixed 2026-11-01** by the same check. Lights raised above the frame now hang from the grid (pipe goes up, not down), so overhead lights like the interrogation top light stay out of the shot. |
| "the last level says I'm missing the right screen light when I have it in there. it probably doesn't know which one I selected first or where I placed it." | **Fixed 2026-11-01.** ben was right: roles were filled in list order, so the first SCREEN panel switched on was always "left". Lights are now matched to whichever role's spot they are actually in. Screen panels now hang high on each side, out of the shot. |
| "Level 2 was really hard at first and honestly I want the second level to be a different location, either a practical set." | **Done 2026-11-01.** Scene 2 is now on location in a professor's study (wood panelling, bookshelves, window, desk lamp). It starts with the three-point setup already up and the key light kicked to the wrong side: fix one light. |
| "I've barely read the cards on screen... maybe just use the lower third of wherever we're looking from to be the dialogue, and instructions." | **Done 2026-11-01.** The call sheet is now a lower-third caption that stays at the bottom of the view (drifts after your head in the headset). Enter or Space presses its button on desktop. |
| "showing what a light is called on hover" | **Done 2026-11-01.** Hovering (mouse or controller ray) shows the light's name and what it does, e.g. "Softbox: big and soft, the classic key light". The WARM and SCREEN tags stay. |
| "the 'who ARE you?' line gets old... mix it up from a batch of like 20 options." | **Done 2026-11-01.** 20 director lines (one is still "Who ARE you?"), never the same twice in a row. The finale keeps its own "Who ARE you?" payoff. |
| "the text messages should come up as little HUD UI of a phone with realistic text bubbles." + "you're getting texts from your friend in video village who knows lighting and knows you're bluffing" | **Done 2026-11-01.** A phone in the lower-right corner of the view. Dee (video village) texts a tip at the start of each scene, texts when a light is in the shot, nudges you with the current hint if you're stuck for ~14 s, and reacts when you win. Mom's text in scene 6 arrives on the phone. |
| "the 'Warm' tip is helpful" | Kept. |
| "the last level was good." | Kept. |
| "something else we could include is a" (cut off) | **Asked ben** what he meant. |

### Backlog (low priority, ben's call)

- Romantic dinner: a different, superstar-looking actress instead of the same model twice; the couple facing each other, more natural poses ("we might need to revisit character models"). Art pass.
- "I got through most of them with only 2 lights, which I'm not sure was intended." Data: scenes need 1, 3, 2, 1, 1, 2 and 4 lights (scene 2 now starts with its 3 already up). So yes, most scenes are one or two lights by design (one lesson each). If ben wants more, later scenes could add a required fill or kicker.
- More tools: gobo/cookie, flag, reflector/bounce. Fits the "two hands" design rule (hold a flag while moving the key).
