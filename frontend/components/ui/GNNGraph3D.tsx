'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function GNNGraph3D() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth  || Math.floor(window.innerWidth  * 0.5);
    const H = el.clientHeight || Math.floor(window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const cyanPt = new THREE.PointLight(0x00cfff, 10, 20);
    cyanPt.position.set(-4, 4, 4);
    scene.add(cyanPt);
    const indigoPt = new THREE.PointLight(0x6366f1, 8, 20);
    indigoPt.position.set(4, -2, 3);
    scene.add(indigoPt);

    // Node definitions
    const NODES = [
      { label: 'Electronics', pos: [0, 0, 0] as [number, number, number], color: 0x00cfff, size: 0.38, category: 'hub' },
      { label: 'Accessories', pos: [-2.2, 1.2, 0.5] as [number, number, number], color: 0x6366f1, size: 0.26, category: 'leaf' },
      { label: 'Cables', pos: [-2.8, -0.8, -0.3] as [number, number, number], color: 0x818cf8, size: 0.22, category: 'leaf' },
      { label: 'Batteries', pos: [-1.5, -2.2, 0.8] as [number, number, number], color: 0xa78bfa, size: 0.24, category: 'leaf' },
      { label: 'Monitors', pos: [2.4, 1.5, 0.2] as [number, number, number], color: 0x34d399, size: 0.28, category: 'hub2' },
      { label: 'Keyboards', pos: [1.8, -1.8, 0.6] as [number, number, number], color: 0xfbbf24, size: 0.23, category: 'leaf' },
      { label: 'Storage', pos: [3.2, -0.5, -0.5] as [number, number, number], color: 0xf472b6, size: 0.25, category: 'leaf' },
      { label: 'Peripherals', pos: [0.5, 2.8, -0.7] as [number, number, number], color: 0x38bdf8, size: 0.22, category: 'leaf' },
    ];

    // Edges (node-index pairs)
    const EDGES = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [0, 5], [0, 6], [0, 7],
      [1, 2], [1, 7],
      [4, 6], [4, 5],
    ];

    const nodeGroup = new THREE.Group();
    const nodeMeshes: THREE.Mesh[] = [];
    const nodePositions: THREE.Vector3[] = [];

    NODES.forEach((n) => {
      const v = new THREE.Vector3(...n.pos);
      nodePositions.push(v);

      // Outer glow sphere
      const glowGeo = new THREE.SphereGeometry(n.size * 1.7, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: n.color,
        transparent: true,
        opacity: 0.08,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(v);
      nodeGroup.add(glow);

      // Core sphere
      const geo = new THREE.SphereGeometry(n.size, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: n.color,
        emissive: new THREE.Color(n.color),
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(v);
      mesh.userData = { baseY: v.y, phase: Math.random() * Math.PI * 2, glowMesh: glow };
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);
    });

    // Edges as thin tubes
    EDGES.forEach(([a, b]) => {
      const start = nodePositions[a];
      const end = nodePositions[b];
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.z += 0.3; // slight arc
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const pts = curve.getPoints(20);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x00cfff,
        transparent: true,
        opacity: 0.22,
      });
      const line = new THREE.Line(geo, mat);
      nodeGroup.add(line);
    });

    scene.add(nodeGroup);

    // Floating data packets on edges
    const packets: { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; speed: number }[] = [];
    EDGES.slice(0, 6).forEach(([a, b]) => {
      const start = nodePositions[a];
      const end = nodePositions[b];
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.z += 0.3;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);

      const pGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({ color: 0x00cfff });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      scene.add(pMesh);
      packets.push({ mesh: pMesh, curve, t: Math.random(), speed: 0.003 + Math.random() * 0.003 });
    });

    let frame = 0;
    let elapsed = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      elapsed = clock.getElapsedTime();

      // Rotate the whole graph
      nodeGroup.rotation.y = elapsed * 0.12;
      nodeGroup.rotation.x = Math.sin(elapsed * 0.07) * 0.15;

      // Pulse nodes
      nodeMeshes.forEach((m, i) => {
        const phase = m.userData.phase as number;
        const pulseScale = 1 + 0.06 * Math.sin(elapsed * 1.4 + phase);
        m.scale.setScalar(pulseScale);
        const glow = m.userData.glowMesh as THREE.Mesh;
        (glow.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.05 * Math.sin(elapsed * 1.4 + phase);
      });

      // Move packets
      packets.forEach((p) => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;
        const pos = p.curve.getPoint(p.t);
        // Account for group rotation
        pos.applyEuler(nodeGroup.rotation);
        p.mesh.position.copy(pos);
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!el) return;
      const w = el.clientWidth  || Math.floor(window.innerWidth  * 0.5);
      const h = el.clientHeight || Math.floor(window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Also refit when the element becomes visible (opacity transition)
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      cancelAnimationFrame(frame);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position:'absolute', inset:0 }} />
  );
}
