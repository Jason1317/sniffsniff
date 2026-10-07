# Sniff Sniff

A first-person horror game about walking your dog. Willet, Wisconsin, summer 1995.

You are **Richie**, a nervous young man who just rented the old Gunderson place on Birch Lane.
You know no one. You have a new puppy named **Moose**. People keep losing their dogs.

This is a playable prototype: **Day 1** (morning walk) and **Night 1** (the midnight walk).

## Play

Double-click `start.bat`. The first run installs dependencies, then the game opens at http://localhost:5174 in your browser. Chrome is recommended, and so are headphones.

| Key | Does |
|---|---|
| WASD | walk |
| Shift | walk faster |
| Mouse | look (click the game to capture the mouse) |
| E | interact / pet Moose / pick choices |
| 1-2, W/S | dialogue choices |
| C | smoke (press again to take a drag) |
| Q | whistle for Moose |
| Esc | pause (sensitivity, volume, voice volume, picture) |

### Playtest shortcuts
- **Skip to night** on the title screen jumps straight to the midnight walk (Mrs. Kessler's light stays off).
- `http://localhost:5174/?bulb=1`, then Skip to night: the same, but with her light fixed.
- `http://localhost:5174/?skipcar`: skips the car intro and starts on the driveway with Moose leashed.

## What's in the prototype

**Transitions, all hand-animated:** the drive in with hands on the wheel and turning the key; climbing out under the roof; walking around and clipping the leash on Moose in the passenger seat (he licks your hand, hops down, shakes off); petting him; picking up after him with a bread bag (then tossing it into a trash can); a full cigarette ritual (pack, lid flip, shake one out, lips, a lighter that fails once, inhale, two-finger hold, exhale, flicking the butt); knocking; a door opening on its chain; handshakes; taking and handing over a letter; unscrewing and replacing a porch light bulb; unlocking and leaving the house at night; and the ending, where Richie bolts and chains the door and slides down it.

**Day 1:** Mrs. Kessler (an introduction, a handshake, she pets Moose, a choice about her porch light, the letter), the jogger with his Walkman, the Lindqvists moving in (he waves too long), Walt Brenner behind his door ("stay in the light"), lost-pet posters, and Moose doing his business.

**Night 1:** fog, mist banks that catch lamp light, sodium streetlights (plus one mercury light that won't stay on), crickets, katydids, a bug zapper, a train horn far off. Consequences from the day show up at night: Mrs. Kessler's light, or whatever stands in her yard. There's also the smashed mailbox and the bike bell in the fog, Mr. Lindqvist on his lawn in the dark, and Walt's truck alarm. Then Mill Road. Moose leads the way; when Richie is scared, his breathing and heartbeat get worse, and a cigarette or petting Moose helps.

## How it's built

All of it is code: no 3D models, no audio files.

- `src/world/`: the town (houses, cars, trees, poles, corn, woods, water tower), merged into a few draw calls; textures painted on tiny canvases; sky, fog, and the streetlight system
- `src/player/`: the first-person rig, and the hands (jointed fingers, two-bone arm IK, rest poses)
- `src/entities/`: Moose (procedural trot, ears, tail, leash physics, behaviors) and the neighbors (jointed people, faces, mouths, gestures)
- Sound mix: every sound's loudness is set in one table, `LEVELS` in `src/audio/synth.js` (dB). If something's too loud or too quiet, change its number there.
- HUD: the task list and the direction pointer are derived from story state each frame (`computeTasks` in `src/story/story.js`).
- `src/audio/`: every sound synthesized at load time (footsteps per surface, the dog's tag jingle, barks, crickets, doors, lighter...), positional HRTF audio, fog muffling, reverb; voices use the browser's speech synthesis
- `src/story/`: `sequences.js` (the transitions), `story.js` (Day 1 / Night 1 script and triggers)
- `src/render/`: low-res rendering, then a dithered VHS-style post pass

## Next ideas
- Day 2 (Sunday): consequences of the night (did Mrs. Kessler come out for her paper?)
- Moose grows between days (`dog.setAge(0..1)` is already wired up)
- Real voice acting: every line already goes through one `speak(character, text)` call, so recorded lines can drop in later
