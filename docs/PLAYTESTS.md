# Playtest log

ben's playtest notes and what was done with each. Newest first. Low-priority
ideas stay here as the backlog until ben picks them up.

## Round 7: 2026-11-01 (Greg, a friend of ben's, desktop browser, first time playing)

A new player with no briefing. He sent a 43-second screen recording of scene 3 (the product shot) and a text.

| Greg said | Status |
|---|---|
| "moving the top light toward camera right... back away from camera... towards camera left, back towards camera right... I don't know where to go" | **Fixed.** Reproduced first: a bot that does exactly what the tip says won scene 3 in only 10 of 20 tries and scene 5 in 5 of 20, with the tip reversing itself hundreds of times (`scripts/follow-hints.cjs`). Cause: the tip measured how far off the light was by angle, but then named a floor direction, so on a high top light it ping-ponged left/right when the real problem was height. Now the tip tries a small move in every direction, including up and down, and names the one that helps most; it sticks with that direction while it still helps, and says "Nudge... a little" when a full move would overshoot. After: 20 of 20 in every scene, scene 3 in about 8 moves. |
| (the match bar sat at 45% the whole time he moved the light) | **Fixed.** With the house lights on, the match was capped at 45%, so the bar never moved and gave him nothing to go on. Now the house lights halve the match instead: the bar climbs as the light gets closer and jumps up when you cut them. |
| "cut the house lights when you want to roll, oh, interesting, ah, I just won" | Working as meant (the light was right and the house lights were the last step). The moving bar above should make that clearer. |
| "The 'iPad' is not very clear... is that this?" (screenshot of the two-shot panel) | **Fixed, in-world.** A strip of white gaffer tape on the iPad's top edge reads "VIDEO VILLAGE iPAD", the way crews label gear. In scene 1 Dee also texts: "that iPad in your hands is the video village feed. left = the shot the director wants, right = what the camera sees now. make them match". |

ben's follow-up (2026-11-01): "his struggle probably would have been resolved if the instructions said to lower the light. Maybe there's an indication once a user has locked in one axis of movement successfully." **Done, both.** ben was right: in the follow-the-tips test the new tip says "Lower the top light" on that scene. When one direction is finished and the tip moves on, it says so first: "Left-right looks good. Lower the top light." then "Height looks good. Move the top light back, away from the camera." then "Almost there. Hold it..." It stays in the tip line on the iPad, so no new UI.

## Round 6: 2026-11-01 (ben, Quest 1 headset, first time in VR, all seven scenes)

Played start to finish. ben: "it was awesome to play in VR." A little choppy on the Quest 1, which is expected for 2019 hardware. The judges will play on a current Quest.

