'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function CubeScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    mount.appendChild(renderer.domElement);

    // ── Scene & Camera ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 8);

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    const keyLight = new THREE.DirectionalLight(0xddeeff, 2.8);
    keyLight.position.set(6, 10, 6);
    scene.add(keyLight);

    const cyanRim = new THREE.PointLight(0x00cfff, 14, 32);
    cyanRim.position.set(-6, 2, 4);
    scene.add(cyanRim);

    const indigoFill = new THREE.PointLight(0x6366f1, 5, 26);
    indigoFill.position.set(5, -5, 2);
    scene.add(indigoFill);

    const violetBack = new THREE.PointLight(0x8b5cf6, 6, 36);
    violetBack.position.set(0, 1, -10);
    scene.add(violetBack);

    // ── Main cube 3×3×3 ───────────────────────────────────────────────────────
    const CUBE_COLOR = 0x00cfff;
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: CUBE_COLOR,
      metalness: 0.78,
      roughness: 0.06,
      emissive: new THREE.Color(0x00334d),
      emissiveIntensity: 0.38,
      transparent: true,
      opacity: 1,
    });

    const SUB  = 0.56;
    const GAP  = 0.63;
    const GRID = 3;
    const half = (GRID - 1) / 2;

    interface Fragment {
      mesh: THREE.Mesh;
      origin: THREE.Vector3;
      dir: THREE.Vector3;
      rotVel: THREE.Vector3;
    }

    const fragments: Fragment[] = [];
    const subGeo = new THREE.BoxGeometry(SUB, SUB, SUB);

    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        for (let z = 0; z < GRID; z++) {
          const mat = baseMat.clone();
          const mesh = new THREE.Mesh(subGeo, mat);
          const px = (x - half) * GAP;
          const py = (y - half) * GAP;
          const pz = (z - half) * GAP;
          mesh.position.set(px, py, pz);
          scene.add(mesh);

          const dir = new THREE.Vector3(
            (Math.random() - 0.5) * 1.4 + (x - half) * 0.8,
            (Math.random() - 0.5) * 1.4 + (y - half) * 0.8,
            (Math.random() - 0.5) * 1.4 + (z - half) * 0.8
          ).normalize();

          fragments.push({
            mesh,
            origin: new THREE.Vector3(px, py, pz),
            dir,
            rotVel: new THREE.Vector3(
              (Math.random() - 0.5) * 0.09,
              (Math.random() - 0.5) * 0.09,
              (Math.random() - 0.5) * 0.06
            ),
          });
        }
      }
    }

    // ── Ambient 3-D atmosphere ────────────────────────────────────────────────

    // — Outer torus ring (cyan, tilted) —
    const outerRingGeo = new THREE.TorusGeometry(2.55, 0.018, 20, 140);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x00cfff,
      transparent: true,
      opacity: 0.32,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.x = Math.PI * 0.32;
    outerRing.rotation.y = Math.PI * 0.1;
    scene.add(outerRing);

    // — Inner torus ring (indigo, different tilt) —
    const innerRingGeo = new THREE.TorusGeometry(1.9, 0.011, 20, 140);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.22,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = Math.PI * 0.6;
    innerRing.rotation.z = Math.PI * 0.15;
    scene.add(innerRing);

    // — Large icosahedron wireframe cage (very faint depth layer) —
    const icoGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.4, 1));
    const icoMat = new THREE.LineBasicMaterial({
      color: 0x00cfff,
      transparent: true,
      opacity: 0.045,
    });
    const ico = new THREE.LineSegments(icoGeo, icoMat);
    scene.add(ico);

    // — 8 orbiting micro-cubes —
    const MINI_COUNT = 8;
    interface MiniCube {
      mesh: THREE.Mesh;
      orbit: number;
      speed: number;
      radius: number;
      height: number;
    }
    const miniCubes: MiniCube[] = [];
    const miniGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);

    for (let i = 0; i < MINI_COUNT; i++) {
      const miniMat = new THREE.MeshPhysicalMaterial({
        color: i % 2 === 0 ? 0x00cfff : 0x818cf8,
        metalness: 0.85,
        roughness: 0.08,
        emissive: new THREE.Color(i % 2 === 0 ? 0x002233 : 0x1a1040),
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.75,
      });
      const mesh = new THREE.Mesh(miniGeo, miniMat);
      const radius = 2.6 + Math.random() * 1.6;
      const height = (Math.random() - 0.5) * 3.2;
      const startAngle = (i / MINI_COUNT) * Math.PI * 2;
      mesh.position.set(
        Math.cos(startAngle) * radius,
        height,
        Math.sin(startAngle) * radius
      );
      scene.add(mesh);
      miniCubes.push({
        mesh,
        orbit: startAngle,
        speed: 0.0025 + Math.random() * 0.003,
        radius,
        height,
      });
    }

    // — Particle halo —
    const PARTICLE_COUNT = 160;
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = 3.2 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00cfff,
      size: 0.028,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    const particleHalo = new THREE.Points(particleGeo, particleMat);
    scene.add(particleHalo);

    // — Second particle layer (violet dots, sparse) —
    const pos2 = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) {
      const r = 2.0 + Math.random() * 2.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos2[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos2[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos2[i * 3 + 2] = r * Math.cos(phi);
    }
    const particleGeo2 = new THREE.BufferGeometry();
    particleGeo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    const particleMat2 = new THREE.PointsMaterial({
      color: 0x818cf8,
      size: 0.022,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    });
    const particleHalo2 = new THREE.Points(particleGeo2, particleMat2);
    scene.add(particleHalo2);

    // ── Scroll progress ───────────────────────────────────────────────────────
    const EXPLODE_DIST = 20;
    let progress = 0;
    let time = 0; // used only for ambient animations

    const getTarget = () =>
      Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.85)));

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ── Animation loop ────────────────────────────────────────────────────────
    let rafId: number;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      time += 0.005;

      // Smooth scroll lerp
      progress += (getTarget() - progress) * 0.07;
      const ambientAlpha = Math.max(0, 1 - progress * 2.2);

      // ── AMBIENT ELEMENTS — always animate gently ──────────────────────────

      // Torus rings orbit
      outerRing.rotation.z += 0.003;
      innerRing.rotation.z -= 0.002;
      innerRing.rotation.y += 0.0015;
      outerRingMat.opacity = 0.32 * ambientAlpha;
      innerRingMat.opacity = 0.22 * ambientAlpha;

      // Icosahedron slow drift
      ico.rotation.y += 0.0018;
      ico.rotation.x += 0.001;
      icoMat.opacity = 0.045 * ambientAlpha;

      // Particle halos rotate in opposite directions
      particleHalo.rotation.y  += 0.0008;
      particleHalo.rotation.x  += 0.0004;
      particleHalo2.rotation.y -= 0.0012;
      particleMat.opacity  = 0.45 * ambientAlpha;
      particleMat2.opacity = 0.35 * ambientAlpha;

      // Orbiting mini-cubes
      miniCubes.forEach((mc) => {
        mc.orbit += mc.speed;
        mc.mesh.position.x = Math.cos(mc.orbit) * mc.radius;
        mc.mesh.position.z = Math.sin(mc.orbit) * mc.radius;
        // gentle up-down float
        mc.mesh.position.y = mc.height + Math.sin(time + mc.orbit) * 0.18;
        mc.mesh.rotation.x += 0.012;
        mc.mesh.rotation.y += 0.009;
        (mc.mesh.material as THREE.MeshPhysicalMaterial).opacity =
          0.75 * ambientAlpha;
      });

      // ── MAIN CUBE — static until scroll, then explode ────────────────────

      // Cube stays at rotation (0,0,0) — no idle spin
      fragments.forEach((f) => {
        f.mesh.position.set(
          f.origin.x + f.dir.x * EXPLODE_DIST * progress,
          f.origin.y + f.dir.y * EXPLODE_DIST * progress,
          f.origin.z + f.dir.z * EXPLODE_DIST * progress
        );

        // Fragments spin only once they actually move
        if (progress > 0.01) {
          const spinScale = 1 + progress * 9;
          f.mesh.rotation.x += f.rotVel.x * spinScale;
          f.mesh.rotation.y += f.rotVel.y * spinScale;
          f.mesh.rotation.z += f.rotVel.z * spinScale;
        }

        const mat = f.mesh.material as THREE.MeshPhysicalMaterial;
        mat.opacity = Math.max(0, 1 - progress * 1.5);
        mat.emissiveIntensity = 0.38 + progress * 1.8;
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
