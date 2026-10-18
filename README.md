# Pinnacle Practice

Independent 3D Pinnacle practice and local AI matches. No Vsimulator code/assets, accounts, online multiplayer, garage, or other games.

## Run locally

In the VS Code PowerShell terminal, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Open **http://localhost:5173** in Chrome or Edge. Choose a mode, click the field to drive, and press Escape to pause/release the cursor. Keep the terminal running; Ctrl+C stops the server. A local Node runtime is included in `.tools/` on this machine. Elsewhere install Node.js and use `npm start`, or VS Code Live Server. No install/build is needed; dependencies are vendored for offline play. Serve through HTTP instead of double-clicking HTML.

## Settings and robot customization

Settings supports key rebinding, mouse sensitivity/inversion, drive speed (15-50 in/s), acceleration/braking response, lift speed, keyboard turn speed, and chase-camera distance. Duplicate bindings are rejected. Settings save in browser storage. Restore default controls preserves appearance. Escape always pauses and releases the cursor.

Choose **Cascade** (60-inch lift travel) or **DR4B**, a compact double reverse four-bar with 30-inch lift travel. Both use the same drive/claw/intake controls with distinct animated mechanisms. DR4B is an independently drawn approximation, not CAD. AI retain cascade robots.

Decoration colors: lime, purple, orange, white, teal, pink, graphite. Decorations never change red/blue alliance license plates. Toppers: none, beacon, crown, duck. Toppers have no collision, scoring or drivetrain effects.

## Default controls

| Control | Action |
| --- | --- |
| W / S | Forward / backward |
| Mouse | Steer; third-person camera follows |
| Left / right arrows | Keyboard steering |
| Hold left Shift | Precision driving at 40% speed |
| Q | Pick up / drop (same key) |
| E | Optional alternate drop / place key |
| Hold A / D | Raise / lower lift |
| R | Flip object or carried pair |
| F | Turn wall roller with rear bumper nearby |
| Hold I | Run rear intake; release to pause feed |
| L | Select next loader |
| Escape | Pause / release cursor |

HUD hints update to bindings. If pointer lock is denied, hold left mouse and drag to steer. Claw height and proximity matter. A green target ring permits nesting; orange indicates wrong height/type. Alternate pins and cups. A cup-bottom pair must go onto a pin, or be flipped before placement on an empty goal.

## Rear intake and loaders

Back a loose **pin or cup** into the rear funnel and hold the intake key. Animated rollers convey it along an internal rising path into the front claw over about 2.2 seconds. Releasing the key pauses; holding resumes. The object follows the robot during transit. This is an assisted animation, not full roller/contact physics.

An empty claw accepts either type. A single held pin accepts one cup, and a single held cup accepts one pin. The new object nests above the first; capacity is two objects. Same-type additions and third objects are rejected. R flips the pair together. E waits for a feed to finish. Scored objects and existing pairs require Q instead. In-transit objects are reserved against other pickups.

Approaching a loader within 22 inches fills its **fixed lower holder** and raises **only the upper colored handle**. The pin/cup stays stationary below. Lower the claw and press Q. Occupied holders never accumulate duplicate loads; empty holders refill from finite stock after a 1.5-second cooldown. Loading/handle movement pause with the game.

The loader menu chooses pin, cup or pin + cup, colors/orientations, clear cup half up/down and stack order. Default is R/Y pin above a cup. Apply to both copies a recipe to the other loader on that side. Recipe changes apply to the next refill. Recipes survive resets; stock/contents reset.

Rollers sit above wall rails. F requires the rear bumper to face the wall within 4 inches of the roller and inside its width. Front/side approaches cannot turn it.

AI contact allows a brief resisted nudge instead of an immovable wall. Sustained pressure stops yielding, preventing continuous cross-field bulldozing. AI may sidestep/replan. Other robots, goals and walls still constrain displacement. The waving spectator outside the field is visual only.

## Field setup and modes

