import * as THREE from 'three';
import type { AccessoriesState } from '../types/vtuber';

export interface AccessoriesHandles {
  root: THREE.Group;
  headphones: THREE.Group;
  crown: THREE.Group;
  sunglasses: THREE.Group;
  halo: THREE.Group;
  update: (time: number, isTalking: boolean) => void;
  applyState: (state: AccessoriesState) => void;
}

export function buildHeadAccessories(): AccessoriesHandles {
  const root = new THREE.Group();
  root.name = 'VTuber_Accessories';

  // --- 1. STREAMER HEADPHONES ---
  const headphones = new THREE.Group();
  headphones.name = 'Acc_Headphones';

  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.28,
    metalness: 0.08,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0648a6,
    roughness: 0.3,
    metalness: 0.15,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.02,
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

  // Curved headband arcing cleanly over Baby_Head (local y top is 0.849, half-width is 0.469)
  const bandGeom = new THREE.TorusGeometry(0.515, 0.044, 16, 44, Math.PI);
  const band = new THREE.Mesh(bandGeom, bandMat);
  band.position.set(0, 0.43, 0);
  band.scale.set(1.0, 0.94, 1.35);
  band.castShadow = true;
  headphones.add(band);

  // Soft top cushion pad under headband
  const topPadGeom = new THREE.TorusGeometry(0.478, 0.026, 12, 24, Math.PI * 0.42);
  const topPad = new THREE.Mesh(topPadGeom, accentMat);
  topPad.position.set(0, 0.43, 0);
  topPad.rotation.z = Math.PI * 0.29;
  topPad.scale.set(1.0, 0.94, 1.2);
  headphones.add(topPad);

  // Left & Right chunky ear cups
  for (const side of [-1, 1]) {
    const cupGroup = new THREE.Group();
    cupGroup.position.set(side * 0.505, 0.41, 0);

    // Outer shell
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.145, 0.085, 28), bandMat);
    shell.rotation.z = Math.PI / 2;
    shell.position.x = side * 0.02;
    shell.castShadow = true;
    cupGroup.add(shell);

    // Blue outer cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.128, 0.032, 28), accentMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 0.064;
    cupGroup.add(cap);

    // Glowing LED ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.011, 12, 32), ledRingMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.068;
    cupGroup.add(ring);

    // Plush cushion against head
    const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.044, 14, 28), cushionMat);
    cushion.rotation.y = Math.PI / 2;
    cushion.position.x = -side * 0.024;
    cupGroup.add(cushion);

    headphones.add(cupGroup);
  }

  // Curved boom microphone extending from viewer-left cup (-X) toward lower cheek
  const micCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.53, 0.36, 0.06),
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
  root.add(headphones);

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
  root.add(crown);

  // --- 3. COOL STREAMER SUNGLASSES ---
  const sunglasses = new THREE.Group();
  sunglasses.name = 'Acc_Sunglasses';
  // Eye center in Head local coords is y ~ 0.355, z ~ 0.405
  sunglasses.position.set(0, 0.355, 0.415);

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

  // Left & Right frames + lenses
  for (const side of [-1, 1]) {
    const lensFrame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.145, 0.036), frameMat);
    lensFrame.position.set(side * 0.18, 0, 0);
    lensFrame.castShadow = true;
    sunglasses.add(lensFrame);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.105, 0.04), lensMat);
    lens.position.set(side * 0.18, 0, 0.004);
    sunglasses.add(lens);

    // Classic diagonal pixel-style shine glint!
    const glint = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.085, 0.008), glintMat);
    glint.position.set(side * 0.18 - 0.045, 0.005, 0.025);
    glint.rotation.z = -0.5;
    sunglasses.add(glint);

    // Side arm temples hugging the head
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.034, 0.44), frameMat);
    arm.position.set(side * 0.465, 0.02, -0.22);
    sunglasses.add(arm);

    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.034, 0.034), frameMat);
    hinge.position.set(side * 0.38, 0.02, -0.005);
    sunglasses.add(hinge);
  }

  // Center bridge
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.038, 0.036), frameMat);
  bridge.position.set(0, 0.022, 0);
  sunglasses.add(bridge);

  sunglasses.visible = false;
  root.add(sunglasses);

  // --- 4. FLOATING GOLDEN HALO ---
  const halo = new THREE.Group();
  halo.name = 'Acc_Halo';
  halo.position.set(0, 1.03, 0);

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
  root.add(halo);

  return {
    root,
    headphones,
    crown,
    sunglasses,
    halo,
    update(time: number, isTalking: boolean) {
      if (halo.visible) {
        halo.position.y = 1.03 + Math.sin(time * 2.8) * 0.035;
        halo.rotation.z = Math.sin(time * 1.4) * 0.05;
      }
      if (headphones.visible) {
        const pulse = isTalking ? 1.8 + Math.sin(time * 18) * 0.7 : 0.9 + Math.sin(time * 2.5) * 0.25;
        ledRingMat.emissiveIntensity = pulse;
        micTipMat.emissive.setHex(isTalking ? 0x22c55e : 0x38bdf8);
        micTipMat.color.setHex(isTalking ? 0x22c55e : 0x38bdf8);
        micTipMat.emissiveIntensity = isTalking ? 2.2 : 0.7;
      }
    },
    applyState(state: AccessoriesState) {
      headphones.visible = state.headphones;
      crown.visible = state.crown;
      sunglasses.visible = state.sunglasses;
      halo.visible = state.halo;
    },
  };
}
