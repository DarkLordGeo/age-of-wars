import type { EventBus } from '../game/EventBus';

export type SoundCue =
  | 'attack_melee'
  | 'attack_turret'
  | 'projectile_fire'
  | 'impact_hit'
  | 'impact_miss'
  | 'unit_hit'
  | 'unit_death'
  | 'base_damage'
  | 'unit_spawn'
  | 'age_up'
  | 'victory'
  | 'defeat';

/** Implement this with real audio later (WebAudio, howler-style mixer, ...). */
export interface SoundBank {
  play(cue: SoundCue): void;
}

/** Placeholder bank: just counts cues so hooks can be verified without any audio assets. */
export class PlaceholderSoundBank implements SoundBank {
  readonly counts: Partial<Record<SoundCue, number>> = {};

  play(cue: SoundCue): void {
    this.counts[cue] = (this.counts[cue] ?? 0) + 1;
  }
}

/** Map simulation events to sound cues. */
export function bindAudio(bus: EventBus, bank: SoundBank): void {
  bus.on('attack', (e) => bank.play(e.sourceKind === 'turret' ? 'attack_turret' : 'attack_melee'));
  bus.on('projectileFired', () => bank.play('projectile_fire'));
  bus.on('projectileImpact', (e) => bank.play(e.hit ? 'impact_hit' : 'impact_miss'));
  bus.on('hit', (e) => e.targetKind === 'unit' && bank.play('unit_hit'));
  bus.on('death', () => bank.play('unit_death'));
  bus.on('baseDamage', () => bank.play('base_damage'));
  bus.on('spawn', () => bank.play('unit_spawn'));
  bus.on('ageAdvanced', () => bank.play('age_up'));
  bus.on('victory', () => bank.play('victory'));
  bus.on('defeat', () => bank.play('defeat'));
}
