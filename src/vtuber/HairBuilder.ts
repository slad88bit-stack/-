import * as THREE from 'three';
import type { CharacterCustomization, CharacterId, HairBangsId, HairStyleId } from '../types/vtuber';

export interface HairHandles {
  root: THREE.Group;
  applyCustomization: (c: CharacterCustomization, characterId: CharacterId) => void;
  update: (time: number, isTalking: boolean, headVelYaw: number, headVelPitch: number) => void;
}

interface SwayNode {
  obj: THREE.Object3D;
  baseRotX: number;
  baseRotY: number;
  baseRotZ: number;
  ampYaw: number;
  ampPitch: number;
  idleAmp: number;
  phase: number;
}

interface LengthNode {
  obj: THREE.Object3D;
  axis: 'y' | 'z' | 'all';
  baseScale: THREE.Vector3;
}

/**
 * Builds a sleek, sculpted, tapered 3D hair strand mesh along a 3D Catmull-Rom curve.
 * Looks like a genuine stylized Roblox / anime / chibi 3D hair lock!
 */
function createTaperedStrandGeometry(
  points: THREE.Vector3[],
  radiusStart: number,
  radiusMid: number,
  radiusTip: number,
  tubularSegments = 14,
  radialSegments = 8,
  flattenZ = 0.72,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    // Smoothly interpolate radius: root -> lush mid-body -> tapered tip
    let r: number;
    if (t < 0.35) {
      const k = t / 0.35;
      r = radiusStart + (radiusMid - radiusStart) * Math.sin(k * Math.PI * 0.5);
    } else {
      const k = (t - 0.35) / 0.65;
      r = radiusMid + (radiusTip - radiusMid) * Math.pow(k, 1.35);
    }
    // Pin closed tip cleanly
    if (i === tubularSegments) r = Math.max(0.002, radiusTip);

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(v);
      const sin = Math.sin(v) * flattenZ;
      const vx = pt.x + r * (cos * N.x + sin * B.x);
      const vy = pt.y + r * (cos * N.y + sin * B.y);
      const vz = pt.z + r * (cos * N.z + sin * B.z);
      positions.push(vx, vy, vz);
      uvs.push(j / radialSegments, t);
    }
  }

  const ringSize = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringSize + j;
      const b = (i + 1) * ringSize + j;
      const c = (i + 1) * ringSize + (j + 1);
      const d = i * ringSize + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Rounded chibi scalp cap hugging Baby_Head (center y=0.42, rx=0.469, ry=0.429, rz=0.399).
 * Slightly thicker (+0.022) so zero Z-fighting ever happens on any character!
 */
function createHairCapMesh(mat: THREE.Material, backCoverage = true): THREE.Group {
  const capGroup = new THREE.Group();

  // Top dome covering crown + temples
  const topDome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.54),
    mat,
  );
  topDome.scale.set(0.494, 0.452, 0.424);
  topDome.position.set(0, 0.435, -0.008);
  topDome.castShadow = true;
  capGroup.add(topDome);

  if (backCoverage) {
    // Back shell hugging the back of the head down toward the nape
    const backShell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16, Math.PI * 0.62, Math.PI * 1.76, Math.PI * 0.25, Math.PI * 0.56),
      mat,
    );
    backShell.scale.set(0.496, 0.45, 0.428);
    backShell.position.set(0, 0.415, -0.015);
    backShell.castShadow = true;
    capGroup.add(backShell);
  }

  return capGroup;
}

