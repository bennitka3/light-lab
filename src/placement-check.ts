import { Box3, type Object3D, Vector3 } from '@iwsdk/core';

/**
 * "Does this look like realistic placement of objects?" (ben, round 10). A dev-only check
 * the tests run on every scene before an update ships: nobody stands inside a wall or a
 * light, the silk flies over heads, the crew stand on the floor. It catches the obvious
 * physical mistakes; a screenshot review (scripts/placement-check.cjs) catches the rest.
 */
export type PlacementInput = {
  stage: Object3D;
  /** People: cast and crew, by name. */
  people: { name: string; object: Object3D; inCar?: boolean }[];
  /** Lights, silks and cards (stand included), by name. */
  gear: { name: string; object: Object3D }[];
  /** Whether the scene is outdoors (no studio walls or floor edge to check). */
  outdoor: boolean;
  /** The studio floor's extent in stage-local x and z (the set floor plus the apron). */
  floor: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const box = new Box3();
const other = new Box3();
const size = new Vector3();

/** A person's box shrunk to their core (arms, hair and chair legs stick out of the true box). */
function coreBox(object: Object3D, out: Box3, inset = 0.25): Box3 {
  visibleBox(object, out);
  out.getSize(size);
  out.min.x += size.x * inset;
  out.max.x -= size.x * inset;
  out.min.z += size.z * inset;
  out.max.z -= size.z * inset;
  out.max.y -= size.y * 0.05;
  return out;
}

/** Whether a part and everything above it (up to `root`) is shown. */
function shown(part: Object3D, root: Object3D): boolean {
  for (let o: Object3D | null = part; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) return true;
  }
  return true;
}

/** Box of only the shown meshes (Box3.setFromObject counts hidden parts too, like a stowed stand). */
function visibleBox(object: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  const part = new Box3();
  object.traverse((child) => {
    if ((child as { isMesh?: boolean }).isMesh && shown(child, object)) out.union(part.setFromObject(child));
  });
  return out;
}

/** Stage-local box of an object's shown parts (the stage may be scaled and moved in the room). */
export function localBox(stage: Object3D, object: Object3D, out: Box3): Box3 {
  visibleBox(object, out);
  return out.applyMatrix4(stage.matrixWorld.clone().invert());
}

export function checkPlacement(input: PlacementInput): string[] {
  const issues: string[] = [];
  const { stage, people, gear } = input;
  stage.updateWorldMatrix(true, true);
  const walls: Object3D[] = [];
  stage.traverse((child) => {
    if (child.name === 'stage-wall' && child.visible) walls.push(child);
  });
  for (const person of people) {
    if (!person.object.visible) continue;
    coreBox(person.object, box);
    for (const item of gear) {
      if (!item.object.visible) continue;
      // Part by part: a silk's frame over someone's head is fine, its whole box isn't the point.
      let hit = false;
      item.object.traverse((part) => {
        if (hit || !(part as { isMesh?: boolean }).isMesh || !shown(part, item.object)) return;
        other.setFromObject(part);
        if (box.intersectsBox(other)) hit = true;
      });
      if (hit) issues.push(`${item.name} cuts through ${person.name}`);
    }
    for (const wall of walls) {
      other.setFromObject(wall);
      if (box.intersectsBox(other)) issues.push(`${person.name} is inside a studio wall`);
    }
    for (const someone of people) {
      if (someone === person || !someone.object.visible || someone.name <= person.name) continue;
      if (person.inCar && someone.inCar) continue;
      coreBox(someone.object, other, 0.35);
      const mine = coreBox(person.object, new Box3(), 0.35);
      if (mine.intersectsBox(other)) issues.push(`${person.name} and ${someone.name} overlap`);
    }
    const local = localBox(stage, person.object, new Box3());
    if (Math.abs(local.min.y) > 0.012 && !person.inCar) {
      issues.push(`${person.name} is ${local.min.y > 0 ? 'floating' : 'sunk into the floor'} (${local.min.y.toFixed(3)} m)`);
    }
    if (!input.outdoor) {
      const cx = (local.min.x + local.max.x) / 2;
      const cz = (local.min.z + local.max.z) / 2;
      const { minX, maxX, minZ, maxZ } = input.floor;
      if (cx < minX || cx > maxX || cz < minZ || cz > maxZ) issues.push(`${person.name} stands off the studio floor`);
    }
  }
  for (const item of gear) {
    if (!item.object.visible) continue;
    const local = localBox(stage, item.object, new Box3());
    if (local.min.y < -0.006) issues.push(`${item.name} goes through the floor`);
  }
  return issues;
}
