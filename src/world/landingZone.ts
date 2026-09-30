import * as THREE from 'three';

export interface LandingZoneMarker {
  group: THREE.Group;
  /** Rebuilds the rings draped over the terrain around the centre. */
  conform(cx: number, cz: number, heightAt: (x: number, z: number) => number | null): void;
}

/** Landing target: bullseye rings and a 500 m scoring ring draped on the terrain, pole with flag, beacon. */
export function createLandingZone(radius: number): LandingZoneMarker {
  const group = new THREE.Group();
  group.name = 'landing-zone';
  const rings = new THREE.Group();
  group.add(rings);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  pole.position.y = 7;
  pole.castShadow = true;
  group.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshBasicMaterial({ color: 0xffb454, side: THREE.DoubleSide }));
  flag.position.set(2, 12.5, 0);
  group.add(flag);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 400, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  beacon.position.y = 200;
  group.add(beacon);

  const bands: Array<{ inner: number; outer: number; color: number; opacity: number }> = [
    { inner: 0, outer: radius * 0.25, color: 0xff3b30, opacity: 0.85 },
    { inner: radius * 0.25, outer: radius * 0.5, color: 0xffffff, opacity: 0.75 },
    { inner: radius * 0.5, outer: radius * 0.75, color: 0xff3b30, opacity: 0.75 },
    { inner: radius * 0.75, outer: radius, color: 0xffffff, opacity: 0.65 },
    { inner: 496, outer: 500, color: 0xffb454, opacity: 0.4 },
  ];

  const conform = (cx: number, cz: number, heightAt: (x: number, z: number) => number | null) => {
    rings.clear();
    const centreH = heightAt(cx, cz) ?? 0;
    for (const band of bands) {
      const angular = band.outer > 100 ? 128 : 64;
      const radial = band.outer > 100 ? 1 : 3;
      const positions: number[] = [];
      const indices: number[] = [];
      for (let r = 0; r <= radial; r++) {
        const rad = band.inner + ((band.outer - band.inner) * r) / radial;
        for (let a = 0; a <= angular; a++) {
          const ang = (a / angular) * Math.PI * 2;
          const x = cx + Math.cos(ang) * rad;
          const z = cz + Math.sin(ang) * rad;
          const h = heightAt(x, z) ?? centreH;
          positions.push(x - cx, h - centreH + 0.6, z - cz);
        }
      }
      const row = angular + 1;
      for (let r = 0; r < radial; r++) {
        for (let a = 0; a < angular; a++) {
          const i0 = r * row + a;
          indices.push(i0, i0 + 1, i0 + row, i0 + 1, i0 + row + 1, i0 + row);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: band.color,
          transparent: true,
          opacity: band.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      rings.add(mesh);
    }
  };

  return { group, conform };
}