export function buildHairSystem(): HairHandles {
  const root = new THREE.Group();
  root.name = 'VTuber_HairRoot';

  // Volume pivot sits at the center of Baby_Head so scaling hairVolume puffs uniformly outward!
  const volumePivot = new THREE.Group();
  volumePivot.position.set(0, 0.44, 0);
  root.add(volumePivot);

  const hairContent = new THREE.Group();
  hairContent.position.set(0, -0.44, 0);
  volumePivot.add(hairContent);

  // Shared PBR hair materials
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x5b341e,
    roughness: 0.48,
    metalness: 0.06,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0x73452a,
    roughness: 0.44,
    metalness: 0.08,
  });
  const tieMat = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    roughness: 0.32,
    metalness: 0.14,
  });

  const swayNodes: SwayNode[] = [];
  const lengthNodes: LengthNode[] = [];
  const capTopGroups: THREE.Object3D[] = [];

  const registerSway = (
    obj: THREE.Object3D,
    ampYaw: number,
    ampPitch: number,
    idleAmp: number,
    phase: number,
  ) => {
    swayNodes.push({
      obj,
      baseRotX: obj.rotation.x,
      baseRotY: obj.rotation.y,
      baseRotZ: obj.rotation.z,
      ampYaw,
      ampPitch,
      idleAmp,
      phase,
    });
  };

  const registerLength = (obj: THREE.Object3D, axis: 'y' | 'z' | 'all' = 'y') => {
    lengthNodes.push({
      obj,
      axis,
      baseScale: obj.scale.clone(),
    });
  };

  const makeStrand = (
    pts: Array<[number, number, number]>,
    r0: number,
    r1: number,
    r2: number,
    mat: THREE.Material,
    flatten = 0.72,
  ) => {
    const mesh = new THREE.Mesh(
      createTaperedStrandGeometry(
        pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        r0,
        r1,
        r2,
        12,
        8,
        flatten,
      ),
      mat,
    );
    mesh.castShadow = true;
    return mesh;
  };

  // =========================================================================
  // 1. HAIRSTYLE GROUPS (9 Distinct 3D Sculpted Styles)
  // =========================================================================
  const styleGroups = new Map<HairStyleId, THREE.Group>();

  // --- STYLE: TUFT (Cute baby curl + tiny side wisps) ---
  {
    const g = new THREE.Group();
    const topPivot = new THREE.Group();
    topPivot.position.set(0, 0.84, 0.04);

    const curlMain = makeStrand(
      [
        [0, -0.02, 0],
        [0.03, 0.12, 0.05],
        [0.12, 0.21, 0.10],
        [0.21, 0.16, 0.14],
        [0.17, 0.09, 0.12],
      ],
      0.068,
      0.072,
      0.012,
      baseMat,
      0.85,
    );
    const curlMini = makeStrand(
      [
        [-0.03, -0.02, -0.01],
        [-0.09, 0.09, 0.03],
        [-0.17, 0.13, 0.06],
      ],
      0.048,
      0.052,
      0.01,
      tipMat,
      0.85,
    );
    const curlBack = makeStrand(
      [
        [0.01, -0.02, -0.04],
        [0.04, 0.08, -0.10],
        [0.08, 0.12, -0.17],
      ],
      0.045,
      0.048,
      0.01,
      baseMat,
      0.85,
    );
    topPivot.add(curlMain, curlMini, curlBack);
    registerSway(topPivot, 0.22, 0.18, 0.05, 0.4);
    registerLength(topPivot, 'all');
    capTopGroups.push(topPivot);
    g.add(topPivot);

    // Subtle tiny side temple tufts
    for (const side of [-1, 1]) {
      const sideTuft = makeStrand(
        [
          [side * 0.44, 0.56, 0.10],
          [side * 0.49, 0.46, 0.12],
          [side * 0.47, 0.36, 0.10],
        ],
        0.04,
        0.045,
        0.008,
        tipMat,
      );
      g.add(sideTuft);
    }

    styleGroups.set('tuft', g);
  }

  // --- STYLE: SPIKY (Anime / Roblox Hero Spikes) ---
  {
    const g = new THREE.Group();
    const cap = createHairCapMesh(baseMat, true);
    capTopGroups.push(cap);
    g.add(cap);

    const spikesPivot = new THREE.Group();
    spikesPivot.position.set(0, 0.72, 0);

    const spikeDefs: Array<{
      pts: Array<[number, number, number]>;
      r: number;
      useTip: boolean;
    }> = [
      // Crown tall hero spikes
      { pts: [[0, 0.08, 0.02], [0.02, 0.24, 0.05], [0.05, 0.39, 0.02]], r: 0.095, useTip: true },
      { pts: [[-0.14, 0.06, 0.06], [-0.26, 0.22, 0.10], [-0.36, 0.32, 0.08]], r: 0.088, useTip: false },
      { pts: [[0.14, 0.06, 0.06], [0.27, 0.22, 0.10], [0.38, 0.31, 0.08]], r: 0.088, useTip: true },
      { pts: [[-0.26, 0.0, -0.05], [-0.42, 0.12, -0.08], [-0.54, 0.18, -0.10]], r: 0.082, useTip: false },
      { pts: [[0.26, 0.0, -0.05], [0.42, 0.12, -0.08], [0.54, 0.18, -0.10]], r: 0.082, useTip: false },
      // Back & upper rear spikes
      { pts: [[0, 0.05, -0.14], [0.0, 0.18, -0.32], [0.0, 0.24, -0.47]], r: 0.092, useTip: true },
      { pts: [[-0.18, 0.02, -0.18], [-0.30, 0.10, -0.35], [-0.39, 0.12, -0.49]], r: 0.08, useTip: false },
      { pts: [[0.18, 0.02, -0.18], [0.30, 0.10, -0.35], [0.39, 0.12, -0.49]], r: 0.08, useTip: false },
      // Lower side flares
      { pts: [[-0.43, -0.16, -0.04], [-0.54, -0.22, -0.08], [-0.59, -0.31, -0.10]], r: 0.072, useTip: true },
      { pts: [[0.43, -0.16, -0.04], [0.54, -0.22, -0.08], [0.59, -0.31, -0.10]], r: 0.072, useTip: true },
      // Back nape spikes
      { pts: [[-0.22, -0.22, -0.34], [-0.28, -0.34, -0.44], [-0.30, -0.46, -0.48]], r: 0.072, useTip: false },
      { pts: [[0.0, -0.24, -0.38], [0.0, -0.38, -0.47], [0.0, -0.50, -0.50]], r: 0.078, useTip: true },
      { pts: [[0.22, -0.22, -0.34], [0.28, -0.34, -0.44], [0.30, -0.46, -0.48]], r: 0.072, useTip: false },
    ];

    for (const s of spikeDefs) {
      spikesPivot.add(makeStrand(s.pts, s.r * 0.9, s.r, 0.01, s.useTip ? tipMat : baseMat, 0.78));
    }

    registerSway(spikesPivot, 0.08, 0.06, 0.015, 0.9);
    registerLength(spikesPivot, 'all');
    capTopGroups.push(spikesPivot);
    g.add(spikesPivot);

    styleGroups.set('spiky', g);
  }

  // --- STYLE: MESSY / FLUFFY (Trendy Roblox Fluffy Hair) ---
  {
    const g = new THREE.Group();
    const cap = createHairCapMesh(baseMat, true);
    capTopGroups.push(cap);
    g.add(cap);

    const puffRing = new THREE.Group();
    const puffs: Array<[number, number, number, number, number, number, boolean]> = [
      // Top fluffy clouds
      [0, 0.87, 0.04, 0.24, 0.16, 0.22, false],
      [-0.22, 0.83, 0.08, 0.21, 0.15, 0.20, true],
      [0.22, 0.83, 0.08, 0.21, 0.15, 0.20, false],
      [-0.15, 0.84, -0.18, 0.22, 0.16, 0.22, false],
      [0.15, 0.84, -0.18, 0.22, 0.16, 0.22, true],
      [0, 0.78, -0.32, 0.25, 0.18, 0.20, false],
      // Fluffy temple curls
      [-0.44, 0.66, 0.06, 0.16, 0.17, 0.18, false],
      [0.44, 0.66, 0.06, 0.16, 0.17, 0.18, true],
      [-0.46, 0.48, -0.02, 0.14, 0.18, 0.17, true],
      [0.46, 0.48, -0.02, 0.14, 0.18, 0.17, false],
    ];
    const puffGeo = new THREE.SphereGeometry(1, 16, 12);
    for (const [x, y, z, sx, sy, sz, useTip] of puffs) {
      const m = new THREE.Mesh(puffGeo, useTip ? tipMat : baseMat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      puffRing.add(m);
    }
    capTopGroups.push(puffRing);
    g.add(puffRing);

    // Messy layered hanging strands on sides & back (affected by length + sway!)
    const sideStrandsGroup = new THREE.Group();
    sideStrandsGroup.position.set(0, 0.62, 0);
    for (const side of [-1, 1]) {
      const s1 = makeStrand(
        [
          [side * 0.44, 0.08, 0.12],
          [side * 0.52, -0.08, 0.14],
          [side * 0.48, -0.28, 0.12],
        ],
        0.072,
        0.082,
        0.012,
        tipMat,
      );
      const s2 = makeStrand(
        [
          [side * 0.45, 0.05, -0.08],
          [side * 0.54, -0.12, -0.12],
          [side * 0.48, -0.32, -0.16],
        ],
        0.075,
        0.085,
        0.012,
        baseMat,
      );
      sideStrandsGroup.add(s1, s2);
    }
    for (let i = -2; i <= 2; i++) {
      const bx = i * 0.16;
      const bz = -0.38 + Math.abs(i) * 0.04;
      const bStrand = makeStrand(
        [
          [bx, 0.02, bz],
          [bx * 1.12, -0.18, bz - 0.07],
          [bx * 1.05, -0.38, bz - 0.05],
        ],
        0.08,
        0.09,
        0.014,
        i % 2 === 0 ? baseMat : tipMat,
      );
      sideStrandsGroup.add(bStrand);
    }
    registerLength(sideStrandsGroup, 'y');
    registerSway(sideStrandsGroup, 0.09, 0.07, 0.02, 1.3);
    g.add(sideStrandsGroup);

    styleGroups.set('messy', g);
  }

  // --- STYLE: BOB (Sleek Cheek-Framing Bob Cut) ---
  {
    const g = new THREE.Group();
    const cap = createHairCapMesh(baseMat, true);
    capTopGroups.push(cap);
    g.add(cap);

    // Smooth curved side curtains framing cheeks
    for (const side of [-1, 1]) {
      const sidePivot = new THREE.Group();
      sidePivot.position.set(side * 0.45, 0.62, 0.02);

      const frontCurtain = makeStrand(
        [
          [0, 0.05, 0.14],
          [side * 0.07, -0.16, 0.16],
          [side * 0.04, -0.40, 0.15],
          [-side * 0.04, -0.56, 0.14],
        ],
        0.085,
        0.105,
        0.024,
        baseMat,
        0.62,
      );
      const midCurtain = makeStrand(
        [
          [0, 0.04, -0.02],
          [side * 0.08, -0.18, -0.02],
          [side * 0.05, -0.44, 0.0],
          [-side * 0.02, -0.58, 0.02],
        ],
        0.095,
        0.115,
        0.03,
        tipMat,
        0.65,
      );
      const rearCurtain = makeStrand(
        [
          [-side * 0.04, 0.02, -0.18],
          [side * 0.03, -0.20, -0.20],
          [0, -0.45, -0.18],
          [-side * 0.05, -0.58, -0.14],
        ],
        0.095,
        0.112,
        0.032,
        baseMat,
        0.68,
      );

      sidePivot.add(frontCurtain, midCurtain, rearCurtain);
      registerLength(sidePivot, 'y');
      registerSway(sidePivot, 0.14, 0.08, 0.025, side > 0 ? 0.5 : 2.1);
      g.add(sidePivot);
    }

    // Back bob curtain
    const backPivot = new THREE.Group();
    backPivot.position.set(0, 0.58, -0.37);
    for (let i = -2; i <= 2; i++) {
      const bx = i * 0.145;
      const bz = Math.abs(i) * 0.035;
      const strand = makeStrand(
        [
          [bx, 0.05, bz],
          [bx * 1.08, -0.20, bz - 0.06],
          [bx * 1.02, -0.45, bz - 0.04],
          [bx * 0.94, -0.56, bz + 0.02],
        ],
        0.095,
        0.112,
        0.032,
        Math.abs(i) === 1 ? tipMat : baseMat,
        0.62,
      );
      backPivot.add(strand);
    }
    registerLength(backPivot, 'y');
    registerSway(backPivot, 0.10, 0.12, 0.02, 1.4);
    g.add(backPivot);

    styleGroups.set('bob', g);
  }

  // --- STYLE: PIGTAILS (Two Bouncy Twin-Tails with Hair Ties!) ---
  {
    const g = new THREE.Group();
    const cap = createHairCapMesh(baseMat, true);
    capTopGroups.push(cap);
    g.add(cap);

    for (const side of [-1, 1]) {
      const tailPivot = new THREE.Group();
      tailPivot.position.set(side * 0.47, 0.64, -0.06);

      // Cute hair-tie ring
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 12, 24), tieMat);
      tie.rotation.y = Math.PI / 2;
      tie.rotation.x = side * 0.25;
      tie.position.set(side * 0.03, 0.01, 0);
      tailPivot.add(tie);

      // Main twin-tail volume + accent strand
      const mainTail = makeStrand(
        [
          [side * 0.02, 0.01, 0],
          [side * 0.17, 0.05, -0.03],
          [side * 0.27, -0.14, -0.05],
          [side * 0.24, -0.42, -0.04],
          [side * 0.30, -0.64, -0.01],
        ],
        0.075,
        0.135,
        0.022,
        baseMat,
        0.88,
      );
      const tipTail = makeStrand(
        [
          [side * 0.03, 0.0, 0.03],
          [side * 0.19, 0.01, 0.05],
          [side * 0.31, -0.20, 0.04],
          [side * 0.27, -0.50, 0.05],
          [side * 0.34, -0.68, 0.06],
        ],
        0.052,
        0.088,
        0.015,
        tipMat,
        0.85,
      );
      tailPivot.add(mainTail, tipTail);

      registerLength(tailPivot, 'y');
      registerSway(tailPivot, 0.28, 0.22, 0.06, side > 0 ? 0.3 : 2.4);
      g.add(tailPivot);
    }

    styleGroups.set('pigtails', g);
  }

  // --- STYLE: PONYTAIL (High Swinging Back Ponytail!) ---
  {
    const g = new THREE.Group();
    const cap = createHairCapMesh(baseMat, true);
    capTopGroups.push(cap);
    g.add(cap);

    const ponyPivot = new THREE.Group();
    ponyPivot.position.set(0, 0.68, -0.39);

    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.03, 12, 24), tieMat);
    tie.rotation.x = Math.PI / 2 - 0.35;
    tie.position.set(0, 0.02, -0.02);
    ponyPivot.add(tie);

    const mainPony = makeStrand(
      [
        [0, 0.02, -0.02],
        [0, 0.12, -0.17],
        [0, -0.06, -0.32],
        [0, -0.38, -0.36],
        [0, -0.68, -0.28],
      ],
      0.088,
      0.16,
      0.025,
      baseMat,
      0.86,
    );
    const leftPony = makeStrand(
      [
        [-0.04, 0.02, -0.02],
        [-0.10, 0.08, -0.18],
        [-0.14, -0.12, -0.30],
        [-0.11, -0.44, -0.32],
        [-0.15, -0.66, -0.24],
      ],
      0.058,
      0.095,
      0.016,
      tipMat,
      0.84,
    );
    const rightPony = makeStrand(
      [
        [0.04, 0.02, -0.02],
        [0.10, 0.08, -0.18],
        [0.14, -0.12, -0.30],
        [0.11, -0.44, -0.32],
        [0.15, -0.66, -0.24],
      ],
      0.058,
      0.095,
      0.016,
      tipMat,
      0.84,
    );
    ponyPivot.add(mainPony, leftPony, rightPony);

    registerLength(ponyPivot, 'y');
    registerSway(ponyPivot, 0.32, 0.24, 0.055, 1.1);
    g.add(ponyPivot);

    styleGroups.set('ponytail', g);
  }

  // --- STYLE: CURLY / AFRO (Lush Curly Puff Cloud) ---
  {
    const g = new THREE.Group();
    const cap = createHairCapMesh(baseMat, true);
    capTopGroups.push(cap);
    g.add(cap);

    const curlsGroup = new THREE.Group();
    const curlGeo = new THREE.SphereGeometry(1, 14, 12);

    // Deterministic ring of soft curls wrapping crown, sides, and back (keeping face clear!)
    const ringLayers: Array<{ y: number; rX: number; rZ: number; count: number; size: number; angleStart: number; angleEnd: number }> = [
      { y: 0.90, rX: 0.26, rZ: 0.22, count: 8, size: 0.165, angleStart: 0, angleEnd: Math.PI * 2 },
      { y: 0.80, rX: 0.42, rZ: 0.35, count: 13, size: 0.165, angleStart: 0, angleEnd: Math.PI * 2 },
      { y: 0.62, rX: 0.50, rZ: 0.42, count: 12, size: 0.155, angleStart: Math.PI * 0.26, angleEnd: Math.PI * 1.74 },
      { y: 0.44, rX: 0.50, rZ: 0.43, count: 10, size: 0.145, angleStart: Math.PI * 0.38, angleEnd: Math.PI * 1.62 },
      { y: 0.28, rX: 0.46, rZ: 0.40, count: 8, size: 0.135, angleStart: Math.PI * 0.48, angleEnd: Math.PI * 1.52 },
    ];

    // Center crown curl
    const crownCurl = new THREE.Mesh(curlGeo, tipMat);
    crownCurl.position.set(0, 0.96, -0.02);
    crownCurl.scale.set(0.20, 0.16, 0.19);
    crownCurl.castShadow = true;
    curlsGroup.add(crownCurl);

    let idx = 0;
    for (const layer of ringLayers) {
      for (let i = 0; i < layer.count; i++) {
        const frac = layer.angleEnd - layer.angleStart >= Math.PI * 1.99
          ? i / layer.count
          : i / Math.max(1, layer.count - 1);
        const a = layer.angleStart + frac * (layer.angleEnd - layer.angleStart);
        // a=0 is +Z (front face), a=PI is -Z (back)
        const cx = Math.sin(a) * layer.rX;
        const cz = Math.cos(a) * layer.rZ;
        const jitter = ((idx * 37) % 11) / 11 - 0.5;
        const r = layer.size * (0.92 + jitter * 0.22);
        const m = new THREE.Mesh(curlGeo, idx % 3 === 0 ? tipMat : baseMat);
        m.position.set(cx, layer.y + jitter * 0.03, cz);
        m.scale.set(r, r * 0.94, r);
        m.castShadow = true;
        curlsGroup.add(m);
        idx++;
      }
    }

    registerSway(curlsGroup, 0.05, 0.04, 0.012, 0.7);
    registerLength(curlsGroup, 'all');
    capTopGroups.push(curlsGroup);
    g.add(curlsGroup);

    styleGroups.set('curly', g);
  }

  // --- STYLE: MOHAWK (Punk Crest Fin from Forehead to Nape) ---
  {
    const g = new THREE.Group();
    const crestPivot = new THREE.Group();
    crestPivot.position.set(0, 0.68, 0);

    const finAngles = [-0.88, -0.58, -0.28, 0.0, 0.28, 0.58, 0.88, 1.18, 1.48];
    finAngles.forEach((theta, idx) => {
      // theta=0 is straight up (+Y), negative tilts forward (+Z), positive tilts back (-Z)
      const dirY = Math.cos(theta);
      const dirZ = -Math.sin(theta);
      const baseR = 0.42;
      const h = 0.30 - Math.abs(idx - 3) * 0.016;
      const startY = dirY * baseR * 0.88 - 0.22;
      const startZ = dirZ * baseR * 0.92;
      const midY = startY + dirY * h * 0.55;
      const midZ = startZ + dirZ * h * 0.55;
      const tipY = startY + dirY * h;
      const tipZ = startZ + dirZ * h - 0.04;

      const spike = makeStrand(
        [
          [0, startY, startZ],
          [0, midY, midZ],
          [0, tipY, tipZ],
        ],
        0.072,
        0.088,
        0.01,
        idx % 2 === 0 ? baseMat : tipMat,
        0.55,
      );
      crestPivot.add(spike);
    });

    registerSway(crestPivot, 0.14, 0.08, 0.025, 0.2);
    registerLength(crestPivot, 'all');
    capTopGroups.push(crestPivot);
    g.add(crestPivot);

    styleGroups.set('mohawk', g);
  }

  // Empty placeholder for 'none'
  styleGroups.set('none', new THREE.Group());

  for (const [, grp] of styleGroups) {
    grp.visible = false;
    hairContent.add(grp);
  }

  // =========================================================================
  // 2. INDEPENDENT BANGS (ЧЁЛКА) LAYER — Mix & Match with ANY Hairstyle!
  // =========================================================================
  const bangsRoot = new THREE.Group();
  bangsRoot.position.set(0, 0.77, 0.36);
  registerSway(bangsRoot, 0.07, 0.05, 0.014, 1.7);
  registerLength(bangsRoot, 'y');
  hairContent.add(bangsRoot);

  const bangsGroups = new Map<HairBangsId, THREE.Group>();
  bangsGroups.set('none', new THREE.Group());

  // --- BANGS: STRAIGHT (Cute Full Straight Fringe Above Eyes) ---
  {
    const g = new THREE.Group();
    const xs = [-0.28, -0.19, -0.10, 0.0, 0.10, 0.19, 0.28];
    xs.forEach((bx, idx) => {
      const curveZ = -Math.abs(bx) * 0.26;
      const len = 0.21 + (Math.abs(bx) > 0.22 ? 0.06 : 0);
      const s = makeStrand(
        [
          [bx * 0.85, 0.04, curveZ - 0.04],
          [bx, -len * 0.45, curveZ + 0.055],
          [bx * 1.04, -len, curveZ + 0.045],
        ],
        0.062,
        0.068,
        0.016,
        idx === 3 ? tipMat : baseMat,
        0.52,
      );
      g.add(s);
    });
    bangsGroups.set('straight', g);
  }

  // --- BANGS: SIDE-SWEPT (Stylish Diagonal Anime Side Bangs) ---
  {
    const g = new THREE.Group();
    const sweeps: Array<{ x0: number; x1: number; drop: number; r: number; tip: boolean }> = [
      { x0: -0.26, x1: 0.04, drop: 0.18, r: 0.065, tip: false },
      { x0: -0.14, x1: 0.19, drop: 0.21, r: 0.072, tip: true },
      { x0: 0.02, x1: 0.32, drop: 0.24, r: 0.068, tip: false },
      { x0: 0.18, x1: 0.41, drop: 0.27, r: 0.06, tip: true },
      { x0: -0.32, x1: -0.38, drop: 0.23, r: 0.052, tip: false },
    ];
    for (const sw of sweeps) {
      const z0 = -Math.abs(sw.x0) * 0.22 - 0.03;
      const z1 = -Math.abs(sw.x1) * 0.28 + 0.055;
      const s = makeStrand(
        [
          [sw.x0, 0.04, z0],
          [(sw.x0 + sw.x1) * 0.52, -sw.drop * 0.45, (z0 + z1) * 0.5 + 0.04],
          [sw.x1, -sw.drop, z1],
        ],
        sw.r * 0.9,
        sw.r,
        0.012,
        sw.tip ? tipMat : baseMat,
        0.54,
      );
      g.add(s);
    }
    bangsGroups.set('side', g);
  }

  // --- BANGS: CURTAIN (Center-Parted Framing Curtain Bangs) ---
  {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const inner = makeStrand(
        [
          [side * 0.03, 0.04, 0.0],
          [side * 0.17, -0.07, 0.065],
          [side * 0.30, -0.24, 0.025],
          [side * 0.37, -0.35, -0.05],
        ],
        0.06,
        0.075,
        0.014,
        baseMat,
        0.58,
      );
      const outer = makeStrand(
        [
          [side * 0.12, 0.03, -0.03],
          [side * 0.29, -0.08, 0.025],
          [side * 0.40, -0.27, -0.05],
        ],
        0.055,
        0.068,
        0.014,
        tipMat,
        0.58,
      );
      g.add(inner, outer);
    }
    bangsGroups.set('curtain', g);
  }

  // --- BANGS: WISPY (Light Airy Chibi Wisps) ---
  {
    const g = new THREE.Group();
    const wisps: Array<[number, number, number, boolean]> = [
      [-0.24, 0.19, 0.046, false],
      [-0.11, 0.16, 0.044, true],
      [0.02, 0.20, 0.048, false],
      [0.14, 0.17, 0.044, true],
      [0.25, 0.21, 0.046, false],
    ];
    for (const [bx, drop, r, tip] of wisps) {
      const cz = -Math.abs(bx) * 0.25;
      const s = makeStrand(
        [
          [bx * 0.85, 0.04, cz - 0.03],
          [bx + (bx > 0 ? 0.02 : -0.02), -drop * 0.5, cz + 0.058],
          [bx + (bx > 0 ? 0.04 : -0.04), -drop, cz + 0.048],
        ],
        r * 0.85,
        r,
        0.009,
        tip ? tipMat : baseMat,
        0.58,
      );
      g.add(s);
    }
    bangsGroups.set('wispy', g);
  }

  for (const [, grp] of bangsGroups) {
    grp.visible = false;
    bangsRoot.add(grp);
  }

  const tmpBaseColor = new THREE.Color();
  const tmpTipColor = new THREE.Color();
  const whiteColor = new THREE.Color(0xffffff);

  return {
    root,
    applyCustomization(c: CharacterCustomization, characterId: CharacterId) {
      const style: HairStyleId = c.hairStyle ?? 'none';
      const bangs: HairBangsId = c.hairBangs ?? 'none';
      const hasAnyHair = style !== 'none' || bangs !== 'none';

      root.visible = hasAnyHair;
      if (!hasAnyHair) return;

      // Toggle selected hairstyle & bangs
      for (const [id, grp] of styleGroups.entries()) {
        grp.visible = id === style;
      }
      for (const [id, grp] of bangsGroups.entries()) {
        grp.visible = id === bangs;
      }

      // Colors & gloss material properties
      tmpBaseColor.set(c.hairColor || '#5b341e');
      baseMat.color.copy(tmpBaseColor);

      if (c.hairHighlight) {
        tipMat.color.set(c.hairTipColor || '#f59e0b');
        tieMat.color.set(c.hairTipColor || c.accessoryAccentColor || '#f472b6');
      } else {
        // Subtle natural tonal lift (+12% brighter) so strands pop with 3D depth even in single-color mode
        tmpTipColor.copy(tmpBaseColor).lerp(whiteColor, 0.12);
        tipMat.color.copy(tmpTipColor);
        tieMat.color.set(c.accessoryAccentColor || '#f472b6');
      }

      const gloss = Math.max(0, Math.min(1, c.hairGloss ?? 0.45));
      baseMat.roughness = 0.78 - gloss * 0.56;
      baseMat.metalness = 0.02 + gloss * 0.14;
      tipMat.roughness = 0.74 - gloss * 0.54;
      tipMat.metalness = 0.03 + gloss * 0.16;

      // Live 3D Volume morph
      const vol = Math.max(0.75, Math.min(1.4, c.hairVolume ?? 1.0));
      volumePivot.scale.set(
        0.96 + (vol - 1.0) * 0.36 + 0.04,
        0.96 + (vol - 1.0) * 0.42 + 0.04,
        0.96 + (vol - 1.0) * 0.36 + 0.04,
      );

      // Live 3D Length morph (anchored at strand roots so hair grows downward cleanly!)
      const len = Math.max(0.65, Math.min(1.45, c.hairLength ?? 1.0));
      for (const node of lengthNodes) {
        if (node.axis === 'y') {
          node.obj.scale.set(node.baseScale.x, node.baseScale.y * len, node.baseScale.z);
        } else if (node.axis === 'z') {
          node.obj.scale.set(node.baseScale.x, node.baseScale.y, node.baseScale.z * len);
        } else {
          const k = 1 + (len - 1) * 0.65;
          node.obj.scale.set(node.baseScale.x * k, node.baseScale.y * k, node.baseScale.z * k);
        }
      }

      // Smart Cap compatibility: if Guest / Modern Guest is wearing their cap, tuck the top hair dome cleanly!
      const hasActiveCap = characterId !== 'noob' && c.capVisible;
      for (const topObj of capTopGroups) {
        // Keep mohawk & tuft peeking if chosen without cap; tuck dome when cap is on
        topObj.visible = !hasActiveCap;
      }
      // Position bangs cleanly right below Guest cap brim (or on forehead without cap)
      bangsRoot.position.y = hasActiveCap ? 0.69 : characterId === 'noob' ? 0.75 : 0.77;
      bangsRoot.position.z = hasActiveCap ? 0.38 : 0.36;
    },

    update(time: number, isTalking: boolean, headVelYaw: number, headVelPitch: number) {
      if (!root.visible) return;
      const talkBoost = isTalking ? 1.45 : 1.0;
      const clampedYaw = Math.max(-2.5, Math.min(2.5, headVelYaw));
      const clampedPitch = Math.max(-2.5, Math.min(2.5, headVelPitch));

      for (const n of swayNodes) {
        const idleZ = Math.sin(time * 2.3 + n.phase) * n.idleAmp * talkBoost;
        const idleX = Math.cos(time * 1.9 + n.phase * 1.3) * n.idleAmp * 0.65 * talkBoost;
        const targetRotZ = n.baseRotZ + idleZ - clampedYaw * n.ampYaw;
        const targetRotX = n.baseRotX + idleX + clampedPitch * n.ampPitch;

        n.obj.rotation.z += (targetRotZ - n.obj.rotation.z) * 0.14;
        n.obj.rotation.x += (targetRotX - n.obj.rotation.x) * 0.14;
      }
    },
  };
}
