import * as THREE from 'three';

export interface FlyerModel {
  group: THREE.Group;
  /** Blends the pose from prone flight (0) to hanging under canopy (1). */
  setCanopy(openness: number): void;
}

/**
 * Placeholder flyer: a flattened body with wing membranes and a simple
 * seven-cell canopy. Replaced by the textured procedural model in phase 4.
 * Faces -z (forward), +y up.
 */
export function createFlyerModel(): FlyerModel {
  const group = new THREE.Group();
  const pose = new THREE.Group();
  group.add(pose);

  const suit = new THREE.MeshStandardMaterial({ color: 0xd8321e, roughness: 0.7, metalness: 0.05 });
  const wing = new THREE.MeshStandardMaterial({ color: 0x1e64d8, roughness: 0.8, side: THREE.DoubleSide });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.0, 4, 8), suit);
  torso.rotation.x = Math.PI / 2;
  pose.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), helmet);
  head.position.set(0, 0.04, -0.72);
  pose.add(head);

  const armWing = new THREE.Shape();
  armWing.moveTo(0.15, -0.55);
  armWing.lineTo(0.95, -0.15);
  armWing.lineTo(0.95, 0.15);
  armWing.lineTo(0.15, 0.55);
  const armGeo = new THREE.ShapeGeometry(armWing);
  armGeo.rotateX(-Math.PI / 2);
  const rightArm = new THREE.Mesh(armGeo, wing);
  const leftArm = new THREE.Mesh(armGeo.clone().scale(-1, 1, 1), wing);
  pose.add(rightArm, leftArm);

  const legWing = new THREE.Shape();
  legWing.moveTo(-0.17, 0.3);
  legWing.lineTo(0.17, 0.3);
  legWing.lineTo(0.42, 0.95);
  legWing.lineTo(-0.42, 0.95);
  const legGeo = new THREE.ShapeGeometry(legWing);
  legGeo.rotateX(-Math.PI / 2);
  pose.add(new THREE.Mesh(legGeo, wing));

  // Canopy: arched span of 7 cells, hung ~5 m above the harness.
  const canopy = new THREE.Group();
  canopy.visible = false;
  group.add(canopy);
  const span = 6.6;
  const chord = 2.8;
  const cells = 7;
  const cellGeo = new THREE.PlaneGeometry(span / cells, chord, 1, 1);
  const arcR = 5.2;
  for (let i = 0; i < cells; i++) {
    const t = (i + 0.5) / cells - 0.5; // -0.5..0.5
    const ang = t * 1.1; // total arc ~63 degrees
    const m = new THREE.Mesh(
      cellGeo,
      new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0xffb454 : 0x1e64d8,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    m.position.set(Math.sin(ang) * arcR, Math.cos(ang) * arcR, 0);
    m.rotation.set(-Math.PI / 2 + 0.25, 0, -ang, 'ZXY');
    canopy.add(m);
  }
  // Lines
  const pts: number[] = [];
  for (let i = 0; i <= cells; i += 2) {
    const t = i / cells - 0.5;
    const ang = t * 1.1;
    for (const zc of [-chord * 0.4, chord * 0.4]) {
      pts.push(0, 0.2, 0, Math.sin(ang) * arcR, Math.cos(ang) * arcR - 0.1, zc);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  canopy.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd })));

  const proneQ = new THREE.Quaternion();
  const hangQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ'));

  return {
    group,
    setCanopy(openness: number) {
      const f = THREE.MathUtils.clamp(openness, 0, 1);
      canopy.visible = f > 0.02;
      // Inflate: grows from a streamer to full size.
      canopy.scale.set(0.15 + 0.85 * f, 0.1 + 0.9 * f, 0.3 + 0.7 * f);
      pose.quaternion.slerpQuaternions(proneQ, hangQ, THREE.MathUtils.smoothstep(f, 0.3, 0.9));
      pose.position.y = -0.4 * f;
    },
  };
}
