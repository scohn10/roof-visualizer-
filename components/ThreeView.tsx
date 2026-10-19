"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  dormerCenters,
  dormerSlopes,
  gableDormerApex,
  distanceForHeight,
  roofHeightAt,
  shedTieIn,
  type House,
  type Proposal,
  type RoofStyle,
} from "@/lib/roof";

interface Props {
  house: House;
  proposal: Proposal;
}

const PALETTE = {
  wall: 0xe9e2d3,
  gable: 0xdcd3c1,
  roof: 0xc9592f,
  dormerFace: 0xf4ecdc,
  window: 0x2c3e57,
  old: 0x1d2733,
  limit: 0xff4d4d,
  ground: 0x8fa57d,
};

export default function ThreeView({ house, proposal }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    model: THREE.Group;
    framedFor?: string;
  } | null>(null);

  // One-time renderer setup.
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x667755, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(30, 60, 40);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground, transparent: true, opacity: 0.35 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    const model = new THREE.Group();
    scene.add(model);
    sceneRef.current = { scene, camera, controls, model };

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      disposeGroup(model);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Rebuild the house whenever inputs change.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    disposeGroup(s.model);
    s.model.clear();
    buildModel(s.model, house, proposal);

    // Re-frame the camera only when the footprint changes, so sliders don't jump the view.
    const key = `${house.span}|${house.length}|${house.eaveHeight}`;
    if (s.framedFor !== key) {
      const h = Math.max(house.eaveHeight + proposal.rise, house.heightLimit);
      const radius = 0.5 * Math.hypot(house.length, house.span, h);
      const vfov = (s.camera.fov * Math.PI) / 180;
      // Portrait screens are narrower than they are tall, so back off further.
      const dist = (radius / Math.sin(vfov / 2)) * Math.max(1, 1 / s.camera.aspect) * 0.9;
      const dir = new THREE.Vector3(0.95, 0.6, 1.35).normalize();
      s.controls.target.set(0, h * 0.5, 0);
      s.camera.position.copy(dir.multiplyScalar(dist).add(s.controls.target));
      s.controls.update();
      s.framedFor = key;
    }
  }, [house, proposal]);

  return <div className="three" ref={mountRef} aria-label="3D model of the house with the proposed roof" />;
}

// ---------------------------------------------------------------------------

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

const mat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra });

