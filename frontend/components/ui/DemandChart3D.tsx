'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface DemandChart3DProps {
  progress?: number; // 0..1 scroll progress
}

export default function DemandChart3D({ progress = 1 }: DemandChart3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    bars: THREE.Mesh[];
    particles: THREE.Points;
    frameId: number;
    targetHeights: number[];
  } | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth  || Math.floor(window.innerWidth  * 0.5);
    const H = el.clientHeight || Math.floor(window.innerHeight);

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(-3, 6, 10);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x00cfff, 8, 20);
    cyanLight.position.set(-3, 5, 5);
    scene.add(cyanLight);

    const indigoLight = new THREE.PointLight(0x6366f1, 6, 20);
    indigoLight.position.set(4, 3, 3);
    scene.add(indigoLight);

    // Floor grid
    const gridHelper = new THREE.GridHelper(14, 14, 0x00cfff, 0x1a1a3a);
    (gridHelper.material as THREE.LineBasicMaterial).opacity = 0.18;
    (gridHelper.material as THREE.LineBasicMaterial).transparent = true;
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Bar chart data
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const heights = [1.2, 1.8, 1.4, 2.2, 2.6, 2.1, 2.9, 3.2, 2.7, 3.5, 3.8, 4.2];
    const bars: THREE.Mesh[] = [];

    const CYAN = new THREE.Color(0x00cfff);
    const INDIGO = new THREE.Color(0x6366f1);
    const VIOLET = new THREE.Color(0xa78bfa);

    heights.forEach((h, i) => {
      const t = i / (heights.length - 1);
      const color = new THREE.Color().lerpColors(CYAN, INDIGO, t * 0.7).lerp(VIOLET, t * 0.3);

      const geo = new THREE.BoxGeometry(0.65, 1, 0.65);
      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.2,
        emissive: color,
        emissiveIntensity: 0.25,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Position bars in a row
      const x = (i - (heights.length - 1) / 2) * 0.88;
      mesh.position.set(x, 0, 0);
      mesh.scale.y = 0.001; // start collapsed
      mesh.userData = { targetH: h, x };
      scene.add(mesh);
      bars.push(mesh);
    });

    // Forecast line (will be rendered as spheres along a curve)
    const linePts: THREE.Vector3[] = heights.map((h, i) => {
      const x = (i - (heights.length - 1) / 2) * 0.85;
      return new THREE.Vector3(x, h, 0);
    });
    const lineCurve = new THREE.CatmullRomCurve3(linePts);
    const linePoints = lineCurve.getPoints(60);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00cfff, linewidth: 2 });
    const line = new THREE.Line(lineGeo, lineMat);
    line.visible = false;
    scene.add(line);

    // Particles
    const particleCount = 120;
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 14;
      pPositions[i * 3 + 1] = Math.random() * 6;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x00cfff,
      size: 0.04,
      transparent: true,
      opacity: 0.5,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    let t = 0;
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      t += 0.012;

      // Animate bars up to target height * progress
      bars.forEach((bar, i) => {
        const targetH = bar.userData.targetH as number;
        const p = Math.min(1, progress * 1.3 - i * 0.05);
        const desiredScale = Math.max(0.001, p * targetH);
        bar.scale.y += (desiredScale - bar.scale.y) * 0.06;
        bar.position.y = bar.scale.y / 2;

        // Subtle pulse
        const mat = bar.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.15 + 0.06 * Math.sin(t + i * 0.5);
      });

      // Show forecast line once bars are up
      if (progress > 0.7) {
        line.visible = true;
        const newHeights = heights.map((h, i) => {
          const x = (i - (heights.length - 1) / 2) * 0.85;
          return new THREE.Vector3(x, bars[i].scale.y, 0);
        });
        const curve2 = new THREE.CatmullRomCurve3(newHeights);
        const pts2 = curve2.getPoints(60);
        lineGeo.setFromPoints(pts2);
      }

      // Gentle camera sway — stays mostly frontal with slight left offset
      camera.position.x = -3 + Math.sin(t * 0.05) * 1.5;
      camera.position.y = 6 + Math.sin(t * 0.04) * 0.4;
      camera.position.z = 10 + Math.cos(t * 0.035) * 0.8;
      camera.lookAt(0, 2, 0);

      // Particle movement
      const pArr = pGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        pArr[i * 3 + 1] += 0.005;
        if (pArr[i * 3 + 1] > 6) pArr[i * 3 + 1] = 0;
      }
      pGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { renderer, scene, camera, bars, particles, frameId, targetHeights: heights };

    const handleResize = () => {
      if (!el) return;
      const w = el.clientWidth  || Math.floor(window.innerWidth  * 0.5);
      const h = el.clientHeight || Math.floor(window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Update progress reactively without remounting
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.targetHeights = sceneRef.current.targetHeights;
  }, [progress]);

  return (
    <div ref={mountRef} style={{ position:'absolute', inset:0 }} />
  );
}
