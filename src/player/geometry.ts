/** Small geometry helpers for the procedural flyer and canopy. */
import * as THREE from 'three';

/**
 * Lofts a sequence of rings (equal point counts) into a closed-around,
 * open-ended surface. UV u runs around the ring, v along the loft.
 */
export function loft(rings: THREE.Vector3[][], capStart = false, capEnd = false): THREE.BufferGeometry {
  const n = rings[0].length;
  const m = rings.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i <= n; i++) {
      const p = rings[j][i % n];
      positions.push(p.x, p.y, p.z);
      uvs.push(i / n, j / (m - 1));
    }
  }
  const row = n + 1;
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const cap = (ringIndex: number, flip: boolean) => {
    const centre = new THREE.Vector3();
    for (const p of rings[ringIndex]) centre.add(p);
    centre.divideScalar(n);
    const ci = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    uvs.push(0.5, ringIndex === 0 ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const a = ringIndex * row + i;
      const b = ringIndex * row + i + 1;
      if (flip) indices.push(ci, b, a);
      else indices.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(m - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Ellipse ring in the XY plane at depth z (points go counter-clockwise seen from +z). */
export function ellipseRing(cx: number, cy: number, z: number, rx: number, ry: number, n: number): THREE.Vector3[] {
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push(new THREE.Vector3(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z));
  }
  return ring;
}

/**
 * Airfoil-ish closed ring around a chord running from `le` to `te` (3D
 * points), with `up` as the thickness direction. Top skin is cambered,
 * bottom skin nearly flat, like an inflated ram-air panel.
 */
export function airfoilRing(le: THREE.Vector3, te: THREE.Vector3, up: THREE.Vector3, thickness: number, n = 12, bottomFactor = 0.25): THREE.Vector3[] {
  const ring: THREE.Vector3[] = [];
  const half = n / 2;
  for (let i = 0; i < n; i++) {
    const top = i < half;
    const v = top ? i / (half - 1) : 1 - (i - half) / (half - 1);
    const bump = Math.pow(Math.max(0, 4 * v * (1 - v)), 0.65);
    const t = top ? thickness * bump : -thickness * bottomFactor * bump;
    ring.push(new THREE.Vector3().lerpVectors(le, te, v).addScaledVector(up, t));
  }
  return ring;
}

/** Remap UVs into a rectangle of the texture by the existing uv range. */
export function scaleUv(geo: THREE.BufferGeometry, u0: number, u1: number, v0: number, v1: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
}
