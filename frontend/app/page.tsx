'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { TrendingUpIcon, ChartIcon, ShieldIcon, ArrowRightIcon } from '@/components/ui/Icons';
import dynamic from 'next/dynamic';

const CubeScene   = dynamic(() => import('@/components/ui/CubeScene'),      { ssr: false });
const DemandChart = dynamic(() => import('@/components/ui/DemandChart3D'),   { ssr: false });
const GNNGraph    = dynamic(() => import('@/components/ui/GNNGraph3D'),      { ssr: false });
const RiskGlobe   = dynamic(() => import('@/components/ui/RiskGlobe'),       { ssr: false });

// ─── Palette ────────────────────────────────────────────────────────────────
const CYAN   = '#00cfff';
const INDIGO = '#6366f1';
const BG     = '#060610';
const MAX_W  = '1280px';

// ─── Helper: responsive padding ─────────────────────────────────────────────
const pad = (extra?: React.CSSProperties): React.CSSProperties => ({
  paddingLeft:  `max(1.5rem, calc((100vw - ${MAX_W}) / 2 + 2rem))`,
  paddingRight: `max(1.5rem, calc((100vw - ${MAX_W}) / 2 + 2rem))`,
  ...extra,
});

// ─── Tiny icon helpers ───────────────────────────────────────────────────────
const Dot = () => (
  <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%',
    background: CYAN, boxShadow:`0 0 8px ${CYAN}`, flexShrink:0 }} />
);

const SectionLabel = ({ text }: { text: string }) => (
  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
    <div style={{ width:28, height:1, background: CYAN }} />
    <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em',
      textTransform:'uppercase', color: CYAN }}>
      {text}
    </span>
  </div>
);

// ─── Scroll-progress hook ────────────────────────────────────────────────────
function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh;
      if (total <= 0) { setProgress(1); return; }
      const scrolled = Math.max(0, -rect.top);
      setProgress(Math.min(1, scrolled / total));
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, [ref]);
  return progress;
}

// ─── Intersection observer hook ──────────────────────────────────────────────
function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.2) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return inView;
}

// ─── Counter animation ───────────────────────────────────────────────────────
function AnimatedCounter({ value, suffix = '', duration = 1800 }:
  { value: number; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>, 0.5);
  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) requestAnimationFrame(tick);
    };
    tick();
  }, [inView, value, duration]);
  return <span ref={ref}>{display}{suffix}</span>;
}