The 144 x 144-inch field uses 24-inch tiles. Goal centers: red (-48, +/-24), blue (48, +/-24), neutral (0, +/-48), center (0,0). Negative Z is the reference's top edge. Normal goal height is 5.77 inches; center is 8.77. Geometry is approximate and independently drawn.

The custom reference includes four additional side pins. Each loose starting pin now turns **45 degrees**, keeping its position fixed. Four side-wall R/B pins nest on cups, each with two adjacent loose cups. Midfield cups have opaque halves up. External corner icons are preloads, not loose objects. The player starts with one R/Y preload; the center starts with Y/Y. Its starting solo score is 10; those initial points are not credited to the player in summaries.

**Free practice** and **60-second solo** use section 3.1 of the [Pinnacle v2.0 manual](https://games.recf.org/achieve/2.0): nested cups earn 1; visible matching R/B halves earn 5 on matching/neutral goals; yellow earns 5 with the required roller color; visible center halves earn 10. Goal/cup opacity hides covered halves. Pause freezes time; the buzzer freezes scoring.

**Head to head:** choose 2v2 or Change mode. You drive R1 on red, with R2 against B1/B2, for 120 seconds of driving with no autonomous period. All robots have alliance/yellow preloads. Roles start random and reroll to a different role once between 50 and 70 active seconds. Cautious, drifty or persistent tendencies remain fixed and affect detours, descoring interest, neutral preference and decision rhythm.

- Defenders block opposing driving lanes and periodically give space.
- Center specialists collect/score on center and sometimes remove opposing top objects.
- Alliance/neutral scorers build on own alliance and neutral goals, excluding center.

Normal AI speed is 9-14 in/s. They use grid navigation, collisions, sidesteps, lift movement and actual pickup/nesting interactions. They can wander/get temporarily stuck, do not use the player's intake, and do not autonomously turn rollers.

**Parking:** each departure time is random between 15 and 7 seconds remaining. Small detours are added only when route/time budget allows. Return urgency adapts speed between 24 and 34 in/s. Teammates reserve separate own-alliance loaders, avoid human-occupied spaces, and stay parked. About 80% attempt parking to compensate for traffic failures and target about 75% actual success. A baseline of 100 seeded matches (300 AI, stationary player) produced **232 successful parks, 77.3%**. Active human traffic can change that rate; no teleporting or ignored collisions guarantees parking.

Alliance scoring follows manual section 5.1: visible alliance halves score 5 on matching goals, 7 on neutral, 10 on center. Neutral rollers determine cup/yellow ownership. Center cup/yellow bonuses go to the alliance with more visible alliance-colored halves; ties award neither. Opposite-colored alliance goal/yellow scoring follows the manual's explicit example 5.1.6 example 3. Parking adds 21 per occupied own loader using approximate contact and at most one robot per loader. Opposing alliance goals are protected. Neutral/center removal stops during the final 30 seconds. No full penalties, hardware field control or tournament rankings are simulated. The separate autonomous tester is described below.

## Match summary

Finished timed runs and AI matches show a bird's-eye map with all robot trails. Select a robot and scrub time to inspect routes, positions and actions. Squares mark score changes. Stats include points added, opponent points removed, net score swing, parking, distance, placements, pickups and intake feeds. Download exports JSON with timestamps and paths sampled about four times per active second.

Attribution is **action-time, not final ownership**: later cups, removals and roller changes can alter prior field points. Points added count positive own-alliance gains. Net swing includes losses and opposing changes. Initial field points are excluded. Parking is separate and included in net swing. Time scrubbing changes paths/events; stat totals describe the whole run. No summary data leaves the browser.

## Source and validation

- `game.js`: setup, interactions, physics approximations, intake, scoring/timer.
- `ai.js`: roles, tendencies, navigation, endgame and parking.
- `controls.js`: validated persistent bindings/driving/appearance settings.
- `summary.js`, `summary-view.js`: telemetry, attribution, map/scrubber/export.
- `main.js`, `index.html`, `style.css`: Three.js scene, robot mechanisms, toppers and interface.
- `server.mjs`, `start.ps1`: local HTTP server/launcher.
- `tests/*.test.mjs`: model/settings/match/parking/advanced regression tests.
- `tests/browser-smoke.mjs`: isolated Chrome/Edge rendering and keyboard/UI checks; requires server.
- `tests/parking-rate.mjs`: baseline parking outcome measurement.
- `vendor/`: Three.js 0.160.1 and MIT license.
- `reference/`: downloaded official manual/diagrams, not runtime textures.

```powershell
& .\.tools\node.exe --test tests/game.test.mjs tests/controls.test.mjs tests/match.test.mjs tests/parking.test.mjs tests/advanced.test.mjs tests/stack-auto.test.mjs tests/practice-tools.test.mjs tests/ranking.test.mjs
```

Nesting, visibility, circular chassis collisions and upright settling are simplified. Loose objects lack full rigid-body contacts/toppling. Whole alternating floor stacks can be assembled and carried. Acceleration-driven sway and probabilistic spills approximate load instability; these are not rigid-body contact dynamics. This independent practice tool is not an official/certified competition simulation or affiliated with RECF, VEX, RoboStem or Vsimulator.

## Stack handling, intake and controls

Q is a combined pick up / drop button: an empty claw grabs, and an occupied claw releases. Rebind "Pick up / drop (toggle)" in Settings. E remains an optional alternate drop key. Autonomous Grab and Release steps stay separate to make sequences repeatable.

Grab entire alternating pin/cup stacks from the floor or your own alliance goals. Neutral/center goals allow only the top object to be removed (and remain protected in the final 30 seconds of head to head). Opponent alliance goals and their loader trays are protected. Floor stacks join when an alternating object is released near the existing stack's top.

Tall/high loads sway with acceleration and can spill during sustained fast movement or sharp turning. Spilled objects tumble and fall, becoming loose objects that can be collected again. Lower the lift and drive gently for a stable load. Spill events appear in the match summary.

Hold intake to feed a pin or cup; one opposite-type object can follow the first. The conveyor stops at 85% with the lift raised. Lower the claw fully to finish the transfer. The loader panel includes a live 3D stack preview and bottom-to-top description that update with the recipe.

## Session setup and autonomous testing

The session chooser includes a rotating 3D field preview. Hover or focus a mode to preview its description and robot count. Expand Advanced head-to-head setup to choose each AI's starting strategy, personality and parking policy, change normal driving speed, and enable/disable the mid-match strategy reroll. Settings persist in this browser. "Always attempt" parking still depends on time and traffic; normal parking keeps the existing approximately 75% baseline success rate.

Choose **15-second autonomous** as its own mode. The fixed 3D field, action sequence editor and bird's-eye path map stay on the same screen. A planned routine replays automatically without starting the test clock. Changes to action types or durations regenerate the path immediately, using the same field objects, collision and movement model as execution. The map uses the summary's field orientation and goal layout; lime marks the plan, white marks the actual route, and numbered dots mark step starts.

Add, remove or reorder drive, reverse, turn, lift, intake, grab, release, flip and wait steps. Durations are seconds and current driving/lift settings apply. Grab/release/flip trigger once at step entry. The sequence saves locally. Run 15s test resets the field and executes without driver inputs, from the same fixed camera. Pause remains available. At the buzzer, the actual route, score and completed-step count remain in the workspace without a popup. Reset / preview or edit a step to refine the routine. Short sequences wait out the remaining time; long sequences stop at 15 seconds. Probabilistic load spills can differ from the deterministic preview. This is a simulator sequence tester, not a hardware code compiler.

## Autonomous planning tools

Open **Start position, routines & reliability** in the autonomous workspace. Drag/click the map to position the robot; Shift-drag aims it. Numeric X/Z/heading fields provide precise placement. Invalid starts that overlap walls or goals are rejected. Undo/redo covers sequences, start positions and routine changes. Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) works outside text inputs while paused.

