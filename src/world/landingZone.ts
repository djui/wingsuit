import * as THREE from 'three';

/** Landing target: bullseye rings, centre pole with flag, faint 500 m scoring ring. */
export function createLandingZone(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landing-zone';

  const ring = (inner: number, outer: number, color: number, opacity: number) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  g.add(ring(0, radius * 0.25, 0xff3b30, 0.85));
  g.add(ring(radius * 0.25, radius * 0.5, 0xffffff, 0.75));
  g.add(ring(radius * 0.5, radius * 0.75, 0xff3b30, 0.75));
  g.add(ring(radius * 0.75, radius, 0xffffff, 0.65));
  g.add(ring(500 - 4, 500, 0xffb454, 0.35));

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 14, 8),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
  );
  pole.position.y = 7;
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xffb454, side: THREE.DoubleSide }),
  );
  flag.position.set(2, 12.5, 0);
  g.add(flag);

  // Tall beacon so the target is visible from kilometres away.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 400, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  beacon.position.y = 200;
  g.add(beacon);

  // Lift the rings a little to avoid z-fighting with the terrain.
  g.children.forEach((c) => {
    if (c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry) c.position.y = 0.8;
  });
  return g;
}
