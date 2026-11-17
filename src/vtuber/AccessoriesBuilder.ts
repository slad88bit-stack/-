import * as THREE from 'three';
import type { AccessoriesState, CharacterId } from '../types/vtuber';

export interface AccessoriesHandles {
  headRoot: THREE.Group;
  torsoRoot: THREE.Group;
  update: (time: number, isTalking: boolean) => void;
  applyState: (state: AccessoriesState) => void;
  configureForCharacter: (characterId: CharacterId, capVisible: boolean, hasHair?: boolean) => void;
  setAccentColor: (hex: string) => void;
}

export function buildCharacterAccessories(): AccessoriesHandles {
  const headRoot = new THREE.Group();
  headRoot.name = 'VTuber_HeadAccessories';

  const torsoRoot = new THREE.Group();
  torsoRoot.name = 'VTuber_TorsoAccessories';

  // Shared customizable accent materials
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.3,
    metalness: 0.14,
  });
  const ledRingMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const micTipMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 1.2,
    roughness: 0.25,
  });

  // --- 1. STREAMER HEADPHONES ---
  const headphones = new THREE.Group();
  headphones.name = 'Acc_Headphones';

  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.28,
    metalness: 0.08,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.02,
  });

  const bandGeom = new THREE.TorusGeometry(0.525, 0.044, 16, 44, Math.PI);
  const band = new THREE.Mesh(bandGeom, bandMat);
  band.position.set(0, 0.44, 0);
  band.scale.set(1.0, 0.96, 1.35);
  band.castShadow = true;
  headphones.add(band);

  const topPadGeom = new THREE.TorusGeometry(0.488, 0.026, 12, 24, Math.PI * 0.42);
  const topPad = new THREE.Mesh(topPadGeom, accentMat);
  topPad.position.set(0, 0.44, 0);
  topPad.rotation.z = Math.PI * 0.29;
  topPad.scale.set(1.0, 0.96, 1.2);
  headphones.add(topPad);

  for (const side of [-1, 1]) {
    const cupGroup = new THREE.Group();
    cupGroup.position.set(side * 0.515, 0.41, 0);

    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.145, 0.085, 28), bandMat);
    shell.rotation.z = Math.PI / 2;
    shell.position.x = side * 0.02;
    shell.castShadow = true;
    cupGroup.add(shell);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.128, 0.032, 28), accentMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 0.064;
    cupGroup.add(cap);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.011, 12, 32), ledRingMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.068;
    cupGroup.add(ring);

    const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.044, 14, 28), cushionMat);
    cushion.rotation.y = Math.PI / 2;
    cushion.position.x = -side * 0.024;
    cupGroup.add(cushion);

    headphones.add(cupGroup);
  }

  const micCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.54, 0.36, 0.06),
    new THREE.Vector3(-0.52, 0.25, 0.26),
    new THREE.Vector3(-0.34, 0.2, 0.43),
    new THREE.Vector3(-0.18, 0.22, 0.455),
  ]);
  const micArm = new THREE.Mesh(new THREE.TubeGeometry(micCurve, 20, 0.013, 10, false), cushionMat);
  headphones.add(micArm);

  const micHead = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.035, 8, 16), cushionMat);
  micHead.position.set(-0.165, 0.222, 0.458);
  micHead.rotation.z = Math.PI / 2 - 0.15;
  headphones.add(micHead);

  const micLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), micTipMat);
  micLed.position.set(-0.14, 0.225, 0.468);
  headphones.add(micLed);

  headphones.visible = false;
  headRoot.add(headphones);

  // --- 2. GOLDEN CROWN ---
  const crown = new THREE.Group();
  crown.name = 'Acc_Crown';
  crown.position.set(0.02, 0.84, 0.02);
  crown.rotation.z = -0.07;

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffc824,
    roughness: 0.22,
    metalness: 0.72,
  });
  const baseBand = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.12, 24), goldMat);
  baseBand.position.y = 0.06;
  baseBand.castShadow = true;
  crown.add(baseBand);

  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.024, 12, 28), goldMat);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.015;
  crown.add(rimRing);

  const gemColors = [0xef4444, 0x3b82f6, 0x10b981, 0x3b82f6, 0xef4444];
  const peaks = 5;
  for (let i = 0; i < peaks; i++) {
    const angle = (i / peaks) * Math.PI * 2 + Math.PI / 10;
    const px = Math.sin(angle) * 0.215;
    const pz = Math.cos(angle) * 0.215;

    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.16, 4), goldMat);
    spike.position.set(px, 0.18, pz);
    spike.rotation.y = angle;
    spike.castShadow = true;
    crown.add(spike);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), goldMat);
    orb.position.set(px, 0.265, pz);
    crown.add(orb);

    const gemMat = new THREE.MeshStandardMaterial({
      color: gemColors[i % gemColors.length],
      emissive: gemColors[i % gemColors.length],
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.1,
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), gemMat);
    gem.position.set(Math.sin(angle) * 0.236, 0.07, Math.cos(angle) * 0.236);
    crown.add(gem);
  }

  crown.visible = false;
  headRoot.add(crown);

  // --- 3. COOL STREAMER SUNGLASSES ---
  const sunglasses = new THREE.Group();
  sunglasses.name = 'Acc_Sunglasses';
  sunglasses.position.set(0, 0.335, 0.415);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.22,
    metalness: 0.25,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.85,
  });
  const glintMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
  });

  for (const side of [-1, 1]) {
    const lensFrame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.145, 0.036), frameMat);
    lensFrame.position.set(side * 0.18, 0, 0);
    lensFrame.castShadow = true;
    sunglasses.add(lensFrame);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.105, 0.04), lensMat);
    lens.position.set(side * 0.18, 0, 0.004);
    sunglasses.add(lens);

    const glint = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.085, 0.008), glintMat);
    glint.position.set(side * 0.18 - 0.045, 0.005, 0.025);
    glint.rotation.z = -0.5;
    sunglasses.add(glint);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.034, 0.44), frameMat);
    arm.position.set(side * 0.465, 0.02, -0.22);
    sunglasses.add(arm);

    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.034, 0.034), frameMat);
    hinge.position.set(side * 0.38, 0.02, -0.005);
    sunglasses.add(hinge);
  }

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.038, 0.036), frameMat);
  bridge.position.set(0, 0.022, 0);
  sunglasses.add(bridge);

  sunglasses.visible = false;
  headRoot.add(sunglasses);

  // --- 4. FLOATING GOLDEN HALO ---
  const halo = new THREE.Group();
  halo.name = 'Acc_Halo';
  let haloBaseY = 1.03;
  halo.position.set(0, haloBaseY, 0);

  const haloMat = new THREE.MeshStandardMaterial({
    color: 0xffe478,
    emissive: 0xffc830,
    emissiveIntensity: 1.5,
    roughness: 0.18,
    metalness: 0.4,
  });
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.034, 16, 48), haloMat);
  haloRing.rotation.x = Math.PI / 2;
  halo.add(haloRing);

  halo.visible = false;
  headRoot.add(halo);

  // --- 5. KAWAII CAT EARS ---
  const catEars = new THREE.Group();
  catEars.name = 'Acc_CatEars';
  catEars.position.set(0, 0.82, 0.02);

  const earOuterMat = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    roughness: 0.45,
    metalness: 0.05,
  });

  // Thin headband base connecting ears
  const earBand = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.024, 10, 32, Math.PI * 0.72), earOuterMat);
  earBand.position.set(0, -0.35, 0);
  earBand.rotation.z = Math.PI * 0.14;
  earBand.scale.set(1.0, 0.88, 1.0);
  catEars.add(earBand);

  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.27, 0.08, 0);
    ear.rotation.z = -side * 0.24;

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.25, 4), earOuterMat);
    outer.scale.set(1.0, 1.0, 0.52);
    outer.rotation.y = Math.PI / 4;
    outer.castShadow = true;
    ear.add(outer);

    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.16, 4), accentMat);
    inner.scale.set(1.0, 1.0, 0.35);
    inner.rotation.y = Math.PI / 4;
    inner.position.set(0, -0.015, 0.036);
    ear.add(inner);

    catEars.add(ear);
  }

  catEars.visible = false;
  headRoot.add(catEars);

  // --- 6. STREAMER BOWTIE (Torso bone) ---
  const bowtie = new THREE.Group();
  bowtie.name = 'Acc_Bowtie';
  // Torso bone is at y=0.45; neck/collar top of Baby_Torso is y=0.71 -> local y ~ 0.23, front z ~ 0.205
  bowtie.position.set(0, 0.225, 0.205);

  const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.044, 16, 16), accentMat);
  bowKnot.scale.set(0.95, 0.85, 0.75);
  bowtie.add(bowKnot);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.13, 4), accentMat);
    wing.rotation.z = side * (Math.PI / 2);
    wing.rotation.y = Math.PI / 4;
    wing.scale.set(1.0, 1.0, 0.45);
    wing.position.set(side * 0.072, 0, -0.005);
    wing.castShadow = true;
    bowtie.add(wing);
  }

  bowtie.visible = false;
  torsoRoot.add(bowtie);

  // --- 7. MINI VTUBER WINGS (Torso bone) ---
  const wings = new THREE.Group();
  wings.name = 'Acc_Wings';
  wings.position.set(0, 0.14, -0.2);

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 0.2,
    roughness: 0.32,
    metalness: 0.05,
  });

  const leftWingPivot = new THREE.Group();
  leftWingPivot.position.set(0.09, 0.03, 0);
  const rightWingPivot = new THREE.Group();
  rightWingPivot.position.set(-0.09, 0.03, 0);

  const buildWingSide = (pivot: THREE.Group, side: number) => {
    const feathers: Array<[number, number, number, number, number]> = [
      [0.16, 0.09, 0.24, 0.09, -0.22],
      [0.2, 0.01, 0.26, 0.08, -0.02],
      [0.14, -0.07, 0.18, 0.07, 0.22],
    ];
    for (const [fx, fy, w, h, rot] of feathers) {
      const feather = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.52, w * 0.65, 6, 12), wingMat);
      feather.rotation.z = Math.PI / 2 + side * rot;
      feather.scale.set(1, 1, 0.36);
      feather.position.set(side * fx, fy, -0.02);
      feather.castShadow = true;
      pivot.add(feather);
    }

    const trim = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.15, 6, 10), accentMat);
    trim.rotation.z = Math.PI / 2 - side * 0.28;
    trim.position.set(side * 0.13, 0.13, 0.0);
    pivot.add(trim);
  };

  buildWingSide(leftWingPivot, 1);
  buildWingSide(rightWingPivot, -1);
  wings.add(leftWingPivot, rightWingPivot);

  wings.visible = false;
  torsoRoot.add(wings);

  return {
    headRoot,
    torsoRoot,
    update(time: number, isTalking: boolean) {
      if (halo.visible) {
        halo.position.y = haloBaseY + Math.sin(time * 2.8) * 0.035;
        halo.rotation.z = Math.sin(time * 1.4) * 0.05;
      }
      if (headphones.visible) {
        const pulse = isTalking ? 1.8 + Math.sin(time * 18) * 0.7 : 0.9 + Math.sin(time * 2.5) * 0.25;
        ledRingMat.emissiveIntensity = pulse;
        micTipMat.emissive.setHex(isTalking ? 0x22c55e : 0x38bdf8);
        micTipMat.color.setHex(isTalking ? 0x22c55e : 0x38bdf8);
        micTipMat.emissiveIntensity = isTalking ? 2.2 : 0.7;
      }
      if (wings.visible) {
        const speed = isTalking ? 9.5 : 3.2;
        const amp = isTalking ? 0.32 : 0.16;
        const flap = Math.sin(time * speed) * amp;
        leftWingPivot.rotation.y = -0.35 + flap;
        rightWingPivot.rotation.y = 0.35 - flap;
      }
    },
    applyState(state: AccessoriesState) {
      headphones.visible = state.headphones;
      crown.visible = state.crown;
      sunglasses.visible = state.sunglasses;
      halo.visible = state.halo;
      catEars.visible = state.catEars;
      bowtie.visible = state.bowtie;
      wings.visible = state.wings;
    },
    configureForCharacter(characterId: CharacterId, capVisible: boolean, hasHair = false) {
      const hasActiveCap = characterId !== 'noob' && capVisible;
      const topLift = hasActiveCap ? 0.062 : hasHair ? 0.048 : 0;

      // Exact measured Head-local eye Y: Baby Noob = 0.335, Classic & Modern Guest = 0.420!
      sunglasses.position.y = characterId === 'noob' ? 0.335 : 0.42;
      sunglasses.position.z = characterId === 'noob' ? 0.415 : 0.418;

      crown.position.y = 0.84 + topLift;
      catEars.position.y = 0.82 + topLift;
      haloBaseY = 1.03 + topLift;
      halo.position.y = haloBaseY;

      headphones.position.y = hasActiveCap || hasHair ? 0.032 : 0;
    },
    setAccentColor(hex: string) {
      accentMat.color.set(hex);
      ledRingMat.color.set(hex);
      ledRingMat.emissive.set(hex);
    },
  };
}