| ben said | Status |
|---|---|
| "the monitor and phone are just outside of like the focus range, so it's not super sharp... the text in the monitors was not really readable... the phone was really not readable, because it was too far off screen and too small" | **Done.** In the headset the iPad and phone now sit about 85 cm out, near the lenses' focus distance, instead of 60 cm. The iPad is about 25% bigger in your view and sits higher. When a text lands, the phone rises to just right of center and grows about 50%; when idle it shrinks back down beside the iPad. Following Meta's guidance (big enough to read, near the middle, no turning your head to reach the edges), they still drift after your head, since ben liked that. |
| "we should probably give viewers control over that" (phone size) | **Done.** The iPad's - and + buttons now size the phone too, in the headset and the browser. The phone is also a little bigger by default in the browser. |
| "when they were covering elements in the set, it seemed like your pointer wanted to default to the actual set instead of the menu" | **Done.** The iPad and phone now win over anything behind them when your controller ray crosses them. The empty area above the iPad's strip no longer catches the ray. *Checked in code; not yet tried in a headset.* |
| "it was kind of difficult to grab the lights" | **Done.** Each light's grab bubble is about 50% bigger (it was 2.6 cm across the dollhouse, now 3.8 cm) and a little fainter, so it doesn't add clutter. |
| "we need sound effects for the text messages" | **Done.** A two-note chime and a short controller buzz when a text or Mom's notification lands. The sounds are generated in the browser, so there are no audio files. |
| "there should be a sound effect when the director talks, even if it's just like Charlie Brown talking" | **Done.** The director "talks" in a muted-trumpet wah-wah, one syllable for every couple of words, capped so long lines don't drone. |
| "when you frequently put the light in the shot... it crowds the view. So maybe he should only say that if you put it there for like more than 10 seconds" | **Done.** Dee texts about a light in the shot only after it has sat there 10 seconds (it was 1.2), and only once per light per scene. The iPad tip still says it right away. |
| "I did have to say allow immersive experiences on the web browser first, so we might want to point users to that before showing them the enter VR button" | **Done.** The start page says: "In the headset browser? If it asks to allow immersive mode, press Allow first." |
| (follow-up) "It doesn't seem to let me switch to VR mode when I go to that scene directly" (a `?scene=5` link) | **Done.** A `?scene=N` link now opens on the title page ("Starting at scene N"), with the Play in VR and Go buttons; Go starts that scene. Before, it skipped straight into play with no VR button on the iPad. Checked in the headset emulator: Play in VR starts a session from `?scene=5`. |
| (follow-up, after #10 went live) "The WebXR permissions say allow. But there's still no pop-up... I still can't click the button that says Play in VR. I can hit Go." | **Fix in review.** The game asked the browser only for passthrough mode (the config's `ar` mode), which a Quest 1 may refuse. "Play in VR" now asks for passthrough first and falls back to plain VR. If the browser still says no, its reason shows on the title page so we can see why. Tested in the emulator by making passthrough fail (it fell back to VR and started), and by making both fail (the reason showed). *Not yet tested on the Quest 1.* |
| "you should actually be able to scroll it with the thumbsticks on the quest controllers" | **Fix in review.** Push either thumbstick up for older texts, down for newer; hold to repeat. If the phone is tucked away, the first push brings it up. Tested in the emulator. |
| "I think the phone positioning is fine since it's temporary" | Kept as is. |
| "There should be a toggle. Getting into VR out of any point in the game." | **Fix in review.** A yellow "VR" button sits on the iPad's play strip, beside − and +, whenever the browser can do VR and you're not already in it. It keeps your scene and progress. |
| "it'd be nice if the director was a little closer to the scene" | **Done.** The director's chair moved in, right to the edge of the set (out of the shot and clear of the lights). The sponsor rep moved with him. |
| "It is really dark and kind of hard to see the actual camera" | **Done.** The camera body is a lighter gunmetal, with a red tally light on top and a glowing monitor on the back. |
| "a camera operator behind the camera" | **Open.** This needs a new character model, so it goes to the art pipeline (like the crew in PR #3). |
| "the lighting in the dark shot where there was the one overhead light, the interrogation lighting, wasn't showing in the VR as it was in the monitor" | **Fix in review.** ben: "the light isn't hitting him at all when compared to my desktop view... if I move the light back in front of him more it clearly does cast on him." His Quest screenshot shows the beam's pool on the floor behind and beside the actor. Cause: on Quest, the headset draws both eyes in one pass (multiview), and three.js then aims the lights from a combined camera a few cm behind your eyes, while each eye's pixels use their own position. At 1:14 dollhouse scale that shift moves a light 12 cm from his head right off him; the iPad's camera render doesn't use multiview, so it looked right. Fix: multiview is off, so each eye renders separately (costs some frame rate on the Quest 1). *The emulator has no multiview, so this needs a headset check.* |

## Round 5: 2026-11-01 (ben, desktop browser)

| ben said | Status |
|---|---|
| "why would Dee text me this ['the director just squinted at you and said stick around']... this should be said by the director after he physically looks at me, maybe in replacement of [Don't touch anything. Ever again.]" | **Done.** On every win the director turns in his chair to look at you, takes a beat, then speaks. In scene 1 he says "...Hm. You. Stick around." Dee now texts "did the director just TALK to you??". "Don't touch anything. Ever again." is replaced by "Perfect. Lock it off. Nobody breathe." |
| "the professor line is weird because no one looks like a professor... he should be dressed more like a professor" | **Done.** The art thread made a professor (gray hair, blazer, glasses; PR #7). Scene 2 seats him whenever the model is there. |
| "we should still be able to scroll to Dee's last messages above in the chat" | **Done.** Scroll the mouse wheel over the phone, or tap "▲ earlier" / "▼ newest" (works with the headset ray too). The phone keeps the last 40 texts. |
| "we should be able to SEE the physical house lights hanging somewhere" | **Done.** Six industrial dome lights hang from the grid, above the shot. They glow while the house lights are on. |
| "the little note when you win at the bottom is distracting... that text below the ipad is just for quick tips" | **Done.** On a win the tip line is empty; only the Next scene button stays. |
| "instead of 'Tap HOUSE' say 'turn them off!'... after he's given you this note once or twice... 'psst... house lights...' (but only if you're a decent time into the level and haven't turned them off once yet. if you've already cycled them assume it's on purpose)" | **Done.** The tip says "Turn them off!" for the first two reminders, then "Don't forget to cut the house lights." Dee texts about it only after 20 s in a scene, and only if you haven't cut them yet. Her first text is "turn them off!", later ones "psst... house lights...". Once you've turned them off in a scene, leaving them on is treated as on purpose. The tip moves on, and only says "Cut the house lights when you want to roll" once everything else is right. The take still can't win with them on. |

### Backlog: difficulty modes (post-competition, or if there's time)

- ben, 2026-11-01: "we should also only have [tips] for 'No experience' mode. when we build different difficulties, with some other difficulty settings that remove those tips, add things like real cable physics with the lights getting tangled/stuck on each other, and requiring cable management, etc."

## Round 4: 2026-11-01 (ben, desktop browser)

Decision from ben: **every light switch lives on the iPad.** "all the light buttons should be labeled on your monitor, then we don't need labels over the lights because you can switch it on to find out." No labels float over lights any more.

| ben said | Status |
|---|---|
| "the house lights button should be on your monitor. actually all the light buttons should be labeled on your monitor" | **Done 2026-11-01.** The iPad has a row of labeled switches: HOUSE, each light in the kit, and Lamp in the living room. Each has a green light when it's on. The wall switch and the SCREEN/WARM tags over lights are gone. Clicking a light on set still switches it too. |
| "hover labels on the lights should show up each level the first time you see a new light" | **Replaced** by the labeled switches (ben's follow-up). Pointing at or dragging a light outlines its switch on the iPad, so you can see which one it is. |
| "the warm light in the later lesson should have a temperature dial on your monitor too instead of saying warm" | **Done 2026-11-01.** In scenes 4 and 6 the light that used to be "WARM" is a bi-color light. Its switch has a color temperature dial: ◀ warmer, ▶ cooler, in stops of 3200K, 4000K, 4800K and 5600K. The warm role needs 3200K. Leave it at daylight and the hint says "Right light, wrong color: dial the softbox down to 3200K." |
| "keep in mind... switching on a light changes at least one of dee's hints" | **Done.** Every hint, tip and how-to-play line now says to use the iPad buttons. |
| "the quick tips below the monitors are hidden when you're dragging a light" | **Fixed.** The tip line always shows the hint. It no longer swaps to the light's name. |
| "dee's messages need to be larger and easier to read and need to have notifications that the user clicks to keep the phone on screen, or they can click it again to minimize it" | **Done.** Text is about 40% bigger. A new text pops the phone up for a few seconds. Tap it to keep it up and tap again to tuck it ("tap to keep open" / "tap to tuck away" under Dee's name). |
| "the monitor should be adjustable in size... let user choose size" | **Done.** − and + buttons in the iPad's top-right corner (or the - and = keys) make it smaller or bigger. The size is remembered on that device. In the headset the same buttons scale it. |

### Roadmap idea (not for the competition)

- **Camera settings mode** (ben, 2026-11-01): "camera settings is the next type of game or even mode in this game. you already have a scene and have to adjust camera settings to take a shot in different environments. like rollers with a car, bird photos, etc. you have to set manual settings like f stop iso and shutter speed, as well as pick lenses." Same loop as Light Lab (match a target shot), with the camera as the puzzle instead of the lights.

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