**Drive distance** uses signed inches (negative reverses), and **Turn angle** uses signed degrees (positive left, negative right). These actions stop at their targets, with a 15-second timeout for blocked targets. Timed actions still work. Select **Also: raise/lower/intake** to run mechanisms in parallel with a drive, turn or wait step. Conflicting lift directions are prevented.

Save up to 20 named routines, including their start, field setup and movement configuration for comparison. Selecting/Comparing a saved routine overlays its purple route against the current lime route and compares scores; Load restores its sequence and field. Reliability testing runs 20 independent trials with drive/turn speeds varied +/-6%, acceleration +/-10%, and random spills. It reports average/min/max score and the percentage reaching the chosen score with the entire plan completed and no target timeouts. This is simulated variation, not a hardware reliability measurement.

The autonomous time slider inspects preview or actual 3D robot/object states. Live / preview resumes the automatic preview or returns to the live scene. Manual controls remain blocked while inspecting a replay.

## Practice tools

Use **Practice tools** on the bottom bar:

- **Custom field:** drag pins, cups or whole stacks on the overhead map; compatible stacks can be moved onto goals. Add alternating stacks of 1-9 objects, delete them, change pin colors, flip pin/cup orientation or set heading. Undo/redo restores arrangements. Use this setup keeps it for subsequent runs; save/load/delete up to 12 named setups locally. Default field restores the reference layout. New AI matches retain their own fresh robot preloads when using a custom setup.
- **Replay:** scrub recorded 3D robot, object, goal and roller states without modifying the live match. Inspect 3D replay is also available from timed-match summaries. Export replay downloads JSON. Full timed matches are retained; free practice retains roughly the latest three minutes to bound memory.
- **Personal bests:** timed runs record a best score and route per mode, robot type, starting position, custom field and challenge. A translucent cyan robot follows that route during the next run. Toggle the ghost in Practice tools. Data remains in this browser.
- **Scoring explanation:** choose a goal to see visible/concealed pin halves, roller/color restrictions, cups and points. Enable the 3D overlay for green counting halves and red non-counting halves.
- **Challenges:** build a three-object red-goal stack, visit all four marked corners, or park at a red loader before a 30-second buzzer. Floor rings and progress feedback mark the objectives. Success ends the challenge and records its result separately from normal runs.
- **Teammate commands:** in 2v2, tell R2 to defend, focus center, score other goals, give you space or park immediately. Commands persist until Auto or another command is selected. Normal endgame parking and alliance protections remain in place.

