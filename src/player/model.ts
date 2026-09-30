import * as THREE from 'three';
import { airfoilRing, ellipseRing, loft, scaleUv } from './geometry';

export interface FlyerModel {
  group: THREE.Group;
  /** Blends the pose from prone flight (0) to hanging under canopy (1). */
  setCanopy(openness: number): void;
  /** Swap the suit texture. */
  setTexture(tex: THREE.Texture): void;
  /** Animate control surfaces: pitch/roll inputs bend the wings slightly. */
  setControls(pitch: number, roll: number, dive: number): void;
  /** 1 = standing upright on the exit, 0 = flying pose. */
  setStanding(f: number): void;
  /** Toggle inputs deflect the canopy's trailing edge. */
  setCanopyControls(left: number, right: number): void;
  /** Per-frame fabric animation: wings and canopy flutter with airspeed. */
  update(dt: number, airspeed: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Procedural wingsuit flyer: lofted body and limbs, inflated arm and leg
 * wings, helmet, container, and a seven-cell ram-air canopy. Faces -z
 * (forward), +y up, origin at the chest.
 */
export function createFlyerModel(): FlyerModel {
  const group = new THREE.Group();
  const pose = new THREE.Group();
  group.add(pose);

  const suit = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.22, metalness: 0.05, envMapIntensity: 1.2 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0c1118, roughness: 0.08, metalness: 0.7, envMapIntensity: 1.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.85 });
  const shadowed = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // ---- Torso: lofted ellipses from neck to crotch (z runs head -> feet).
  const torsoRings = [
    ellipseRing(0, 0.0, -0.44, 0.07, 0.07, 16),
    ellipseRing(0, 0.0, -0.36, 0.2, 0.1, 16),
    ellipseRing(0, 0.0, -0.3, 0.24, 0.115, 16),
    ellipseRing(0, 0.0, -0.12, 0.22, 0.12, 16),
    ellipseRing(0, -0.005, 0.1, 0.175, 0.105, 16),
    ellipseRing(0, 0.0, 0.3, 0.19, 0.11, 16),
    ellipseRing(0, 0.0, 0.43, 0.15, 0.09, 16),
  ];
  const torsoGeo = loft(torsoRings, true, true);
  scaleUv(torsoGeo, 0.3, 0.7, 0.3, 0.7);
  pose.add(shadowed(new THREE.Mesh(torsoGeo, suit)));

