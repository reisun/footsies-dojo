import { Hitbox, CHAR_W } from "./types";
import { Fighter } from "./fighter";

export function boxOverlap(a: Hitbox, b: Hitbox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Resolve attack collisions between two fighters.
 * Returns { hitA: boolean, hitB: boolean } indicating if each landed a hit this frame.
 */
export function resolveAttacks(a: Fighter, b: Fighter): { hitA: boolean; hitB: boolean } {
  let hitA = false;
  let hitB = false;

  // Check A hitting B
  const aHitbox = a.attackHitbox;
  if (aHitbox && !a.attackHitConfirmed) {
    const bHurtbox = b.hurtbox;
    if (boxOverlap(aHitbox, bHurtbox)) {
      a.attackHitConfirmed = true;
      const ad = a.attackData!;

      // Check if B is guarding (walking back and not attacking/in hitstun)
      const bIsGuarding =
        b.state === "walkBack" ||
        (b.state === "blockstun");

      if (bIsGuarding && b.state !== "attack" && b.state !== "hitstun" && b.state !== "knockdown" && b.state !== "dash") {
        b.takeBlock(ad.chipDamage, ad.guardPushback, ad.blockstun, a.facing);
      } else {
        // Heavy attacks cause knockdown
        if (ad.type === "heavy" && b.state !== "hitstun") {
          b.takeKnockdown(ad.damage, ad.pushback, a.facing);
        } else {
          b.takeDamage(ad.damage, ad.pushback, ad.hitstun, a.facing);
        }
        hitA = true;
      }
    }
  }

  // Check B hitting A
  const bHitbox = b.attackHitbox;
  if (bHitbox && !b.attackHitConfirmed) {
    const aHurtbox = a.hurtbox;
    if (boxOverlap(bHitbox, aHurtbox)) {
      b.attackHitConfirmed = true;
      const bd = b.attackData!;

      const aIsGuarding =
        a.state === "walkBack" ||
        (a.state === "blockstun");

      if (aIsGuarding && a.state !== "attack" && a.state !== "hitstun" && a.state !== "knockdown" && a.state !== "dash") {
        a.takeBlock(bd.chipDamage, bd.guardPushback, bd.blockstun, b.facing);
      } else {
        if (bd.type === "heavy" && a.state !== "hitstun") {
          a.takeKnockdown(bd.damage, bd.pushback, b.facing);
        } else {
          a.takeDamage(bd.damage, bd.pushback, bd.hitstun, b.facing);
        }
        hitB = true;
      }
    }
  }

  return { hitA, hitB };
}

/** Push fighters apart so they don't overlap body-to-body */
export function resolvePush(a: Fighter, b: Fighter): void {
  const minDist = CHAR_W; // minimum distance between centers
  const dist = Math.abs(a.x - b.x);
  if (dist < minDist) {
    const overlap = minDist - dist;
    const sign = a.x < b.x ? -1 : 1;
    a.x += (sign * overlap) / 2;
    b.x -= (sign * overlap) / 2;
  }
}