A load stability indicator warns as fast movement and sharp turns accumulate spill risk. Robot contacts add a small visual jolt and sound feedback.

## Controller and sound

**Settings > Controller** supports browser Gamepad devices. Connect a controller and press a button so the browser exposes it. Default standard mapping:

| Control | Action |
| --- | --- |
| Left stick Y / X | Drive / turn |
| A / Cross | Pick up or drop |
| Right / left bumper | Raise / lower lift |
| Right trigger | Hold intake |
| Left trigger | Precision driving |
| X / Square | Flip held stack |
| Y / Triangle | Turn rear-contact roller |
| Back / Share | Cycle team loader |
| Menu / Options | Pause / resume |

Axis numbers, inversion, dead zone and each button mapping are adjustable and saved locally. Analog movement can start a ready run without mouse capture. Keyboard/mouse remain available. Disconnection releases controller input; driver controls are blocked during autonomous execution, modal screens, field editing and replay inspection. Button numbering varies by device/browser. Automated checks use simulated Gamepad input; physical device compatibility still depends on the browser/OS.

**Settings > Sound** controls sound effects, master volume and optional quiet synthesized background music. Effects cover pickup, drop, intake transfer, scoring, spills, rollers, chassis contact, countdown and buzzer. Audio starts after a click or key press and uses Web Audio without downloaded recordings. Music pauses with gameplay. Mute and volume changes persist in this browser.