function mesh(tris: number[][], material: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** Triangles for a roof. Returns [slopes, gableEnds]. x = length, z = span, y = up. */
function roofTris(style: RoofStyle, span: number, length: number, eave: number, rise: number) {
  const hx = length / 2;
  const hz = span / 2;
  const top = eave + rise;
  const inset = style === "hip" ? Math.min(hz, hx) : 0;
  const A = [-hx + inset, top, 0];
  const B = [hx - inset, top, 0];
  const P1 = [-hx, eave, hz];
  const P2 = [hx, eave, hz];
  const P3 = [hx, eave, -hz];
  const P4 = [-hx, eave, -hz];
  const slopes = [P1, P2, B, P1, B, A, P3, P4, A, P3, A, B];
  const ends = [P4, P1, A, P2, P3, B];
  return style === "hip" ? { slopes: [...slopes, ...ends], ends: [] } : { slopes, ends };
}

function buildModel(group: THREE.Group, house: House, p: Proposal) {
  const { span, length, eaveHeight: He } = house;
  const R = p.rise;

  // Walls
  const walls = new THREE.Mesh(new THREE.BoxGeometry(length, He, span), mat(PALETTE.wall));
  walls.position.y = He / 2;
  group.add(walls);
  addWindows(group, house);

  // Proposed roof
  const t = roofTris(p.style, span, length, He, R);
  group.add(mesh(t.slopes, mat(PALETTE.roof)));
  if (t.ends.length) group.add(mesh(t.ends, mat(PALETTE.gable)));

  // Dormers (front slope, mirrored to back if requested)
  const d = p.dormers;
  if (d.count > 0 && d.width > 0) {
    const front = new THREE.Group();
    for (const c of dormerCenters(d, length, p.style, span)) {
      front.add(buildDormer(c - length / 2, house, p));
    }
    group.add(front);
    if (dormerSlopes(d) === 2) {
      const back = front.clone();
      back.scale.z = -1;
      group.add(back);
    }
  }

  // Existing roof as a dashed wireframe
  const old = roofTris("gable", span, length, He, house.currentRise);
  const oldGeom = new THREE.BufferGeometry();
  oldGeom.setAttribute("position", new THREE.Float32BufferAttribute([...old.slopes, ...old.ends].flat(), 3));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(oldGeom),
    new THREE.LineDashedMaterial({ color: PALETTE.old, dashSize: 0.8, gapSize: 0.5 }),
  );
  edges.computeLineDistances();
  oldGeom.dispose();
  group.add(edges);

  // Height limit plane
  const limitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(length + 16, span + 16),
    new THREE.MeshBasicMaterial({
      color: PALETTE.limit,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  limitPlane.rotation.x = -Math.PI / 2;
  limitPlane.position.y = house.heightLimit;
  group.add(limitPlane);
  const limitEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(limitPlane.geometry),
    new THREE.LineBasicMaterial({ color: PALETTE.limit, transparent: true, opacity: 0.7 }),
  );
  limitEdge.rotation.copy(limitPlane.rotation);
  limitEdge.position.copy(limitPlane.position);
  group.add(limitEdge);
}

function buildDormer(cx: number, house: House, p: Proposal): THREE.Group {
  const g = new THREE.Group();
  const { span, eaveHeight: He } = house;
  const d = p.dormers;
  const R = p.rise;
  const zf = span / 2 - d.setback; // face position
  const base = roofHeightAt(d.setback, R, span);
  const face = Math.max(base, d.faceHeight);
  const w = d.width;

  if (d.type === "shed") {
    const tie = Math.min(R, shedTieIn(R, d));
    const zt = span / 2 - Math.min(span / 2, distanceForHeight(tie, R, span));
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    // Profile corners: bottom of face (on main roof), top of face, tie-in (on main roof).
    const fb = (x: number) => [x, He + base, zf];
    const ft = (x: number) => [x, He + face, zf];
    const ti = (x: number) => [x, He + tie, zt];
    const walls = [
      // front wall
      fb(x0), fb(x1), ft(x1),
      fb(x0), ft(x1), ft(x0),
      // cheeks
      fb(x0), ft(x0), ti(x0),
      fb(x1), ft(x1), ti(x1),
    ];
    const ov = 0.3; // eave overhang on the dormer roof
    const roof = [
      [x0 - ov, He + face, zf + ov], [x1 + ov, He + face, zf + ov], ti(x1 + ov),
      [x0 - ov, He + face, zf + ov], ti(x1 + ov), ti(x0 - ov),
    ];
    g.add(mesh(walls, mat(PALETTE.dormerFace)));
    g.add(mesh(roof, mat(PALETTE.roof)));
  } else {
    const apex = Math.min(R, gableDormerApex(d));
    const depth = Math.max(0.5, Math.min(span / 2, distanceForHeight(apex, R, span)) - d.setback);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, He + base);
    shape.lineTo(w / 2, He + base);
    shape.lineTo(w / 2, He + face);
    shape.lineTo(0, He + apex);
    shape.lineTo(-w / 2, He + face);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const m = new THREE.Mesh(geom, [mat(PALETTE.dormerFace), mat(PALETTE.dormerFace)]);
    m.position.set(cx, 0, zf - depth);
    g.add(m);
    // Little roof planes on top
    const ov = 0.3;
    const roofG = [
      [cx - w / 2 - ov, He + face, zf + ov],
      [cx, He + apex, zf + ov],
      [cx, He + apex, zf - depth],
      [cx - w / 2 - ov, He + face, zf + ov],
      [cx, He + apex, zf - depth],
      [cx - w / 2 - ov, He + face, zf - depth],
      [cx + w / 2 + ov, He + face, zf + ov],
      [cx, He + apex, zf + ov],
      [cx, He + apex, zf - depth],
      [cx + w / 2 + ov, He + face, zf + ov],
      [cx, He + apex, zf - depth],
      [cx + w / 2 + ov, He + face, zf - depth],
    ];
    g.add(mesh(roofG, mat(PALETTE.roof)));
  }

  // Window on the face
  const winW = Math.min(w * 0.55, 6);
  const winH = Math.max(0.5, (face - base) * 0.55);
  if (face - base > 1) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), mat(PALETTE.window));
    win.position.set(cx, He + base + (face - base) * 0.55, zf + 0.03);
    g.add(win);
  }
  return g;
}

function addWindows(group: THREE.Group, house: House) {
  const { span, length, eaveHeight: He } = house;
  const floors = He > 12 ? 2 : 1;
  const fh = He / floors;
  const material = mat(PALETTE.window);
  const n = Math.max(1, Math.round(length / 9));
  const nSide = Math.max(1, Math.round(span / 10));
  const wh = Math.min(4.5, fh * 0.5);
  for (let f = 0; f < floors; f++) {
    const y = f * fh + fh * 0.3 + wh / 2;
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + (length / n) * (i + 0.5);
      for (const z of [span / 2 + 0.03, -span / 2 - 0.03]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3, wh), material);
        m.position.set(x, y, z);
        group.add(m);
      }
    }
    for (let i = 0; i < nSide; i++) {
      const z = -span / 2 + (span / nSide) * (i + 0.5);
      for (const x of [length / 2 + 0.03, -length / 2 - 0.03]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3, wh), material);
        m.rotation.y = Math.PI / 2;
        m.position.set(x, y, z);
        group.add(m);
      }
    }
  }
}
