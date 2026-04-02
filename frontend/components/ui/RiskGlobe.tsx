'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function RiskGlobe() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth  || Math.floor(window.innerWidth  * 0.5);
    const H = el.clientHeight || Math.floor(window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambient);
    const rimLight = new THREE.PointLight(0x00cfff, 12, 15);
    rimLight.position.set(-4, 3, 2);
    scene.add(rimLight);
    const rimLight2 = new THREE.PointLight(0x6366f1, 8, 15);
    rimLight2.position.set(4, -3, 2);
    scene.add(rimLight2);

    // Wireframe sphere (globe)
    const sphereGeo = new THREE.SphereGeometry(2, 28, 28);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00cfff,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const wireGlobe = new THREE.Mesh(sphereGeo, wireMat);
    scene.add(wireGlobe);

    // Inner solid core (dim)
    const coreGeo = new THREE.SphereGeometry(1.95, 24, 24);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x080818,
      metalness: 0.5,
      roughness: 0.9,
      transparent: true,
      opacity: 0.6,
    });
    scene.add(new THREE.Mesh(coreGeo, coreMat));

    // Risk hotspot spikes
    const HOTSPOTS = [
      { lat: 40, lon: -74, risk: 0.9, color: 0xff4444 },  // NY
      { lat: 51, lon: 0, risk: 0.5, color: 0xfbbf24 },    // London
      { lat: 35, lon: 139, risk: 0.75, color: 0xff6633 }, // Tokyo
      { lat: 22, lon: 114, risk: 0.8, color: 0xff4444 },  // HK
      { lat: 48, lon: 2, risk: 0.4, color: 0x34d399 },    // Paris
      { lat: -33, lon: 151, risk: 0.3, color: 0x34d399 }, // Sydney
      { lat: 1, lon: 103, risk: 0.6, color: 0xfbbf24 },   // Singapore
    ];

    const latLonToVec = (lat: number, lon: number, r: number) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
    };

    const spikes: { mesh: THREE.Mesh; targetH: number; phase: number }[] = [];
    HOTSPOTS.forEach((hs) => {
      const pos = latLonToVec(hs.lat, hs.lon, 2);
      const direction = pos.clone().normalize();

      const geo = new THREE.CylinderGeometry(0.02, 0.05, hs.risk * 0.8, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: hs.color,
        emissive: new THREE.Color(hs.color),
        emissiveIntensity: 0.7,
        metalness: 0.3,
        roughness: 0.4,
      });
      const spike = new THREE.Mesh(geo, mat);

      // Position and orient spike along normal
      spike.position.copy(pos.clone().addScaledVector(direction, hs.risk * 0.4));
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      scene.add(spike);
      spikes.push({ mesh: spike, targetH: hs.risk, phase: Math.random() * Math.PI * 2 });

      // Dot at base
      const dotGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: hs.color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      scene.add(dot);
    });

    // Orbital ring
    const ringGeo = new THREE.TorusGeometry(2.6, 0.008, 8, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.8, 0.005, 8, 100),
      new THREE.MeshBasicMaterial({ color: 0x00cfff, transparent: true, opacity: 0.2 }),
    );
    ring2.rotation.x = -Math.PI / 5;
    ring2.rotation.z = Math.PI / 8;
    scene.add(ring2);

    let frame = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      wireGlobe.rotation.y = t * 0.15;
      ring.rotation.z = t * 0.2;
      ring2.rotation.y = -t * 0.18;

      // Pulse spikes
      spikes.forEach((s) => {
        const pulseH = 1 + 0.15 * Math.sin(t * 2 + s.phase);
        s.mesh.scale.setScalar(pulseH);
        (s.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
          0.6 + 0.3 * Math.sin(t * 2.5 + s.phase);
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
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
      cancelAnimationFrame(frame);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position:'absolute', inset:0 }} />
  );
}