// ─── Sticky scroll story section ─────────────────────────────────────────────
const STORY_STEPS = [
  {
    id: 'demand',
    label: 'Demand Forecasting',
    headline: 'Visualise future demand as a 3D landscape.',
    body: 'Our ML engine ingests your raw POS data and renders a live 3D forecast chart — granular per-SKU predictions across a 30-day horizon, updated continuously.',
    graphic: 'demand',
    accent: CYAN,
  },
  {
    id: 'gnn',
    label: 'Graph Neural Networks',
    headline: 'Map product ripple effects in real-time.',
    body: 'The GNN models cross-category relationships as a navigable 3D graph. A price shift in Electronics cascades visually across Accessories, Cables, and Batteries — instantly.',
    graphic: 'gnn',
    accent: '#818cf8',
  },
  {
    id: 'risk',
    label: 'Risk Intelligence',
    headline: 'Global supply-chain risk on a 3D globe.',
    body: 'Adversarial simulations stress-test your inventory against real-world shocks. Hotspot spikes on the globe reveal geographic risk exposure at a glance.',
    graphic: 'risk',
    accent: '#a78bfa',
  },
];

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Home() {
  const [scrollY, setScrollY]       = useState(0);
  const [mouseX, setMouseX]         = useState(0);
  const [mouseY, setMouseY]         = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const storyRef   = useRef<HTMLDivElement>(null);
  const storyProgress = useScrollProgress(storyRef as React.RefObject<HTMLElement>);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      setMouseX((e.clientX / window.innerWidth  - 0.5) * 2);
      setMouseY((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', onMouse);
    return () => window.removeEventListener('mousemove', onMouse);
  }, []);

  // Determine active story step from scroll progress
  useEffect(() => {
    const step = Math.min(STORY_STEPS.length - 1, Math.floor(storyProgress * STORY_STEPS.length));
    setActiveStep(step);
  }, [storyProgress]);

  const navActive = scrollY > 40;

  return (
    <div style={{ background: BG, color: '#e8e8f0',
      fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ══ PARTICLE CANVAS BG ══ */}
      <ParticleBackground />

      {/* ══ NAV ══════════════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top:0, left:0, right:0, zIndex:200,
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        ...pad(),
        background:    navActive ? 'rgba(6,6,16,0.85)'       : 'transparent',
        backdropFilter: navActive ? 'blur(24px) saturate(160%)' : 'none',
        borderBottom:  navActive ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 0.45s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, background:`linear-gradient(135deg,${CYAN},${INDIGO})`,
            borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 20px rgba(0,207,255,0.35)` }}>
            <TrendingUpIcon size={18} className="text-white" />
          </div>
          <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.025em', color:'#fff' }}>StockSense</span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Link href="/auth/login">
            <button className="nav-ghost-btn" style={{ background:'transparent', border:'none',
              cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:14, fontWeight:500,
              padding:'8px 18px', borderRadius:8, transition:'color 0.2s' }}>
              Sign in
            </button>
          </Link>
          <Link href="/auth/signup">
            <button className="nav-cta-btn" style={{ background:`linear-gradient(135deg,rgba(0,207,255,0.12),rgba(99,102,241,0.12))`,
              border:`1px solid rgba(0,207,255,0.22)`, borderRadius:8, cursor:'pointer',
              color: CYAN, fontSize:14, fontWeight:700, padding:'8px 22px',
              display:'flex', alignItems:'center', gap:6, transition:'all 0.25s' }}>
              Get started <ArrowRightIcon size={14} />
            </button>
          </Link>
        </div>
      </nav>

      {/* ══ HERO ═════════════════════════════════════════════════════════════ */}
      <section className="hero-grid" style={{ minHeight:'100vh', paddingTop:64, position:'relative' }}>
        {/* Grid dot background */}
        <div className="hero-grid-bg" style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:`
            linear-gradient(rgba(0,207,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,207,255,0.04) 1px, transparent 1px)`,
          backgroundSize:'56px 56px',
          maskImage:'radial-gradient(ellipse 90% 80% at 60% 40%, black 30%, transparent 100%)',
        }} />

        {/* Left: text */}
        <div className="hero-text-col" style={{
          display:'flex', flexDirection:'column', justifyContent:'center',
          paddingLeft:`max(2rem, calc((100vw - ${MAX_W}) / 2 + 2rem))`,
          paddingRight:'2.5rem', paddingTop:'4rem', paddingBottom:'4rem',
          position:'relative', zIndex:2,
        }}>
          {/* Badge */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:9,
            background:'rgba(0,207,255,0.07)', border:'1px solid rgba(0,207,255,0.18)',
            borderRadius:100, padding:'6px 16px', marginBottom:36, width:'fit-content' }}>
            <Dot />
            <span style={{ fontSize:11, fontWeight:700, color:CYAN,
              letterSpacing:'0.1em', textTransform:'uppercase' }}>
              Inventory Intelligence Platform
            </span>
          </div>

          <h1 style={{ fontSize:'clamp(44px,5.5vw,82px)', fontWeight:800,
            lineHeight:1.04, letterSpacing:'-0.035em', marginBottom:28, color:'#fff' }}>
            Predict demand
            <br />
            <span style={{ background:`linear-gradient(100deg,${CYAN} 0%,${INDIGO} 60%)`,
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
              before it moves.
            </span>
          </h1>

          <p style={{ fontSize:17, lineHeight:1.75, color:'rgba(255,255,255,0.48)',
            maxWidth:440, marginBottom:44 }}>
            Turn raw transaction data into AI-powered demand forecasts, risk alerts,
            and precise rebalancing signals — all in real-time.
          </p>

          {/* CTAs */}
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:56 }}>
            <Link href="/auth/signup">
              <button className="primary-btn" style={{
                background:`linear-gradient(135deg,${CYAN},${INDIGO})`,
                border:'none', borderRadius:10, cursor:'pointer',
                color:'#fff', fontSize:15, fontWeight:700, padding:'14px 30px',
                display:'flex', alignItems:'center', gap:8,
                boxShadow:`0 0 40px rgba(0,207,255,0.25)`, transition:'all 0.3s ease',
              }}>
                Start free trial <ArrowRightIcon size={15} />
              </button>
            </Link>
            <Link href="/auth/login">
              <button className="ghost-btn" style={{
                background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:10, cursor:'pointer', color:'rgba(255,255,255,0.65)',
                fontSize:15, fontWeight:600, padding:'14px 30px',
                display:'flex', alignItems:'center', gap:8, transition:'all 0.3s ease',
              }}>
                <ChartIcon size={16} /> View demo
              </button>
            </Link>
          </div>

          {/* Mini stats */}
          <div style={{ display:'flex', gap:40, flexWrap:'wrap' }}>
            {[{val:'94.2%',lbl:'AI accuracy'},{val:'50K+',lbl:'SKUs tracked'},{val:'24/7',lbl:'Live updates'}].map(s => (
              <div key={s.lbl}>
                <div style={{ fontSize:24, fontWeight:800, color:'#fff',
                  letterSpacing:'-0.035em', marginBottom:3 }}>{s.val}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)',
                  textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: cube */}
        <div className="hero-cube-col" style={{ position:'relative', minHeight:'100vh' }}>
          <div style={{ position:'absolute', top:'50%', left:'50%',
            transform:'translate(-50%,-50%)', width:520, height:520,
            background:`radial-gradient(circle,rgba(0,207,255,0.10) 0%,transparent 68%)`,
            borderRadius:'50%', pointerEvents:'none' }} />
          <div style={{
            transform:`rotateX(${mouseY * -4}deg) rotateY(${mouseX * 4}deg)`,
            transition:'transform 0.1s ease-out', width:'100%', height:'100%',
          }}>
            <CubeScene />
          </div>
        </div>
      </section>

      {/* ══ MARQUEE ═══════════════════════════════════════════════════════════ */}
      <div style={{ borderTop:'1px solid rgba(255,255,255,0.05)',
        borderBottom:'1px solid rgba(255,255,255,0.05)',
        padding:'18px 0', overflow:'hidden', background:'rgba(0,207,255,0.018)' }}>
        <div className="marquee-track" style={{ display:'flex', gap:48, width:'max-content' }}>
          {[...Array(4)].flatMap((_,ri) =>
            ['Real-Time Forecasting','GNN Graph Analytics','Risk Simulation',
             'Purchase Order AI','Demand Modeling','Inventory Rebalancing',
             'Adversarial Scenarios','LLM Assistant'].map(t => (
              <span key={`${ri}-${t}`} style={{
                fontSize:11, fontWeight:700, letterSpacing:'0.13em',
                textTransform:'uppercase', color:'rgba(255,255,255,0.2)',
                whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:48,
              }}>
                {t}
                <span style={{ color:'rgba(0,207,255,0.35)', fontSize:18, lineHeight:1 }}>·</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* ══ STICKY 3D STORY ══════════════════════════════════════════════════ */}
      <div ref={storyRef} style={{ position:'relative', height:'300vh' }}>
        <div style={{
          position:'sticky', top:0, height:'100vh', overflow:'hidden',
          background: BG,
        }}>

          {/* ── LEFT panel: story text ── */}
          <div style={{
            position:'absolute', top:0, left:0, width:'50%', height:'100%',
            display:'flex', flexDirection:'column', justifyContent:'center',
            paddingLeft:`max(2rem, calc((100vw - ${MAX_W}) / 2 + 2rem))`,
            paddingRight:'3rem', zIndex:3,
          }}>
            {/* Step dot indicators */}
            <div style={{ display:'flex', gap:8, marginBottom:36 }}>
              {STORY_STEPS.map((s, i) => (
                <div key={i} style={{
                  width: i === activeStep ? 32 : 8, height:8, borderRadius:100,
                  background: i === activeStep ? s.accent : 'rgba(255,255,255,0.14)',
                  transition:'all 0.45s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: i === activeStep ? `0 0 10px ${s.accent}80` : 'none',
                }} />
              ))}
            </div>

            {/* Crossfading text panels — fixed height container */}
            <div style={{ position:'relative', height:300 }}>
              {STORY_STEPS.map((s, i) => (
                <div key={s.id} style={{
                  position:'absolute', top:0, left:0, right:0,
                  opacity: i === activeStep ? 1 : 0,
                  transform: i === activeStep ? 'translateY(0px)' : 'translateY(20px)',
                  transition:'opacity 0.5s ease, transform 0.5s ease',
                  pointerEvents: i === activeStep ? 'auto' : 'none',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                    <div style={{ width:24, height:1.5, background: s.accent, borderRadius:2 }} />
                    <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em',
                      textTransform:'uppercase', color: s.accent }}>
                      {s.label}
                    </span>
                  </div>
                  <h2 style={{ fontSize:'clamp(22px,2.6vw,40px)', fontWeight:800,
                    letterSpacing:'-0.03em', color:'#fff', marginBottom:16,
                    lineHeight:1.15, maxWidth:420 }}>
                    {s.headline}
                  </h2>
                  <p style={{ fontSize:14.5, lineHeight:1.82, color:'rgba(255,255,255,0.42)',
                    maxWidth:380, marginBottom:28 }}>
                    {s.body}
                  </p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {(['ML-Powered','Real-time','30-day horizon',
                       'Cross-category','Graph neural net','Impact mapping',
                       'Adversarial sim','Global coverage','Risk scoring']
                      .slice(i * 3, i * 3 + 3))
                      .map(chip => (
                        <span key={chip} style={{
                          padding:'5px 13px', borderRadius:100,
                          background:`${s.accent}10`, border:`1px solid ${s.accent}28`,
                          fontSize:11.5, fontWeight:600, color: s.accent,
                        }}>{chip}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Horizontal progress bar */}
            <div style={{ marginTop:36, width:180, height:2,
              background:'rgba(255,255,255,0.08)', borderRadius:4, position:'relative' }}>
              <div style={{
                position:'absolute', top:0, left:0, bottom:0, borderRadius:4,
                width:`${Math.round(storyProgress * 100)}%`,
                background:`linear-gradient(90deg,${CYAN},${INDIGO})`,
                transition:'width 0.08s linear',
              }} />
            </div>
          </div>

          {/* ── RIGHT panel: all three Three.js scenes ALWAYS mounted ── */}
          {/* Width is 50% explicitly so the canvas has non-zero clientWidth  */}
          <div style={{
            position:'absolute', top:0, right:0, width:'50%', height:'100%',
            overflow:'hidden',
          }}>
            {/* Ambient glow — color shifts per step */}
            <div style={{
              position:'absolute', inset:0, pointerEvents:'none', zIndex:1,
              background:`radial-gradient(ellipse 70% 70% at 50% 50%,
                ${STORY_STEPS[activeStep].accent}0a 0%, transparent 70%)`,
              transition:'background 0.7s ease',
            }} />

            {/* Demand Chart — always in DOM */}
            <div style={{
              position:'absolute', inset:0, zIndex:2,
              opacity: activeStep === 0 ? 1 : 0,
              transition:'opacity 0.55s ease',
              pointerEvents: activeStep === 0 ? 'auto' : 'none',
            }}>
              <DemandChart progress={Math.min(1, storyProgress * 3)} />
            </div>

            {/* GNN Graph — always in DOM */}
            <div style={{
              position:'absolute', inset:0, zIndex:2,
              opacity: activeStep === 1 ? 1 : 0,
              transition:'opacity 0.55s ease',
              pointerEvents: activeStep === 1 ? 'auto' : 'none',
            }}>
              <GNNGraph />
            </div>

            {/* Risk Globe — always in DOM */}
            <div style={{
              position:'absolute', inset:0, zIndex:2,
              opacity: activeStep === 2 ? 1 : 0,
              transition:'opacity 0.55s ease',
              pointerEvents: activeStep === 2 ? 'auto' : 'none',
            }}>
              <RiskGlobe />
            </div>

            {/* Caption bar */}
            <div style={{
              position:'absolute', bottom:24, left:20, right:20, zIndex:10,
              background:'rgba(6,6,16,0.88)', backdropFilter:'blur(14px)',
              border:'1px solid rgba(255,255,255,0.07)', borderRadius:12,
              padding:'11px 18px',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <Dot />
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.42)', fontWeight:600 }}>
                {activeStep === 0 && 'Live 3D demand forecast · 12-month SKU projection'}
                {activeStep === 1 && 'GNN cross-category graph · Real-time ripple mapping'}
                {activeStep === 2 && 'Global supply-chain risk globe · Adversarial simulation'}
              </span>
              <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700,
                letterSpacing:'0.12em', color: STORY_STEPS[activeStep].accent }}>
                {activeStep + 1}&thinsp;/&thinsp;{STORY_STEPS.length}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* ══ FEATURES GRID ════════════════════════════════════════════════════ */}
      <FeaturesSection />

      {/* ══ ANIMATED METRICS ═════════════════════════════════════════════════ */}
      <MetricsSection />

      {/* ══ WORKFLOW TIMELINE ════════════════════════════════════════════════ */}
      <WorkflowSection />

      {/* ══ CTA ══════════════════════════════════════════════════════════════ */}
      <CtaSection />

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer style={{ borderTop:'1px solid rgba(255,255,255,0.05)',
        paddingTop:'2.5rem', paddingBottom:'2.5rem',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap:16, ...pad() }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{ width:26, height:26,
            background:`linear-gradient(135deg,${CYAN},${INDIGO})`, borderRadius:6 }} />
          <span style={{ fontWeight:800, fontSize:15,
            color:'rgba(255,255,255,0.45)', letterSpacing:'-0.02em' }}>StockSense</span>
        </div>
        <div style={{ display:'flex', gap:32 }}>
          {['Privacy','Terms','Contact'].map(l => (
            <span key={l} style={{ fontSize:13, color:'rgba(255,255,255,0.22)',
              cursor:'pointer', transition:'color 0.2s' }}>{l}</span>
          ))}
        </div>
        <span style={{ fontSize:13, color:'rgba(255,255,255,0.18)' }}>
          © 2026 StockSense. All rights reserved.
        </span>
      </footer>

      {/* ─── Scoped CSS ───────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        /* Prevent horizontal overflow without breaking position:sticky */
        html, body { overflow-x: clip; }

        .marquee-track {
          animation: marquee-scroll 30s linear infinite;
        }
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.3333%); }
        }

        /* Hero layout */
        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .hero-cube-col { min-height: 100vh; }

        /* hover states */
        .primary-btn:hover, .primary-btn-lg:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 56px rgba(0,207,255,0.38) !important;
        }
        .ghost-btn:hover {
          border-color: rgba(255,255,255,0.22) !important;
          color: #fff !important;
        }
        .nav-ghost-btn:hover { color: rgba(255,255,255,0.85) !important; }
        .nav-cta-btn:hover {
          background: rgba(0,207,255,0.14) !important;
          border-color: rgba(0,207,255,0.4) !important;
          box-shadow: 0 0 20px rgba(0,207,255,0.15) !important;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-cube-col { min-height: 55vh; order: -1; }
          .story-grid { grid-template-columns: 1fr !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .metrics-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 560px) {
          .metrics-grid { grid-template-columns: 1fr !important; }
        }

        /* Glow pulse */
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }

        /* Reveal animations */
        .reveal {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.7s cubic-bezier(0.4,0,0.2,1), transform 0.7s cubic-bezier(0.4,0,0.2,1);
        }
        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}

// ─── Features section ────────────────────────────────────────────────────────
function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const inView     = useInView(sectionRef as React.RefObject<HTMLElement>, 0.15);
  const [hovered, setHovered] = useState<number | null>(null);

  const FEATURES = [
    {
      icon: <ChartIcon size={22} />,
      label: 'Demand Forecasting',
      title: "See tomorrow's demand today",
      body: 'ML models trained on your own transaction data surface granular 30-day forecasts across every SKU — before stockouts happen.',
      accent: CYAN,
    },
    {
      icon: <TrendingUpIcon size={22} />,
      label: 'GNN Graph Analytics',
      title: 'Understand product ripple effects',
      body: 'A graph neural network maps cross-category relationships so a pricing event in Electronics reveals its downstream impact on Accessories.',
      accent: '#818cf8',
    },
    {
      icon: <ShieldIcon size={22} />,
      label: 'Risk Intelligence',
      title: 'Risk-weighted rebalancing',
      body: 'Adversarial simulation stress-tests your inventory against demand spikes, supply shocks, and competitive events.',
      accent: '#a78bfa',
    },
  ];

  return (
    <section
      ref={sectionRef}
      style={{ paddingTop:'7rem', paddingBottom:'7rem',
        paddingLeft:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
        paddingRight:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
      }}>
      <SectionLabel text="Capabilities" />
      <h2 style={{ fontSize:'clamp(32px,3.5vw,52px)', fontWeight:800,
        letterSpacing:'-0.03em', color:'#fff', marginBottom:60,
        lineHeight:1.1, maxWidth:640 }}>
        Everything you need to master your supply chain.
      </h2>

      <div className="features-grid" style={{ display:'grid',
        gridTemplateColumns:'repeat(3,1fr)', gap:'1px',
        background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.06)',
        borderRadius:16, overflow:'hidden' }}>
        {FEATURES.map((f, i) => (
          <div key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className={`reveal ${inView ? 'visible' : ''}`}
            style={{
              background: hovered === i ? '#0e0e1c' : '#080811',
              padding:'44px 36px', position:'relative',
              transition:'background 0.3s ease', cursor:'default',
              transitionDelay: `${i * 0.1}s`,
            }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg,transparent,${f.accent}80,transparent)`,
              opacity: hovered === i ? 1 : 0, transition:'opacity 0.3s ease' }} />
            <div style={{ width:46, height:46, borderRadius:11,
              background:`${f.accent}12`, border:`1px solid ${f.accent}28`,
              display:'flex', alignItems:'center', justifyContent:'center',
              marginBottom:26, color: f.accent, transition:'box-shadow 0.3s ease',
              boxShadow: hovered === i ? `0 0 24px ${f.accent}30` : 'none' }}>
              {f.icon}
            </div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em',
              textTransform:'uppercase', color: f.accent, marginBottom:12 }}>{f.label}</div>
            <h3 style={{ fontSize:21, fontWeight:700, letterSpacing:'-0.02em',
              color:'#fff', marginBottom:16, lineHeight:1.25 }}>{f.title}</h3>
            <p style={{ fontSize:14.5, lineHeight:1.78, color:'rgba(255,255,255,0.42)' }}>{f.body}</p>
            <div style={{ marginTop:32, display:'flex', alignItems:'center', gap:6,
              color: f.accent, fontSize:13, fontWeight:700,
              opacity: hovered === i ? 1 : 0.5, transition:'opacity 0.3s ease' }}>
              Learn more <ArrowRightIcon size={13} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Metrics section ─────────────────────────────────────────────────────────
function MetricsSection() {
  const STATS = [
    { value: 94, suffix:'%',  label:'Forecast accuracy', sub:'across all SKU categories' },
    { value: 50, suffix:'K+', label:'Products tracked',  sub:'in real-time across locations' },
    { value: 240, suffix:'%', label:'Faster rebalancing', sub:'vs manual inventory review' },
    { value: 200, suffix:'ms',label:'API latency',        sub:'for live demand queries' },
  ];

  return (
    <section style={{ paddingTop:'6rem', paddingBottom:'6rem',
      borderTop:'1px solid rgba(255,255,255,0.05)',
      borderBottom:'1px solid rgba(255,255,255,0.05)',
      position:'relative', overflow:'hidden',
      paddingLeft:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
      paddingRight:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
    }}>
      <div style={{ position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)', width:700, height:350,
        background:`radial-gradient(ellipse,rgba(0,207,255,0.06) 0%,transparent 70%)`,
        pointerEvents:'none' }} />

      <SectionLabel text="Performance" />

      <div className="metrics-grid" style={{ display:'grid',
        gridTemplateColumns:'repeat(4,1fr)', gap:48, position:'relative' }}>
        {STATS.map((s, i) => (
          <div key={i} style={{ position:'relative' }}>
            {i > 0 && <div style={{ position:'absolute', left:-24, top:'10%', bottom:'10%',
              width:1, background:'rgba(255,255,255,0.06)' }} />}
            <div style={{ fontSize:'clamp(36px,4vw,62px)', fontWeight:800,
              letterSpacing:'-0.04em', color:'#fff', marginBottom:8, lineHeight:1 }}>
              <AnimatedCounter value={s.value} suffix={s.suffix} />
            </div>
            <div style={{ fontSize:15, fontWeight:600,
              color:'rgba(255,255,255,0.72)', marginBottom:5 }}>{s.label}</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.28)' }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Workflow timeline section ────────────────────────────────────────────────
function WorkflowSection() {
  const ref    = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>, 0.1);

  const STEPS = [
    { num:'01', title:'Connect your data', body:'Plug in POS, ERP, or warehouse data via REST API or file upload. No data-science team required.',
      color: CYAN },
    { num:'02', title:'AI trains on your patterns', body:'Our ML pipeline fits forecasting models to your unique seasonal and promotional patterns within hours.',
      color: '#818cf8' },
    { num:'03', title:'Receive forecast signals', body:'30-day SKU-level demand forecasts with confidence intervals arrive in your dashboard and API.',
      color: '#a78bfa' },
    { num:'04', title:'Act on reorder alerts', body:'Risk-weighted rebalancing signals tell your team exactly which SKUs to reorder, return, or redistribute.',
      color: '#34d399' },
  ];

  return (
    <section ref={ref} style={{ paddingTop:'7rem', paddingBottom:'7rem',
      paddingLeft:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
      paddingRight:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
    }}>
      <SectionLabel text="How it works" />
      <h2 style={{ fontSize:'clamp(32px,3.5vw,52px)', fontWeight:800,
        letterSpacing:'-0.03em', color:'#fff', marginBottom:72,
        lineHeight:1.1, maxWidth:540 }}>
        From raw data to precise reorder signal — in hours.
      </h2>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:2,
        position:'relative' }}>
        {/* Connecting line */}
        <div style={{ position:'absolute', top:32, left:'6.25%', right:'6.25%',
          height:1, background:'rgba(255,255,255,0.07)', zIndex:0 }} />
        <div style={{ position:'absolute', top:32, left:'6.25%',
          width: inView ? '87.5%' : '0%', height:1,
          background:`linear-gradient(to right,${CYAN},${INDIGO})`,
          zIndex:1, transition:'width 1.8s cubic-bezier(0.4,0,0.2,1)', transitionDelay:'0.3s' }} />

        {STEPS.map((s, i) => (
          <div key={i}
            className={`reveal ${inView ? 'visible' : ''}`}
            style={{ padding:'0 24px 0 0', transitionDelay:`${i * 0.15}s`, position:'relative', zIndex:2 }}>
            <div style={{ width:64, height:64, borderRadius:'50%',
              background:`${s.color}14`, border:`1px solid ${s.color}40`,
              display:'flex', alignItems:'center', justifyContent:'center',
              marginBottom:28, boxShadow:`0 0 24px ${s.color}20` }}>
              <span style={{ fontSize:18, fontWeight:800, color: s.color }}>{s.num}</span>
            </div>
            <h3 style={{ fontSize:18, fontWeight:700, color:'#fff',
              marginBottom:12, letterSpacing:'-0.02em' }}>{s.title}</h3>
            <p style={{ fontSize:14, lineHeight:1.75, color:'rgba(255,255,255,0.38)' }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA section ─────────────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section style={{ paddingTop:'8rem', paddingBottom:'8rem', textAlign:'center',
      position:'relative', overflow:'hidden',
      paddingLeft:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
      paddingRight:`max(1.5rem, calc((100vw - 1280px) / 2 + 2rem))`,
    }}>
      <div style={{ position:'absolute', top:'50%', left:'30%',
        transform:'translate(-50%,-50%)', width:600, height:400,
        background:`radial-gradient(ellipse,rgba(99,102,241,0.08) 0%,transparent 70%)`,
        pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:'70%',
        transform:'translate(-50%,-50%)', width:400, height:400,
        background:`radial-gradient(ellipse,rgba(0,207,255,0.07) 0%,transparent 70%)`,
        pointerEvents:'none' }} />

      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em',
        textTransform:'uppercase', color: INDIGO, marginBottom:20 }}>
        Get started today
      </div>

      <h2 style={{ fontSize:'clamp(38px,5vw,70px)', fontWeight:800,
        letterSpacing:'-0.03em', color:'#fff', maxWidth:680, margin:'0 auto 24px',
        lineHeight:1.06 }}>
        Inventory decisions,
        <br />
        <span style={{ background:`linear-gradient(100deg,${CYAN},${INDIGO})`,
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          backgroundClip:'text' }}>
          powered by intelligence.
        </span>
      </h2>

      <p style={{ fontSize:17, color:'rgba(255,255,255,0.42)',
        maxWidth:460, margin:'0 auto 52px', lineHeight:1.75 }}>
        Join thousands of inventory managers replacing guesswork with AI-driven precision.
      </p>

      <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
        <Link href="/auth/signup">
          <button className="primary-btn-lg" style={{
            background:`linear-gradient(135deg,${CYAN},${INDIGO})`,
            border:'none', borderRadius:12, cursor:'pointer',
            color:'#fff', fontSize:16, fontWeight:700, padding:'16px 40px',
            display:'flex', alignItems:'center', gap:8,
            boxShadow:'0 0 48px rgba(0,207,255,0.18)', transition:'all 0.3s ease',
          }}>
            Start free trial <ArrowRightIcon size={16} />
          </button>
        </Link>
        <Link href="/auth/login">
          <button style={{ background:'transparent',
            border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, cursor:'pointer',
            color:'rgba(255,255,255,0.58)', fontSize:16, fontWeight:600,
            padding:'16px 40px', transition:'all 0.3s ease' }}>
            Sign in to dashboard
          </button>
        </Link>
      </div>

      <p style={{ marginTop:28, fontSize:13, color:'rgba(255,255,255,0.2)' }}>
        No credit card required · 14-day free trial · Cancel anytime
      </p>
    </section>
  );
}

// ─── Particle Background ─────────────────────────────────────────────────────
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight * 3; // covers whole page
    canvas.width = W;
    canvas.height = H;

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; alpha: number };
    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.1,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
    }));

    let frameId = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,207,255,${p.alpha})`;
        ctx.fill();
      });
      frameId = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      W = window.innerWidth;
      H = document.body.scrollHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(frameId); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position:'fixed', top:0, left:0, width:'100%', height:'100%',
      pointerEvents:'none', zIndex:0, opacity:0.35,
    }} />
  );
}
