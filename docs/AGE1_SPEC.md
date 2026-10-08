# Age 1 technical specification (research)

Reference for implementing the original Age of War's first age in our 3D game. Built from source code, not wikis.
Researched 2026-10-08.

## Sources and how much to trust them

| Tag | Repository | What it is | Trust |
| --- | --- | --- | --- |
| **[AI]** | `erupturatis/Age-of-war-AI` | Python NEAT/PPO bot that drives the original Flash game (ships a modified `.swf`) + reads its state. `AgeOfWarAI/GLOBALS.py`, `game_environment.py` | Costs/XP/start gold read from the real game UI. No combat stats. |
| **[UC]** | `erupturatis/Age-of-war-unity-clone` (linked from [AI]'s README) | The same author's Unity simulation, built after decompiling the game's ActionScript; README: "made a quite faithful simulation in unity that had the exact same parameters as the original game". `Assets/scripts/Data.cs`, `Troop.cs`, `Turret.cs`, `Bullet.cs`, `GameManager.cs`, `Enemy_AI.cs` | **Primary numbers.** The author marks the few values they tuned by eye (see conflicts). |
| **[GD]** | `apiotrowski255/age-of-war` | Godot 4 recreation using sprites/sounds extracted from the Flash file. `units/cave/*/*.gd`, `bases/cave_turret_*.gd`, `bases/turret.gd`, `scripts/melee_unit.gd`, `range_unit.gd`, `globals/global_variables.gd`, `ai_spawner.gd` | Good for animation frames, hit frames, art/sfx inventory. Its combat numbers are hand-tuned and differ from [UC]. |
| **[3D]** | `MrPio/AgeOfWarRemake` | Unity 3D multiplayer remake with Blender models. `Scripts/Model/Units/UnitFactory.cs`, `Turrets/TurretFactory.cs`, `Bases/BaseFactory.cs`, `Partials/Camera/*`, `Scenes/Game.unity` | Re-balanced for its own field; useful for 3D presentation only. |

Labels used below: **CONFIRMED** = taken from [UC] code that the author derived from the decompiled ActionScript (or read from the live game by [AI]), and traced to where it is consumed. **INFERRED** = derived/converted by us or flagged as approximate by the source author. **UNKNOWN / NOT FOUND** = no source code reveals it.

### Units of measure (all sources)

- **Time:** the original runs at **41 frames/s** in [UC]'s model (`Data.cs`: `FPS = 41`, comment "41 frames means 1 second"). All "frames" below are original frames; seconds = frames / 41. CONFIRMED in [UC]; the exact Flash frame rate itself is INFERRED by the [UC] author.
- **Distance:** the original lane is **900 units base-to-base** ([UC] `Data.cs`: `MAP_LENGTH = 900`, "inferred from the base coordinates"; bases at Unity x = +-9 with `COEFF = 50`). INFERRED by [UC].
- **Our world:** bases are 80 m apart (`GAME.baseOffset = 40`), so **1 original unit = 0.0889 m** and **1 m = 11.25 units**. Every "m" value below is this conversion (INFERRED).

---

## 1. Original Age 1 overview

| Item | Value | Source | Status |
| --- | --- | --- | --- |
| Age name | Stone/cave age (`stage.cave`) | [GD] `global_variables.gd` | CONFIRMED |
| Starting gold | **175** | [AI] `game_environment.py` (`money = 175`, reset value), [UC] `GameManager.cs` (`money = 175`), [GD] `player_money = 175`, [3D] `BaseFactory.Cave(money: 175)` | CONFIRMED (all agree) |
| Enemy starting gold | 100 (`emoney`) | [UC] `GameManager.cs` | CONFIRMED in [UC]; the enemy AI does not actually spend it (see 10) |
| Base HP, age 1 | **500** | [UC] `Data.base_hp[0]`, `player_hp = 500`; [GD] `player_base.gd health = 500`; [3D] `maxHp: 500` | CONFIRMED |
| Base HP when evolving | +600 to 1100 (age 2), then 2000 / 3200 / 4700. Current HP increases by the difference. | [UC] `GameManager.upgrade_age_*`: `hp += base_hp[age] - base_hp[age-1]` | CONFIRMED |
| XP to reach age 2 | **4000** | [AI] `GLOBALS.experience[0]`, [UC] `xp_cost[0]`, [GD] `get_exp_to_next_age`, [3D] `evolveExpRequired: 4_000` | CONFIRMED |
| Passive income | **None.** Gold comes only from kills and from selling turrets. | [UC]: the only `money +=` are kill rewards (`Troop.try_dying`) and turret sales. [3D] adds money/second only in multiplayer (`GameManager.cs:234`). | CONFIRMED |
| Training queue | 5 units max (`training_queue.Count <= 4` before adding), trained one at a time, first in first out | [UC] `GameManager.dispatch_spawn_troop`, coroutine `training()` | CONFIRMED |
| Turret slots | Start with 1 slot. Extra slots cost **1000 / 3000 / 7500** (max 4). Slot heights 20 / 68 / 116 / 164 units up the base tower. | [AI] `turret_slots`, [UC] `slot_cost`, `turret_spot` | CONFIRMED |
| Selling a turret | Refunds **50 %** of its price | [UC] `sell_turret_player`: `new_money /= 2`. ([AI]'s bot model refunds 100 %, which is a bug in the bot, not the game.) | CONFIRMED |
| Special ability (age 1) | Meteor/rock shower: **22 projectiles, one every 9 frames (0.22 s)**, falling from above at random x within +-8 Unity units (+-400 units) of the spawn point, each **200 damage**. Cooldown **60 s**. | [UC] `ability1`, `spawn_bullet(damage = 200)`, `ability_time = 60f` | CONFIRMED in [UC] |
| Difficulty | Enemy unit HP and damage multiplied by `diff`; [UC]'s trainer used 1.2 / 1.3 / 1.5 for its three settings | [UC] `spawn_enemy_troop`, `Master.swap_diff` | INFERRED: whether these equal the original Easy/Normal/Hard multipliers is not stated |

## 2. Clubman (age 1, tier 1, melee)

| Property | Value | Source | Status |
| --- | --- | --- | --- |
| Cost | 15 | [AI] `troops[1].tier1`, [UC] `troop_costs[0]`, [GD], [3D] | CONFIRMED |
| Training time | 40 frames = **0.98 s** | [UC] `troop_training_times[0]`, consumed in `training()` as `training / FPS` | CONFIRMED |
| HP | **55** | [UC] `troop_hps[0]` (consumed via `set_parameters` -> `health`, decremented in `give_damage`/`Bullet`) | CONFIRMED ([GD] uses 70, [3D] 55) |
| Melee damage | **16** per hit | [UC] `troop_melee_damages[0]` -> `give_damage(melee_damage)` | CONFIRMED ([GD] 10, [3D] 16) |
| Ranged damage | none | [UC] `troop_ranged_damages[0] = 0` | CONFIRMED |
| Melee range | 20 units (1.8 m), measured front-to-front against the first enemy | [UC] `troop_melee_ranges[0]`, `check_attacking` | CONFIRMED |
| Body length | 20 units (1.8 m) | [UC] `troop_lengths[0]` | CONFIRMED |
| Move speed | **40 units/s (3.6 m/s)**, same for every unit ("a troop walks 450 units in 11.5 seconds") | [UC] `TroopData.speed = 40f`, consumed in `try_moving` | CONFIRMED (measured by [UC] author) |
| First hit delay | **0.43 s** after entering melee range | [UC] `troop_melee_first_speeds[0]` -> first `attack_melee(cooldown)` | CONFIRMED |
| Hit interval | `melee_speed + attack_pause / FPS` = 1.0 + 20/41 = **1.49 s** | [UC] `attack_melee` recursion | CONFIRMED (sum is our arithmetic) |
| DPS | about 10.7 | 16 / 1.49 | INFERRED |
| Kill reward (enemy kills this unit) | gold **round(1.3 x cost) = 20**; killer gains XP **2 x 20 = 40** | [UC] `Troop.try_dying` (enemy branch); [GD] `money_die_reward = 20`, `exp += 2 * reward` | CONFIRMED |
| XP when your own unit dies | **reward / 2 = 10** | [UC] `try_dying` player branch: `xp += reward / 2`; [GD] same | CONFIRMED |
| Hit frame (animation) | sprite sheet: sfx on frame 12, damage on frame 19 | [GD] `cave_melee.gd attack_state` | CONFIRMED in [GD] only |
| Knockback / stun | none | not present in [UC] or [GD] | NOT FOUND (treat as none) |
| Regeneration | only when `is_regenerating` (+1 HP per frame); never set for age 1 | [UC] `Troop.Regenerate` | CONFIRMED (not used in age 1) |

## 3. Slingshot Man (age 1, tier 2, mixed ranged/melee)

| Property | Value | Source | Status |
| --- | --- | --- | --- |
| Cost | 25 | all four repos | CONFIRMED |
| Training time | 40 frames = 0.98 s | [UC] | CONFIRMED |
| HP | **42** | [UC] `troop_hps[1]` | CONFIRMED ([GD] 50, [3D] 42) |
| Ranged damage | **8** | [UC] `troop_ranged_damages[1]` | CONFIRMED ([GD] 5, [3D] 5) |
| Melee damage | **10** (used when an enemy is in melee range; ranged shots are then suppressed) | [UC] `troop_melee_damages[1]`; `attack_range` skips damage while `attacking_melee` | CONFIRMED |
| Ranged range | **100 units (8.9 m)**, measured as gap minus `MIN_DISTANCE` (20) | [UC] `troop_ranged_ranges[1]`, `check_attacking` | CONFIRMED |
| Shot interval, standing | 0.8 + 20/41 = **1.29 s** | [UC] `troop_ranged_speeds[1]` (`ranged_standing_speed`) + `attack_pause` | CONFIRMED |
| Shot interval, walking | 1.07 + 20/41 = **1.56 s**; **it fires while still walking** | [UC] `troop_walking_ranged_speeds[1]`; `attack_range` picks walking/standing by `is_moving` | CONFIRMED |
| First shot delay | 0 s | [UC] `ranged_first_speed = 0` | CONFIRMED |
| Projectile | **no simulated projectile**: damage is applied instantly to the first enemy; the stone is cosmetic | [UC] `give_damage`; [GD] raycast `do_damage` on frame 22 (idle) / 23 (walking) | CONFIRMED in both recreations; the original's internal model is UNKNOWN beyond this |
| Kill reward | gold 33, XP 66 to the killer; 16 XP to the owner when it dies | [UC] formula, [GD] `money_die_reward = 33` | CONFIRMED |
| Animations | walk, idle, walk_attack, idle_attack, melee_attack, die | [GD] sprite folders `units/cave/range/*` | CONFIRMED |

## 4. Dino Rider (age 1, tier 3, heavy melee)

| Property | Value | Source | Status |
| --- | --- | --- | --- |
| Cost | 100 | all four repos | CONFIRMED |
| Training time | 100 frames = **2.44 s** | [UC] | CONFIRMED ([3D] uses 3 s) |
| HP | **160** | [UC] `troop_hps[2]` | CONFIRMED ([GD] 120, [3D] 160) |
| Melee damage | **40** | [UC], [GD], [3D] agree | CONFIRMED |
| Melee range | 20 units | [UC] | CONFIRMED |
| Body length | **80 units (7.1 m)**: allies queue behind it, and its collision box is wider (0.7 x 0.5 Unity units) | [UC] `troop_lengths[2]`, `Troop.Start` box size for id 2 | CONFIRMED |
| First hit delay | 0.32 s | [UC] `troop_melee_first_speeds[2]` | CONFIRMED |
| Hit interval | 1.12 + 45/41 = **2.22 s** | [UC] `troop_melee_speeds[2]`, `frames_wait_attack[2] = 45` | CONFIRMED |
| DPS | about 18 | 40 / 2.22 | INFERRED |
| Kill reward | gold 130, XP 260 to the killer; 65 XP to the owner | formula; [GD] `money_die_reward = 130` | CONFIRMED |
| Hit frame | sfx frame 18, damage frame 21 | [GD] `cave_tank.gd` | CONFIRMED in [GD] |
| Look | rider in a horned skull mask with a long spear, on a green horned four-legged dinosaur | [GD] sprites `units/cave/tank/*` | CONFIRMED (visual) |

## 5. Rock Slingshot (age 1 turret 1)

| Property | Value | Source | Status |
| --- | --- | --- | --- |
| Cost | **100** | [AI] `turrets[1].tier1`, [UC] `turret_cost[0]`, [GD], [3D] | CONFIRMED |
| Damage | **12** per projectile | [UC] `turret_damage[0]`, applied in `Bullet.OnCollisionEnter2D` | CONFIRMED ([GD] 15, [3D] 10) |
| Range | **350 units (31 m)**, euclidean from the turret (on its tower slot) to the target | [UC] `turret_range[0]`, `Turret.check_attacking` | CONFIRMED |
| First shot | 0.1 s after a target enters range | [UC] `turret_initial_speed[0]` | CONFIRMED |
| Fire interval | `speed + additional / (FPS*2)` = 0.8 + 30/82 = **1.17 s** | [UC] `Turret.attack_range` | INFERRED: the [UC] author notes "I didn't totally figure out how these values work so I adjusted some of them to match in game time" |
| Projectile | physical stone, **250 units/s (22 m/s)**, straight line aimed at the target's position at launch, no gravity, hits the **first enemy troop it touches**, despawns after 3.5 s | [UC] `Bullet.Update` (`250f / COEFF`), `OnCollisionEnter2D`, `AutoDestroy(3.5f)` | CONFIRMED in [UC]; per-turret projectile speeds are UNKNOWN ([UC] uses one speed for all; [GD] uses 400 px/s) |
| Splash | none | [UC] `turret_makes_fragment[0] = false` | CONFIRMED |
| Look | wooden frame with a stone mallet / sling arm | [GD] `bases/cave/turret_1/*` | CONFIRMED (visual) |

## 6. Egg Automatic (age 1 turret 2)

| Property | Value | Source | Status |
| --- | --- | --- | --- |
| Cost | **200** | all four repos | CONFIRMED |
| Damage | **5** per egg | [UC] `turret_damage[1]` | CONFIRMED ([GD] 2, [3D] 2.25) |
| Range | **300 units (26.7 m)** | [UC] `turret_range[1]` | CONFIRMED |
| First shot | immediate | [UC] `turret_initial_speed[1] = 0` | CONFIRMED |
| Fire interval | 0.25 + 11/82 = **0.38 s** (about 13 damage/s) | [UC] | INFERRED (same tuning caveat as above) |
| Projectile | egg, same projectile model as above; [GD] adds a random spin (`projectile_rotation = true`) | [UC] `Bullet`, [GD] `cave_turret_2.gd` | CONFIRMED (spin is cosmetic) |
| Splash | none | [UC] | CONFIRMED |
| Look | a bird (chicken) in a wooden crate that shoots eggs | [GD] `bases/cave/turret_2/*` | CONFIRMED (visual) |

## 7. Primitive Catapult (age 1 turret 3)

| Property | Value | Source | Status |
| --- | --- | --- | --- |
| Cost | **500** | all four repos | CONFIRMED |
| Damage | **25** | [UC] `turret_damage[2]` | CONFIRMED ([GD] 40, [3D] 30) |
| Range | **380 units (33.8 m)** | [UC] `turret_range[2]` | CONFIRMED |
| First shot | 0.17 s | [UC] `turret_initial_speed[2]` | CONFIRMED |
| Fire interval | 1.37 + 20/82 = **1.61 s** | [UC] | INFERRED (tuning caveat) |
| Projectile | boulder, same projectile model | [UC] | CONFIRMED (per-turret speed UNKNOWN) |
| Minimum range quirk | In the **lowest slot** (slot 0), catapult-type turrets aim no closer than 70 units ahead, so they **cannot hit enemies right at the base** | [UC] `Turret.spawn_bullet` ("the catapult type of turrets have a bug that doesn't allow them to shoot enemies near base") | CONFIRMED (reproduced from the original's behaviour) |
| Splash | none in age 1 (fragments start with the Fire Catapult, age 2) | [UC] `turret_makes_fragment` | CONFIRMED |
| Look | bone/skull catapult throwing a round boulder | [GD] `bases/cave/turret_3/*` | CONFIRMED (visual) |

## 8. Projectile system

- **Turret shots are real projectiles** ([UC] `Bullet`): straight line toward where the target was at launch, 250 units/s, collide with the **first enemy troop** they touch (not necessarily the target), never hit the base, despawn after 3.5 s. CONFIRMED in [UC].
- **Unit ranged attacks are instant hits** on the front enemy; the stone is visual. CONFIRMED in [UC] and [GD].
- **Special ability bullets** fall from above with `gravity = true` (direction.y decreases each frame) and deal 200 each. CONFIRMED in [UC].
- Our current sim: arrows are simulated projectiles with arcs that always hit their target. Implications are in section 16.

## 9. Combat system

- **One-dimensional lane.** Only x matters. CONFIRMED ([UC] all checks use `position.x`; [GD] raycasts along x).
- **Front-unit rule.** A team's units only ever fight the enemy team's **front unit** (`enemy_troops_queue[0]`): melee and ranged both target it. When it dies, the attacker resumes walking. CONFIRMED [UC] `check_attacking`, `give_damage`.
- **Spacing.** A unit stops when the gap to the unit ahead minus that unit's length is at most 20 units (`MIN_DISTANCE`); the front unit stops 20 units from the enemy front unit. Units never overlap or pass. CONFIRMED [UC] `check_moving`.
- **Melee beats ranged in the same unit.** If the front enemy is within melee range, the unit melees and its ranged shots deal nothing. CONFIRMED [UC] `attack_range`.
- **Attack cadence** = first-hit delay, then `speed + pause/41` repeating while in range (sections 2-4). Damage lands at the end of each wait (no wind-up separate from the timer). CONFIRMED [UC].
- **No crits, armor, knockback or stun** in any source. NOT FOUND.
- **Death.** HP <= 0: the unit is removed from the queue immediately; rewards are paid at that moment. CONFIRMED [UC] `try_dying`. Death animation length: [GD] uses a `death_timer` (sprite fades); exact original duration UNKNOWN.

## 10. Targeting / AI

- **Units:** always the enemy front unit, else the enemy base when no enemy units remain and the base is within range (bases are at x = +-450 units). CONFIRMED [UC].
- **Turrets:** the enemy front unit if within their euclidean range; nothing else (never the base). CONFIRMED [UC] `Turret.check_attacking`. [GD] targets in the order enemies entered the range area, which is effectively the same in a 1D lane.
- **Enemy AI (original, as extracted by [UC] from ActionScript, `Enemy_AI.cs` header):**
  - Each second, a **30 % chance** to queue a unit, only while it has fewer than **6 units** on the field. CONFIRMED.
  - Unit type is random among unlocked tiers; tier 2 unlocks after **1500 frames (37 s)** and tier 3 after **5000 frames (122 s)** of the age. CONFIRMED.
  - Enemy units still train like the player's. CONFIRMED.
  - It **evolves after 8000 frames (195 s)** per age regardless of XP. CONFIRMED.
  - Turrets follow a fixed script. Age 1: at 1000 frames build Rock Slingshot in slot 1; at ~4000 sell it and build Egg Automatic; at ~6000 sell that and build the Primitive Catapult. CONFIRMED.
  - It does not spend gold (it has no economy constraint beyond these rules). INFERRED from [UC] code paths (`dispatch_spawn_troop(…, false)` does not deduct gold).
- [GD]'s AI is its own design (random waits of 2-8 s, age change every 180-240 s). Not the original.

## 11. Base interaction

- Units attack the base only when no enemy units are alive, using their melee/ranged range against the base's edge (x = +-450 units in [UC]). CONFIRMED.
- Base HP 500 in age 1. The game ends at HP <= 0 (`check_game_status`). CONFIRMED.
- Turret slots are stacked **vertically** on the base's tower (heights 20/68/116/164 units). Their range is measured from that elevated point. CONFIRMED [UC] `turret_spot`, `Vector2.Distance`.
- Turrets never damage bases. CONFIRMED.

## 12. Economy / costs (age 1)

| Item | Gold | Status |
| --- | --- | --- |
| Clubman / Slingshot Man / Dino Rider | 15 / 25 / 100 | CONFIRMED |
| Rock Slingshot / Egg Automatic / Primitive Catapult | 100 / 200 / 500 | CONFIRMED |
| Extra turret slots | 1000 / 3000 / 7500 | CONFIRMED |
| Kill reward | round(1.3 x unit cost): 20 / 33 / 130 | CONFIRMED |
| Turret sale | 50 % of price | CONFIRMED |
| Starting gold | 175 | CONFIRMED |
| Income | none (kills only) | CONFIRMED |

## 13. XP / progression

- XP for killing an enemy unit: **2 x kill reward** (40 / 66 / 260). CONFIRMED.
- XP when one of your units dies: **kill reward / 2** (10 / 16 / 65). CONFIRMED (both [UC] and [GD]).
- Evolve at **4000 XP** (age 1 -> 2). All three unit tiers are available to the player from the start of the age (no XP unlocks): [UC]'s spawn check only tests gold (`GameManager.cs` ~line 795, `money >= troop_costs[...]`), and [GD]'s menu offers all three. CONFIRMED. (Our game currently locks Archer/Brute behind XP; that is our own rule.)
- Upgrades (our "Sharpened Weapons" etc.) do not exist in the original. NOT FOUND in any source.

## 14. Animations (from [GD] sprite sheets)

| Entity | Clips | Hit timing |
| --- | --- | --- |
| Clubman | walk, idle, attack, die | damage at attack frame 19 (sfx 12) |
| Slingshot Man | walk, idle, walk_attack, idle_attack, melee_attack, die | damage at frame 22 (idle) / 23 (walking) / 20 (melee) |
| Dino Rider | walk, idle, attack, die | damage at frame 21 (sfx 18) |
| Rock Slingshot | idle, attack (32 frames) | projectile at frame 5 |
| Egg Automatic | idle, attack | projectile at frame 3 |
| Primitive Catapult | idle, attack | projectile at frame 7 |

Sprite frame rates are not given in code (Godot SpriteFrames resources). UNKNOWN in seconds. For us, the [UC] timers are the gameplay truth; animation clips must be timed so the hit frame lands when the timer fires.

## 15. Visual / asset reference (look only, nothing copied)

- **Base:** a cave built from huge stacked grey boulders with a dark doorway, and a tower of stone blocks beside it holding the turret slots ([GD] `bases/cave/base`, `tower_*`). Our palisade camp is a different reading; the original is a rock cave.
- **Units:** cavemen in spotted leopard-skin tunics, bare legs and feet, long hair with a headband; club (Clubman), Y-slingshot (Slingshot Man); the Dino Rider wears a horned skull mask, carries a long spear, and rides a green horned dinosaur roughly 2.5x human length.
- **Turrets:** wooden frame + stone (Rock Slingshot), bird in a crate (Egg Automatic), bone catapult with a boulder (Primitive Catapult).
- **Background:** blue sky, cartoon trees and bushes, a dirt strip as the lane.
- **Sound:** per-unit attack/death sfx and music *Glorious Morning* by Waterflame ([GD] README). These are third-party/copyrighted and are not used in our project.

## 16. 3D translation plan

Scale: 11.25 original units = 1 m. Keep the 1D lane rule in the sim; z is cosmetic.

| Entity | Our 3D version |
| --- | --- |
| Clubman | 1.8 m caveman (re-use the Soldier rig; swap spear for a club). Walk 3.6 m/s. Melee reach 1.8 m. Attack clip timed so the club lands 0.43 s after contact, then every 1.49 s. Death clip + ragdoll-style fall. |
| Slingshot Man | Same rig with a slingshot. Instant-hit ranged attack at 8.9 m on the front enemy, every 1.29 s standing / 1.56 s walking (fires while walking: needs an upper-body attack layer over the walk). Cosmetic stone tracer from hand to target. Switches to melee (10 dmg) at 1.8 m. |
| Dino Rider | New quadruped model, about 7 m long with rider. Occupies 7 m of lane (allies queue behind). 40 dmg every 2.22 s. |
| Rock Slingshot | Wooden sling frame on the tower slot. Physical stone projectile at 22 m/s, straight, hits the first enemy it touches. 12 dmg, range 31 m. |
| Egg Automatic | Bird in a crate; rapid eggs (0.38 s), 5 dmg, range 26.7 m, spinning egg mesh. |
| Primitive Catapult | Bone catapult with boulder; 25 dmg, range 33.8 m, 1.61 s; dead zone of 6.2 m in front of the base when in slot 1. |
| Base | Rock-cave base with a stacked-stone tower holding up to 4 turret slots (heights 1.8 / 6.0 / 10.3 / 14.6 m). |

Hit detection: unit attacks stay front-unit based (no physics). Turret projectiles need a lane-space segment test against enemy units' x-intervals each tick.

## 17. Conflicts between repositories

| Value | [UC] | [GD] | [3D] | Why they differ |
| --- | --- | --- | --- | --- |
| Clubman HP / dmg | 55 / 16 | 70 / 10 | 55 / 16 | [GD] hand-tuned; [3D] copied the original numbers |
| Slingshot HP / ranged dmg | 42 / 8 | 50 / 5 | 42 / 5 | [GD], [3D] re-balanced ranged damage |
| Dino HP | 160 | 120 | 160 | [GD] re-balanced |
| Rock Slingshot dmg | 12 | 15 | 10 | re-balancing in recreations |
| Egg Automatic dmg | 5 | 2 | 2.25 | [GD]/[3D] fire faster per animation frame, so lower per-hit damage |
| Catapult dmg | 25 | 40 | 30 | re-balancing |
| Training times | 0.98 / 0.98 / 2.44 s | instant spawn | 1 / 1 / 3 s | [GD] has no queue timer; [3D] rounded |
| Turret fire rates | formula, partly hand-adjusted by the author | animation-driven | separate model | the original's exact turret timing is the least certain part |
| Income | none | none | +money/s in multiplayer only | [3D] design change |

Conclusion: use [UC] numbers (traced to the decompiled game); treat turret fire intervals as approximate.

## 18. Confirmed facts vs uncertain

- **CONFIRMED:** all costs, start gold 175, base HP 500 and age-up HP, XP 4000, kill rewards (1.3 x cost), XP rules (x2 for kills, /2 for own deaths), unit HP/damage/ranges/lengths/speed, unit attack timers, training times, queue size 5, slot costs and heights, 50 % sell refund, no passive income, front-unit targeting, turret projectiles hit the first unit touched, catapult dead zone, enemy AI rules, special ability 22 x 200 dmg / 60 s.
- **INFERRED:** 41 fps time base and 900-unit lane length (derived by the [UC] author), turret fire intervals (author partly tuned), our metre conversion, DPS figures, difficulty multipliers' mapping to Easy/Normal/Hard.
- **UNKNOWN / NOT FOUND:** per-turret projectile speeds in the original; animation frame rates in seconds; exact death animation duration; whether the original simulates the Slingshot Man's stone; knockback/stun (none found anywhere).

## 19. Recommended implementation architecture (for our codebase)

1. **Data:** add `src/config/age1.ts` with the table values above (in original units + seconds), converted to metres in one place (`ORIGINAL_UNITS_PER_METRE = 11.25`). Keep our current units/turret schema; extend `UnitDef` with `length`, `firstHitDelay`, `rangedWalkInterval`; extend `TurretDef` with `firstShotDelay`, `minRange`.
2. **Sim (`src/sim/World.ts`):** keep the lane model; switch targeting to the strict front-unit rule; add body length to spacing; make unit ranged attacks instant hits (visual tracer only); make turret projectiles collide with the first enemy along the path; remove passive income and use kill rewards = 1.3 x cost, XP x2 / x0.5; enemy AI per section 10.
3. **Turret slots:** a slot system on the base (buy slot, build, sell 50 %), slots stacked on a tower.
4. **Presentation:** rock-cave base + stone tower; Clubman / Slingshot Man from the Soldier rig with swapped weapons; new Dino Rider model; three turret models. Animation clips timed to the sim's timers (sim events drive the strike frame).
5. **Camera:** fixed near-base composition (implemented separately, see `src/config/camera.ts`).
6. **Tests:** pin every CONFIRMED number with unit tests (one per table row), the same way `tests/combat.test.ts` covers the current stats.
