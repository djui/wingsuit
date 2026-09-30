import * as THREE from 'three';

/**
 * Placeholder flyer: a flattened body with wing membranes. Replaced by the
 * textured procedural model in phase 4. Faces -z (forward), +y up.
 */
export function createFlyerModel(): THREE.Group {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xd8321e, roughness: 0.7, metalness: 0.05 });
  const wing = new THREE.MeshStandardMaterial({
    color: 0x1e64d8,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.0, 4, 8), suit);
  torso.rotation.x = Math.PI / 2;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), helmet);
  head.position.set(0, 0.04, -0.72);
  g.add(head);

  // Arm wings: triangles from shoulder to hand to hip.
  const armWing = new THREE.Shape();
  armWing.moveTo(0.15, -0.55);
  armWing.lineTo(0.95, -0.15);
  armWing.lineTo(0.95, 0.15);
  armWing.lineTo(0.15, 0.55);
  const armGeo = new THREE.ShapeGeometry(armWing);
  armGeo.rotateX(-Math.PI / 2);
  const rightArm = new THREE.Mesh(armGeo, wing);
  const leftArm = new THREE.Mesh(armGeo.clone().scale(-1, 1, 1), wing);
  g.add(rightArm, leftArm);

  // Leg wing
  const legWing = new THREE.Shape();
  legWing.moveTo(-0.17, 0.3);
  legWing.lineTo(0.17, 0.3);
  legWing.lineTo(0.42, 0.95);
  legWing.lineTo(-0.42, 0.95);
  const legGeo = new THREE.ShapeGeometry(legWing);
  legGeo.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(legGeo, wing));

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  return g;
}
