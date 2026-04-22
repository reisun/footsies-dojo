import { Hitbox, CHAR_W } from "./types";
import { Fighter, THROW_RANGE, THROW_DAMAGE, THROW_STARTUP } from "./fighter";

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

      // Check if B is guarding (walking back, crouch guard, or in blockstun)
      const bIsGuarding =
        b.state === "walkBack" ||
        b.state === "crouchGuard" ||
        (b.state === "blockstun");

      if (bIsGuarding && b.state !== "attack" && b.state !== "hitstun" && b.state !== "knockdown" && b.state !== "dash") {
        b.takeBlock(ad.chipDamage, ad.guardPushback, ad.blockstun, a.facing);
        // Attacker gets pushed back when blocked
        a.velocityX = -ad.attackerGuardPushback * a.facing;
      } else {
        // 差し返し: medium attack punishing heavy attack recovery → 1.2x damage + knockdown
        const isSashikaeshi = ad.type === "medium"
          && b.state === "attack"
          && b.attackData?.type === "heavy"
          && b.attackFrame >= b.attackData.startup + b.attackData.active;

        if (isSashikaeshi) {
          b.takeKnockdown(Math.floor(ad.damage * 1.2), ad.pushback, a.facing);
        } else if (ad.type === "heavy" && b.state !== "hitstun") {
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
        a.state === "crouchGuard" ||
        (a.state === "blockstun");

      if (aIsGuarding && a.state !== "attack" && a.state !== "hitstun" && a.state !== "knockdown" && a.state !== "dash") {
        a.takeBlock(bd.chipDamage, bd.guardPushback, bd.blockstun, b.facing);
        // Attacker gets pushed back when blocked
        b.velocityX = -bd.attackerGuardPushback * b.facing;
      } else {
        // 差し返し: medium attack punishing heavy attack recovery → 1.2x damage + knockdown
        const isSashikaeshi = bd.type === "medium"
          && a.state === "attack"
          && a.attackData?.type === "heavy"
          && a.attackFrame >= a.attackData.startup + a.attackData.active;

        if (isSashikaeshi) {
          a.takeKnockdown(Math.floor(bd.damage * 1.2), bd.pushback, b.facing);
        } else if (bd.type === "heavy" && a.state !== "hitstun") {
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

/**
 * Check if a fighter walking forward should auto-throw an opponent.
 * Conditions: attacker is walkForward, opponent is guarding, distance < THROW_RANGE
 */
export function checkAutoThrow(a: Fighter, b: Fighter): boolean {
  // Walk forward or dash into guarding opponent → auto throw
  if (a.state !== "walkForward" && a.state !== "dash") return false;
  // Opponent must be in a guarding state
  const bGuarding = b.state === "walkBack" || b.state === "crouchGuard" || b.state === "blockstun";
  if (!bGuarding) return false;

  const dist = Math.abs(a.x - b.x);
  if (dist > THROW_RANGE) return false;

  return true;
}

/**
 * Resolve throw grab during startup frames.
 * Called each frame when a fighter is in "throw" state.
 * Returns true if throw connected this frame.
 */
export function resolveThrow(thrower: Fighter, victim: Fighter): boolean {
  if (thrower.state !== "throw") return false;
  if (thrower.throwHitConfirmed) return false; // already connected
  if (thrower.throwFrame >= THROW_STARTUP) return false; // past startup

  const dist = Math.abs(thrower.x - victim.x);
  // Check if still in range and victim is still grabbable
  const victimGrabbable =
    victim.state === "walkBack" ||
    victim.state === "crouchGuard" ||
    victim.state === "blockstun" ||
    victim.state === "idle";

  if (dist <= THROW_RANGE + 10 && victimGrabbable) {
    // Throw connects!
    thrower.throwHitConfirmed = true;
    victim.takeThrown(THROW_DAMAGE);
    return true;
  }
  return false;
}