  // ---- Head, helmet, visor.
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 18), helmetMat));
  head.position.set(0, 0.055, -0.56);
  head.scale.set(1, 1.05, 1.18);
  pose.add(head);
  const visor = shadowed(
    new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 12, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.32, Math.PI * 0.34), visorMat),
  );
  visor.position.copy(head.position).add(V(0, -0.01, -0.012));
  visor.scale.copy(head.scale);
  pose.add(visor);

  // ---- Container on the back.
  const pack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.4, 2, 2, 2), dark));
  pack.position.set(0, 0.16, 0.06);
  pose.add(pack);

  /** Wing panels that fold (chord collapses) when not flying. */
  const wingMeshes: THREE.Mesh[] = [];
  const setWingFold = (fold: number) => {
    const s = 1 - 0.85 * THREE.MathUtils.clamp(fold, 0, 1);
    for (const m of wingMeshes) m.scale.set(1, s, s);
  };

  /** Fabric panels animated per frame (wings, canopy). */
  const fabrics: { geo: THREE.BufferGeometry; base: Float32Array; ringN: number; amp: number; phase: number }[] = [];

  // ---- Arms with arm wings. Local frame: +x along the arm (mirrored for the left).
  const armLen = 0.64;
  const armSweep = THREE.MathUtils.degToRad(22);
  const makeArm = (side: 1 | -1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.21, 0.015, -0.3);
    arm.rotation.y = -side * armSweep;
    const rings: THREE.Vector3[][] = [];
    const stations = [
      [0, 0.058, 0.05],
      [0.3, 0.05, 0.045],
      [0.34, 0.048, 0.043],
      [armLen, 0.035, 0.033],
    ];
    for (const [x, ry, rz] of stations) {
      const ring: THREE.Vector3[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ring.push(V(side * x, Math.sin(a) * ry, Math.cos(a) * rz));
      }
      rings.push(ring);
    }
    const armGeo = loft(rings, true, true);
    scaleUv(armGeo, 0.1, 0.3, 0.4, 0.6);
    arm.add(shadowed(new THREE.Mesh(armGeo, suit)));
    const hand = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), dark));
    hand.position.set(side * (armLen + 0.035), 0, 0);
    hand.scale.set(1.3, 0.6, 1);
    arm.add(hand);

    // Arm wing: airfoil rings across the chord at each spanwise station.
    const wingRings: THREE.Vector3[][] = [];
    const stationsN = 10;
    for (let s = 0; s <= stationsN; s++) {
      const u = s / stationsN;
      const x = side * (0.03 + u * (armLen - 0.02));
      const leZ = 0.03 + 0.01 * u;
      // Trailing edge: from the hip at the root to just behind the wrist.
      const teZ = 0.78 * Math.pow(1 - u, 0.8) + 0.08;
      const thickness = 0.06 * (1 - 0.6 * u) * Math.min(1, (teZ - leZ) / 0.4);
      wingRings.push(airfoilRing(V(x, -0.02, leZ), V(x, -0.03, teZ), V(0, 1, 0), thickness, 14));
    }
    const wingGeo = loft(wingRings, false, true);
    scaleUv(wingGeo, side === 1 ? 0.5 : 0.5, side === 1 ? 1.0 : 0.0, 0.0, 1.0);
    const wingMesh = shadowed(new THREE.Mesh(wingGeo, suit));
    arm.add(wingMesh);
    wingMeshes.push(wingMesh);
    fabrics.push({ geo: wingGeo, base: (wingGeo.getAttribute('position') as THREE.BufferAttribute).array.slice() as Float32Array, ringN: 15, amp: 0.014, phase: side });
    return arm;
  };
  const rightArm = makeArm(1);
  const leftArm = makeArm(-1);
  pose.add(rightArm, leftArm);

  // ---- Legs.
  const legLen = 0.82;
  const legSpread = THREE.MathUtils.degToRad(17);
  const thighLen = 0.42;
  const shinLen = legLen - thighLen;
  const makeLeg = (side: 1 | -1) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.09, -0.01, 0.42);
    leg.rotation.y = side * legSpread;
    const thighGeo = loft([ellipseRing(0, 0, 0, 0.085, 0.08, 12), ellipseRing(0, 0, thighLen * 0.85, 0.07, 0.066, 12), ellipseRing(0, 0, thighLen, 0.066, 0.063, 12)], true, true);
    scaleUv(thighGeo, 0.35, 0.65, 0.7, 0.85);
    leg.add(shadowed(new THREE.Mesh(thighGeo, suit)));
    const knee = new THREE.Group();
    knee.position.z = thighLen;
    leg.add(knee);
    const shinGeo = loft([ellipseRing(0, 0, 0, 0.064, 0.062, 12), ellipseRing(0, 0, shinLen * 0.5, 0.056, 0.055, 12), ellipseRing(0, 0, shinLen, 0.048, 0.05, 12)], true, true);
    scaleUv(shinGeo, 0.35, 0.65, 0.85, 1.0);
    knee.add(shadowed(new THREE.Mesh(shinGeo, suit)));
    const boot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.075, 0.24, 1, 1, 2), dark));
    boot.position.set(0, -0.01, shinLen + 0.1);
    knee.add(boot);
    return { leg, knee };
  };
  const right = makeLeg(1);
  const left = makeLeg(-1);
  const rightLeg = right.leg;
  const leftLeg = left.leg;
  const rightKnee = right.knee;
  const leftKnee = left.knee;
  pose.add(rightLeg, leftLeg);

  // ---- Leg wing between the legs: rings run chordwise (along z) at spanwise stations.
  const legWingRings: THREE.Vector3[][] = [];
  const ankleX = 0.09 + legLen * Math.sin(legSpread) + 0.02;
  const ankleZ = 0.42 + legLen * Math.cos(legSpread);
  for (let s = 0; s <= 12; s++) {
    const u = s / 12 - 0.5; // -0.5 .. 0.5
    const x = u * 2 * ankleX;
    const f = Math.abs(u) * 2; // 0 centre .. 1 at the ankles
    const leZ = 0.46 + f * (ankleZ - 0.5);
    const teZ = ankleZ + 0.02;
    const thickness = 0.05 * (1 - f) * Math.min(1, (teZ - leZ) / 0.4);
    legWingRings.push(airfoilRing(V(x, -0.02, leZ), V(x, -0.03, teZ), V(0, 1, 0), thickness, 14));
  }
  const legWingGeo = loft(legWingRings, true, true);
  scaleUv(legWingGeo, 0.2, 0.8, 0.2, 1.0);
  const legWingMesh = shadowed(new THREE.Mesh(legWingGeo, suit));
  pose.add(legWingMesh);
  wingMeshes.push(legWingMesh);
  fabrics.push({ geo: legWingGeo, base: (legWingGeo.getAttribute('position') as THREE.BufferAttribute).array.slice() as Float32Array, ringN: 15, amp: 0.012, phase: 2 });

  // ---- Canopy: seven-cell ram-air, arched, hung above the harness.
  const canopy = new THREE.Group();
  canopy.visible = false;
  group.add(canopy);
  const cells = 7;
  const chord = 2.9;
  const arcR = 5.4;
  const arcTotal = 1.25;
  const canopyTex = canopyTexture(cells);
  const canopyMat = new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  const perCell = 4;
  const canopyRings: THREE.Vector3[][] = [];
  const stationsTotal = cells * perCell;
  for (let s = 0; s <= stationsTotal; s++) {
    const u = s / stationsTotal;
    const ang = (u - 0.5) * arcTotal;
    const cellFrac = (s % perCell) / perCell;
    const bulge = s === 0 || s === stationsTotal ? 0 : 0.05 * Math.sin(Math.PI * cellFrac);
    const cx = Math.sin(ang) * arcR;
    const cy = Math.cos(ang) * arcR;
    const up = V(Math.sin(ang), Math.cos(ang), 0); // radial: outward from the arc centre
    // Nose-down pitch of the chord (~10°) so the airfoil sits along the flight path.
    const le = V(cx, cy, -chord * 0.5).addScaledVector(up, 0.05);
    const te = V(cx, cy, chord * 0.5).addScaledVector(up, -0.15);
    const t = 0.16 * chord * 0.5 + bulge;
    // Tip taper
    const tipTaper = 1 - 0.35 * Math.pow(Math.abs(u - 0.5) * 2, 4);
    canopyRings.push(airfoilRing(le, te, up, t * tipTaper, 16, 0.15));
  }
  const canopyGeo = loft(canopyRings, true, true);
  // UVs: u across the ring (top 0..0.5, bottom 0.5..1), v along the span.
  const uvAttr = canopyGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, uvAttr.getY(i), uvAttr.getX(i));
  const canopyMesh = shadowed(new THREE.Mesh(canopyGeo, canopyMat));
  canopy.add(canopyMesh);
  // Remember trailing-edge vertices for brake deflection.
  const basePositions = (canopyGeo.getAttribute('position') as THREE.BufferAttribute).array.slice() as Float32Array;
  const ringN = 17; // 16 + 1 wrap column per ring
  const teWeights: { index: number; side: number; w: number }[] = [];
  for (let s = 0; s <= stationsTotal; s++) {
    const u = s / stationsTotal;
    const side = u - 0.5; // negative = left
    for (let i = 0; i < ringN; i++) {
      // Around the ring, the trailing edge is at i ≈ 7..9 of 16.
      const around = (i % 16) / 16;
      const teCloseness = Math.max(0, 1 - Math.abs(around - 0.5) / 0.25);
      if (teCloseness > 0) teWeights.push({ index: s * ringN + i, side, w: teCloseness });
    }
  }
  // Stabilisers at the tips.
  for (const side of [-1, 1] as const) {
    const ang = side * arcTotal * 0.5;
    const cx = Math.sin(ang) * arcR;
    const cy = Math.cos(ang) * arcR;
    const shape = new THREE.Shape();
    shape.moveTo(-chord * 0.45, 0);
    shape.lineTo(chord * 0.4, 0);
    shape.lineTo(chord * 0.1, -0.7);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateY(Math.PI / 2);
    geo.rotateZ(-ang);
    const stab = new THREE.Mesh(geo, canopyMat);
    stab.position.set(cx, cy - 0.1, 0);
    canopy.add(stab);
  }
  // Suspension lines: A/B/C/D rows at five spanwise stations, cascading to the risers.
  const linePts: number[] = [];
  const riser = (side: number) => V(side * 0.22, 0.35, 0.05);
  for (const sp of [-0.85, -0.45, 0, 0.45, 0.85]) {
    const ang = sp * arcTotal * 0.5;
    const cx = Math.sin(ang) * arcR;
    const cy = Math.cos(ang) * arcR;
    for (const cf of [-0.42, -0.15, 0.15, 0.4]) {
      const r = riser(sp < 0 ? -1 : sp > 0 ? 1 : 0);
      linePts.push(r.x, r.y, r.z, cx, cy - 0.16, cf * chord);
    }
  }
  // Brake lines to the trailing edge corners.
  for (const sp of [-0.6, 0.6]) {
    const ang = sp * arcTotal * 0.5;
    linePts.push(sp * 0.28, 0.1, 0.1, Math.sin(ang) * arcR, Math.cos(ang) * arcR - 0.2, chord * 0.48);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  canopy.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.8 })));

  const proneQ = new THREE.Quaternion();
  // Rotate the prone model +90° about X: head (-z) goes up (+y), belly faces forward.
  const hangQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  // Sitting in the harness: hang pose plus a lean back.
  const sitQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.3, 0, 0));
  let openness = 0;
  let standing = 0;
  let brakeL = 0;
  let brakeR = 0;

  let fabricTime = 0;
  let lastCanopySpeed = 0;
  const rebuildCanopy = (speed: number) => {
    const pos = canopyGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const count = pos.count;
    const flutter = 0.035 * Math.min(1, speed / 9);
    for (let idx = 0; idx < count; idx++) {
      const k = 3 * idx;
      const station = Math.floor(idx / ringN);
      const around = (idx % ringN) / 16;
      const u = station / stationsTotal;
      const top = around < 0.5 ? 1 : 0.3;
      // Fabric ripple: spanwise + chordwise waves, stronger on the top skin and at the trailing edge.
      const te = Math.max(0, 1 - Math.abs(around - 0.5) / 0.2);
      const ripple =
        flutter * top * (0.5 * Math.sin(u * 22 + fabricTime * 9) * Math.sin(around * 6.3 + fabricTime * 5.5) + 0.35 * te * Math.sin(u * 40 + fabricTime * 16));
      const radial = Math.sqrt(basePositions[k] ** 2 + basePositions[k + 1] ** 2) || 1;
      const nx = basePositions[k] / radial;
      const ny = basePositions[k + 1] / radial;
      arr[k] = basePositions[k] + nx * ripple;
      arr[k + 1] = basePositions[k + 1] + ny * ripple;
      arr[k + 2] = basePositions[k + 2];
    }
    for (const { index, side, w } of teWeights) {
      const brake = side < 0 ? brakeL : side > 0 ? brakeR : (brakeL + brakeR) / 2;
      arr[3 * index + 1] -= 0.32 * brake * w;
    }
    pos.needsUpdate = true;
    canopyGeo.computeVertexNormals();
  };
  const applyBrakes = () => rebuildCanopy(lastCanopySpeed);

  return {
    group,
    setCanopy(f: number) {
      openness = THREE.MathUtils.clamp(f, 0, 1);
      canopy.visible = openness > 0.02;
      canopy.scale.set(0.12 + 0.88 * openness, 0.1 + 0.9 * openness, 0.3 + 0.7 * openness);
      if (standing > 0) return; // the standing pose owns the body until the jump
      const hang = THREE.MathUtils.smoothstep(openness, 0.3, 0.9);
      setWingFold(hang);
      // Harness sit: torso leans back ~20°, thighs swing forward, shins hang down.
      pose.quaternion.slerpQuaternions(proneQ, sitQ, hang);
      pose.position.y = -0.3 * openness;
      rightLeg.rotation.x = leftLeg.rotation.x = 1.15 * hang;
      rightKnee.rotation.x = leftKnee.rotation.x = -1.35 * hang;
      rightLeg.rotation.y = legSpread * (1 - 0.6 * hang);
      leftLeg.rotation.y = -legSpread * (1 - 0.6 * hang);
      // Hands up on the toggles: arms point head-ward (-z) with a little spread.
      const up = THREE.MathUtils.smoothstep(openness, 0.5, 1);
      rightArm.rotation.y = -armSweep * (1 - up) + up * (Math.PI / 2 - 0.35);
      leftArm.rotation.y = armSweep * (1 - up) - up * (Math.PI / 2 - 0.35);
      rightArm.rotation.z = up * 0.15;
      leftArm.rotation.z = -up * 0.15;
    },
    setStanding(f: number) {
      standing = THREE.MathUtils.clamp(f, 0, 1);
      setWingFold(standing);
      if (standing > 0) {
        pose.quaternion.slerpQuaternions(proneQ, hangQ, standing);
        pose.position.y = 0.95 * standing;
        // Arms down along the body: point them feet-ward (+z).
        rightArm.rotation.y = -armSweep * (1 - standing) - standing * (Math.PI / 2 - 0.25);
        leftArm.rotation.y = armSweep * (1 - standing) + standing * (Math.PI / 2 - 0.25);
        rightArm.rotation.z = leftArm.rotation.z = 0;
        rightLeg.rotation.y = legSpread * (1 - standing) + standing * 0.05;
        leftLeg.rotation.y = -legSpread * (1 - standing) - standing * 0.05;
        rightLeg.rotation.x = leftLeg.rotation.x = 0;
        rightKnee.rotation.x = leftKnee.rotation.x = 0;
      } else {
        pose.quaternion.copy(proneQ);
        pose.position.y = 0;
        rightArm.rotation.z = leftArm.rotation.z = 0;
        rightArm.rotation.y = -armSweep;
        leftArm.rotation.y = armSweep;
        rightLeg.rotation.y = legSpread;
        leftLeg.rotation.y = -legSpread;
        rightLeg.rotation.x = leftLeg.rotation.x = 0;
        rightKnee.rotation.x = leftKnee.rotation.x = 0;
      }
    },
    setTexture(tex: THREE.Texture) {
      suit.map = tex;
      suit.needsUpdate = true;
    },
    setControls(pitch: number, roll: number, dive: number) {
      if (openness > 0.5 || standing > 0) return;
      const sweep = armSweep + dive * 0.75;
      rightArm.rotation.y = -sweep;
      leftArm.rotation.y = sweep;
      rightArm.rotation.z = -roll * 0.22 - dive * 0.15;
      leftArm.rotation.z = -roll * 0.22 + dive * 0.15;
      rightLeg.rotation.x = leftLeg.rotation.x = pitch * 0.12;
    },
    setCanopyControls(left: number, right: number) {
      brakeL = THREE.MathUtils.clamp(left, 0, 1);
      brakeR = THREE.MathUtils.clamp(right, 0, 1);
    },
    update(dt: number, airspeed: number) {
      fabricTime += dt;
      if (canopy.visible) {
        lastCanopySpeed = airspeed;
        applyBrakes();
      }
      // Wingsuit fabric: high-frequency flutter growing with dynamic pressure, strongest at the trailing edges.
      const strength = Math.min(1, (airspeed * airspeed) / (55 * 55)) * (1 - openness);
      for (const f of fabrics) {
        const pos = f.geo.getAttribute('position') as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        if (strength < 0.01) {
          if (arr[1] !== f.base[1]) {
            arr.set(f.base);
            pos.needsUpdate = true;
          }
          continue;
        }
        const count = pos.count;
        for (let idx = 0; idx < count; idx++) {
          const k = 3 * idx;
          const station = Math.floor(idx / f.ringN);
          const around = (idx % f.ringN) / (f.ringN - 1);
          const te = Math.max(0, 1 - Math.abs(around - 0.5) / 0.35);
          const ripple = f.amp * strength * te * Math.sin(station * 1.7 + fabricTime * 31 + f.phase) * Math.sin(fabricTime * 7.3 + station);
          arr[k] = f.base[k];
          arr[k + 1] = f.base[k + 1] + ripple;
          arr[k + 2] = f.base[k + 2];
        }
        pos.needsUpdate = true;
      }
    },
  };
}

/** Cell colours with rib seams; u across the span, v around the chord. */
function canopyTexture(cells: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const colors = ['#ff9f2e', '#1f5fd6', '#f3f3f3'];
  const w = c.width / cells;
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = colors[i % 3];
    ctx.fillRect(i * w, 0, w + 1, c.height);
    // Bottom skin slightly darker (it faces down).
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(i * w, c.height / 2, w + 1, c.height / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(i * w - 2, 0, 4, c.height);
  }
  // Cross-port / seam lines across the chord.
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, c.height * 0.02, c.width, 3);
  ctx.fillRect(0, c.height * 0.48, c.width, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