New source modules: `practice-tools.js` (editing/history/replay helpers, explanations/challenges/ghosts), `controller.js` (validated analog/button input), `audio.js` (local synthesis), and expanded `autonomous.js` (targets, parallel actions and reliability testing).

## Summary ranking points and cameras

Head-to-head summaries and exported JSON include the Pinnacle v2.0 section 5.5 ranking-point breakdown for both alliances. Endgame RP requires a single goal stack with at least five visible alliance-color halfpins, at least one matching-color roller anywhere, and a robot parked at an own loader. The summary shows each condition, the largest qualifying stack count and whether the point was earned. Match RP awards 2 for winning, 1 for tying and 0 for losing. Autonomous RP is explicitly **not run**, since this simulator's head-to-head mode skips the autonomous period; totals include only match and endgame RP. Solo/practice summaries do not award alliance RP. Loader contact uses the same approximate parking check as match scoring. Source: https://games.recf.org/achieve/2.0, sections 5.5.1-5.5.3.

The summary View selector preserves the bird's-eye path map and adds four 3D replay cameras: alliance driver station (red/blue or selected robot's alliance, approximately 60-inch eye height), overhead 3D, close side view and robot-following view. Choose a robot, scrub the summary timeline and adjust zoom to inspect its recorded movement and field objects from any preset. The side view keeps a fixed world angle; following rotates with the selected robot. Replay time and scoring inspection do not modify the final match result.

## Mid-match commands and automatic replay

During head-to-head driving, press **Esc** to pause and release the cursor. A teammate-command dropdown appears directly on the field for R2. Choose Auto, Defend, Focus center, Score alliance/neutral goals, Give me space or Park now, then use Resume match. The dropdown hides while driving; commands persist after resuming. The Practice tools command controls remain available as well.

Both match summaries and Practice tools replays now have **Play replay / Pause replay**, **Replay from start**, **0.5x / 1x / 2x / 4x** speed and optional **Loop**. Playback starts from the inspected time, or from the start when already at the end. The slider remains optional for precise inspection. Recorded robots and objects play back without advancing live match physics or changing the finished score. Closing a summary, starting a new run or returning to the live view stops playback. Free-practice looping respects the oldest frame still retained.

The 3D views are for watching how a recorded match unfolded: pickups, lift/claw actions, nesting, traffic and robot contact from different perspectives. The bird's-eye path map provides a compact route-and-scoring overview.

## Xbox button rebinding

In Settings > Controller, click an action's named button, then press the desired controller button or paddle. Standard inputs show Xbox names (A/B/X/Y, LB/RB, LT/RT, View/Menu, stick clicks and D-pad directions). Existing mappings are retained. If the chosen button is already assigned, the two actions swap controls; changes save automatically. Buttons held when listening starts are ignored until released and pressed again. Escape or Cancel button assignment cancels without closing Settings. Paddles bind as whichever input the controller reports to the browser.

Match summary downloads use JSON (`pinnacle-match-summary.json`); replay exports also use JSON (`pinnacle-replay.json`).

## Match difficulty and Strategy Lab

Advanced head-to-head setup now offers **Easy, Standard, Hard and Expert** skill for each AI. Set both opponents together or choose B1/B2 individually; R2 has its own teammate skill. Skill affects actual driving speed, turn/lift rates, reaction delays, wandering and (on Easy) missed handling attempts. Standard preserves the original drivers. No skill preset grants free scores or ignores collision/alliance rules. Difficulty settings persist with the match setup.

Choose **Strategy simulator** in the mode menu or use the bottom-bar **Strategy lab** button. R1 becomes an AI executing your phased match plan. Customize:

- Up to 12 consecutive phases covering a 120-second match, with center scoring/descoring, alliance goals, neutral goals, any legal goal, defense or parking.
- Wandering, center-descoring tendency, defensive pressure, automatic parking lead time and attempt probability. Explicit Park phases always attempt parking.
- Your own robot skill, your teammate's strategy/skill, and each opponent's simpler strategy/skill.
- Default or currently active custom field setup; success as a red win, a target red score, an endgame RP, or win plus endgame RP.
- 1-500 trials and a repeatable seed.

