import * as THREE from 'three';

export interface FlyerModel {
  group: THREE.Group;
  /** Blends the pose from prone flight (0) to hanging under canopy (1). */
  setCanopy(openness: number): void;
  /** Swap the suit texture. */
  setTexture(tex: THREE.Texture): void;
  /** Animate control surfaces: pitch/roll inputs bend the wings slightly. */
  setControls(pitch: number, roll: number, dive: number): void;
}

/**
 * Procedural wingsuit flyer built from primitives. Faces -z (forward), +y up,
 * origin at the chest. The suit (body, limbs, wings) shares one textured
 * material with the whole texture mapped across each wing panel.
 */
export function createFlyerModel(): FlyerModel {
  const group = new THREE.Group();
  const pose = new THREE.Group();
  group.add(pose);

  const suit = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.1 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.15, metalness: 0.6 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

  // Torso: flattened capsule-ish box.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.8, 1, 1, 4), suit);
  torso.position.set(0, 0, 0.05);
  remapUv(torso.geometry, 0.3, 0.7, 0.35, 0.65);
  pose.add(torso);

  // Head + helmet + visor
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), helmet);
  head.position.set(0, 0.06, -0.5);
  head.scale.set(1, 1, 1.15);
  pose.add(head);
  const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.35), visor);
  visorMesh.position.copy(head.position).add(new THREE.Vector3(0, -0.005, -0.03));
  visorMesh.rotation.y = Math.PI;
  pose.add(visorMesh);

  // Arms: swept back ~35° from straight-out, slightly down.
  const armLen = 0.62;
  const armSweep = THREE.MathUtils.degToRad(35);
  const makeArm = (side: 1 | -1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.2, 0.02, -0.25);
    arm.rotation.y = -side * armSweep;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, armLen, 8), suit);
    upper.rotation.z = -side * Math.PI / 2;
    upper.position.x = side * armLen / 2;
    remapUv(upper.geometry, 0.1, 0.25, 0.4, 0.6);
    arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), boots);
    hand.position.x = side * (armLen + 0.03);
    arm.add(hand);
    return arm;
  };
  const rightArm = makeArm(1);
  const leftArm = makeArm(-1);
  pose.add(rightArm, leftArm);

  // Arm wings: membrane from arm to hip, in the arm's local frame so it sweeps with the arm.
  const makeArmWing = (side: 1 | -1) => {
    const shape = new THREE.Shape();
    shape.moveTo(0.02, 0.02);
    shape.lineTo(side * armLen, 0.02);
    shape.lineTo(side * armLen * 0.95, -0.32);
    shape.lineTo(side * 0.2, -0.78);
    shape.lineTo(0.0, -0.78);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape, 6);
    // ShapeGeometry lies in XY; rotate so Y maps to -Z (backwards along the body).
    geo.rotateX(-Math.PI / 2);
    const wing = new THREE.Mesh(geo, suit);
    remapUv(geo, side === 1 ? 0.5 : 0.0, side === 1 ? 1.0 : 0.5, 0.0, 0.9, side === -1);
    wing.position.set(0, -0.02, 0);
    return wing;
  };
  rightArm.add(makeArmWing(1));
  leftArm.add(makeArmWing(-1));

  // Legs: spread ~20° each.
  const legLen = 0.8;
  const legSpread = THREE.MathUtils.degToRad(18);
  const makeLeg = (side: 1 | -1) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, -0.02, 0.4);
    leg.rotation.y = side * legSpread;
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, legLen, 8), suit);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.z = legLen / 2;
    remapUv(thigh.geometry, 0.35, 0.65, 0.7, 1.0);
    leg.add(thigh);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.22), boots);
    boot.position.set(0, -0.01, legLen + 0.08);
    leg.add(boot);
    return leg;
  };
  const rightLeg = makeLeg(1);
  const leftLeg = makeLeg(-1);
  pose.add(rightLeg, leftLeg);

  // Leg wing between the legs.
  const legWingShape = new THREE.Shape();
  legWingShape.moveTo(-0.08, -0.35);
  legWingShape.lineTo(0.08, -0.35);
  legWingShape.lineTo(0.36, -1.2);
  legWingShape.lineTo(-0.36, -1.2);
  legWingShape.closePath();
  const legWingGeo = new THREE.ShapeGeometry(legWingShape, 4);
  // Shape Y maps to -Z after this rotation, so negative Y extends backwards.
  legWingGeo.rotateX(-Math.PI / 2);
  const legWing = new THREE.Mesh(legWingGeo, suit);
  remapUv(legWingGeo, 0.2, 0.8, 0.2, 1.0);
  legWing.position.set(0, -0.03, 0);
  pose.add(legWing);

  // Container / parachute pack on the back.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.42), boots);
  pack.position.set(0, 0.15, 0.1);
  pose.add(pack);

  // Canopy: arched span of 7 cells, hung ~5 m above the harness.
  const canopy = new THREE.Group();
  canopy.visible = false;
  group.add(canopy);
  const span = 6.6;
  const chord = 2.8;
  const cells = 7;
  const cellGeo = new THREE.PlaneGeometry(span / cells, chord, 1, 1);
  const arcR = 5.2;
  const canopyMats = [
    new THREE.MeshStandardMaterial({ color: 0xffb454, roughness: 0.9, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x1e64d8, roughness: 0.9, side: THREE.DoubleSide }),
  ];
  for (let i = 0; i < cells; i++) {
    const t = (i + 0.5) / cells - 0.5;
    const ang = t * 1.1;
    const m = new THREE.Mesh(cellGeo, canopyMats[i % 2]);
    m.position.set(Math.sin(ang) * arcR, Math.cos(ang) * arcR, 0);
    m.rotation.set(-Math.PI / 2 + 0.25, 0, -ang, 'ZXY');
    canopy.add(m);
  }
  const pts: number[] = [];
  for (let i = 0; i <= cells; i += 2) {
    const t = i / cells - 0.5;
    const ang = t * 1.1;
    for (const zc of [-chord * 0.4, chord * 0.4]) pts.push(0, 0.2, 0, Math.sin(ang) * arcR, Math.cos(ang) * arcR - 0.1, zc);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  canopy.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd })));

  const proneQ = new THREE.Quaternion();
  const hangQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ'));
  let openness = 0;

  return {
    group,
    setCanopy(f: number) {
      openness = THREE.MathUtils.clamp(f, 0, 1);
      canopy.visible = openness > 0.02;
      canopy.scale.set(0.15 + 0.85 * openness, 0.1 + 0.9 * openness, 0.3 + 0.7 * openness);
      pose.quaternion.slerpQuaternions(proneQ, hangQ, THREE.MathUtils.smoothstep(openness, 0.3, 0.9));
      pose.position.y = -0.4 * openness;
      // Arms up on the toggles once hanging.
      const up = THREE.MathUtils.smoothstep(openness, 0.5, 1);
      rightArm.rotation.z = -up * 1.2;
      leftArm.rotation.z = up * 1.2;
    },
    setTexture(tex: THREE.Texture) {
      suit.map = tex;
      suit.needsUpdate = true;
    },
    setControls(pitch: number, roll: number, dive: number) {
      if (openness > 0.5) return;
      // Dive: sweep the arms back; roll: dip one arm; pitch: legs up/down.
      const sweep = armSweep + dive * 0.6;
      rightArm.rotation.y = -sweep;
      leftArm.rotation.y = sweep;
      rightArm.rotation.z = -roll * 0.25;
      leftArm.rotation.z = -roll * 0.25;
      rightLeg.rotation.x = leftLeg.rotation.x = pitch * 0.15;
    },
  };
}

/**
 * Remaps a geometry's UVs into a sub-rectangle of the texture based on its
 * bounding box, so each panel shows a region of the suit texture.
 */
function remapUv(geo: THREE.BufferGeometry, u0: number, u1: number, v0: number, v1: number, mirror = false): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  // Pick the two largest extents as the projection plane.
  const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const axes = [0, 1, 2].sort((a, b) => ext[b] - ext[a]).slice(0, 2).sort();
  const [a, b] = axes;
  const min = [bb.min.x, bb.min.y, bb.min.z];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    let s = (p[a] - min[a]) / Math.max(1e-6, ext[a]);
    const t = (p[b] - min[b]) / Math.max(1e-6, ext[b]);
    if (mirror) s = 1 - s;
    uv[i * 2] = u0 + s * (u1 - u0);
    uv[i * 2 + 1] = v0 + t * (v1 - v0);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