The visual editor and presets work without typing. Typed strategies use a documented phase format, not arbitrary natural language or executable code:

```text
0-45: center
45-108: alliance
108-120: park
```

`defend`, `neutral` and `balanced` are also supported actions. Apply typed strategy previews its interpretation; Run also parses unapplied text. Unknown instructions, gaps and overlapping phases are rejected rather than guessed.

A module Web Worker runs actual four-AI matches with the same navigation, goal protection, loader restrictions, scoring, load instability, traffic and parking model. The live field remains untouched. Batches continue while you use another mode; reopen the lab to see progress. Stop after this match retains completed trials. Results show the selected success percentage, 95% Wilson sampling interval, wins/ties/losses, win rate, average and range of scores, endgame RP rate, average ranking points and best/worst-margin example paths. Ties do not count as wins. JSON export includes the exact configuration, seed and individual trial results. Results use the configuration captured at the start even if you edit a later plan while the worker runs.

These percentages estimate performance **inside this simplified simulator against the selected opponents**, not real-world competition outcomes. Increasing trial count reduces sampling uncertainty but does not remove model limitations. No autonomous period is included in these 120-second alliance simulations.

Source modules: `ai-profiles.js`, `strategy-simulation.js`, `strategy-worker.js`; model tests in `tests/strategy.test.mjs` and a real-worker browser check in `tests/strategy-browser.mjs`.

Strategy Lab example routes include a 0?120 second scrubber, Play/Pause, Restart, 1x?8x speed, and robot filtering. Paths build as time advances, with robot outlines, forward claw reach, goal-placement markers, recent actions, the active R1 strategy phase, and recorded alliance scores. Routes track chassis centers, so they stop short of goals while the claw reaches forward. Best/worst examples include their action and score timelines in the results export.

In Strategy Lab, **Find best strategies** compares your current plan, center-then-alliance, alliance focus, balanced scoring, and defense-then-scoring. Every candidate uses the selected match count, seed sequence, field setup, robot skills, intake setting, and opponent configuration. Completed plans are ranked by success rate for your selected objective, then average score margin and average ranking points. Apply a suggestion with **Use this plan**; the representative route shows the highest ranked tested plan. Stopping retains fully tested candidates only. The suggestions compare five plans rather than guaranteeing an optimal strategy, and close results need more trials.

The **R1 has a rear intake** checkbox applies only to Strategy Lab (including recommendations). Enabled R1 uses the actual rear intake animation and lowered-claw transfer for eligible loose objects; disabled R1 uses its front claw. Both can use the claw for stacks and loader objects. Other game modes retain their existing controls and hardware.

## Phones and tablets

Touch devices get a drive/turn joystick, a target-height lift slider, Grab/drop, Flip, Roller, hold-to-run Intake, and hold-for-precision Slow buttons. Separate touches can drive and operate the intake at the same time. Pause clears touch input; switching apps or rotating clears held controls. Tap the field to start without mouse capture. Field and Loaders buttons open compact panels. Landscape provides more driving room; menus, Strategy Lab, autonomous editing, and summaries also fit portrait screens. Touch devices use a 1x rendering-resolution cap and no dynamic shadows to reduce GPU load. Desktop keyboard/mouse and controller inputs remain available.

Mobile checks run in Chrome phone emulation (390x844 and 844x390), including multitouch, rotation, lift, loaders, autonomous editing, and match summaries. Real iPhone/Android hardware performance has not been measured.

Refresh the Netlify drag-and-drop folder after changing the game:

```powershell
powershell -ExecutionPolicy Bypass -File .\prepare-website.ps1
```

Upload **website-upload** through your existing Netlify project's Deploys page. This preparation script copies website files locally; it does not publish automatically.
