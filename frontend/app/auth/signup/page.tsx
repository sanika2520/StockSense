'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TrendingUpIcon } from '@/components/ui/Icons';
import api from '@/lib/api';

const CYAN   = '#00cfff';
const INDIGO = '#6366f1';
const BG     = '#060610';

// ── Particle canvas ──────────────────────────────────────────────────────────
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    type P = { x:number; y:number; vx:number; vy:number; r:number; a:number };
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.35 + 0.08,
    }));
    let id = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,207,255,${p.a})`;
        ctx.fill();
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0, opacity: 0.4,
    }} />
  );
}

// ── Dot indicator ─────────────────────────────────────────────────────────────
const Dot = () => (
  <span style={{
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: CYAN, boxShadow: `0 0 8px ${CYAN}`, flexShrink: 0,
  }} />
);

// ── Shared input style helper ─────────────────────────────────────────────────
const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: '100%', padding: '13px 14px 13px 40px',
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${hasError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.09)'}`,
  borderRadius: 10, color: '#e8e8f0', fontSize: 14, outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  fontFamily: 'inherit',
});

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'Analyst' });
  const [errors, setErrors]     = useState<{ name?: string; email?: string; password?: string; general?: string }>({});
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [mounted, setMounted]   = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = CYAN + '55';
    e.target.style.boxShadow   = '0 0 0 3px rgba(0,207,255,0.08)';
  };
  const onBlur = (hasError: boolean) => (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = hasError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.09)';
    e.target.style.boxShadow   = 'none';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErrors({});

    const newErrors: { name?: string; email?: string; password?: string } = {};
    if (!formData.name)     newErrors.name     = 'Name is required';
    if (!formData.email)    newErrors.email    = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (formData.password && formData.password.length < 6)
      newErrors.password = 'Password must be at least 6 characters';

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); setLoading(false); return; }

    try {
      const response = await api.signup({
        name: formData.name, email: formData.email,
        password: formData.password, role: formData.role,
      });
      localStorage.setItem('user', JSON.stringify({
        id: response.id, name: response.name,
        email: response.email, role: response.role.toLowerCase(),
      }));
      router.push('/dashboard');
    } catch (error: any) {
      setErrors({ general: error.message || 'An error occurred during signup. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.80)', marginBottom: 8,
  };

  const iconStyle: React.CSSProperties = {
    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
    color: 'rgba(255,255,255,0.25)', fontSize: 15, pointerEvents: 'none',
  };

  return (
    <div style={{
      minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem', position: 'relative', overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif", color: '#e8e8f0',
    }}>

      <ParticleBackground />

      {/* Ambient glows — position:absolute so they don't bleed across routes */}
      <div style={{ position: 'absolute', top: '20%', left: '15%', width: 420, height: 420,
        borderRadius: '50%', background: `radial-gradient(circle, rgba(0,207,255,0.07) 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: '15%', right: '10%', width: 500, height: 500,
        borderRadius: '50%', background: `radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0 }} />

      {/* Dot-grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(rgba(0,207,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,207,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
      }} />

      {/* Back to home */}
      <Link href="/" style={{
        position: 'fixed', top: 24, left: 28, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.35)',
        textDecoration: 'none', transition: 'color 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
        ← Back to home
      </Link>

      {/* Card wrapper */}
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 428,
        opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>

        {/* Glass card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20, padding: '44px 40px',
          boxShadow: `0 0 0 1px rgba(0,207,255,0.04), 0 32px 64px rgba(0,0,0,0.5)`,
          position: 'relative',
        }}>

          {/* Top glow line */}
          <div style={{
            position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
            background: `linear-gradient(90deg, transparent, ${CYAN}60, transparent)`,
            borderRadius: 1,
          }} />

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{
              width: 40, height: 40,
              background: `linear-gradient(135deg, ${CYAN}, ${INDIGO})`,
              borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 24px rgba(0,207,255,0.3)`,
            }}>
              <TrendingUpIcon size={20} className="text-white" />
            </div>
            <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.025em', color: '#fff' }}>
              StockSense
            </span>
          </div>

          {/* Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(0,207,255,0.06)', border: '1px solid rgba(0,207,255,0.16)',
              borderRadius: 100, padding: '5px 14px',
            }}>
              <Dot />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: CYAN }}>
                Create Account
              </span>
            </div>
          </div>

          {/* Heading */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 8 }}>
              Get started
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
              Join StockSense and master your supply chain
            </p>
          </div>

          {/* General error */}
          {errors.general && (
            <div style={{
              marginBottom: 20, padding: '12px 16px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ color: '#f87171', fontSize: 13 }}>⚠ {errors.general}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Full Name */}
            <div>
              <label style={labelStyle}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <span style={iconStyle}>👤</span>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  disabled={loading}
                  style={inputStyle(!!errors.name)}
                  onFocus={onFocus}
                  onBlur={onBlur(!!errors.name)}
                />
              </div>
              {errors.name && <p style={{ fontSize: 12, color: '#f87171', marginTop: 5 }}>{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <span style={iconStyle}>✉</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  disabled={loading}
                  style={inputStyle(!!errors.email)}
                  onFocus={onFocus}
                  onBlur={onBlur(!!errors.email)}
                />
              </div>
              {errors.email && <p style={{ fontSize: 12, color: '#f87171', marginTop: 5 }}>{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={iconStyle}>🔒</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  disabled={loading}
                  style={{ ...inputStyle(!!errors.password), paddingRight: 44 }}
                  onFocus={onFocus}
                  onBlur={onBlur(!!errors.password)}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.28)', fontSize: 13, padding: 2,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
              {errors.password && <p style={{ fontSize: 12, color: '#f87171', marginTop: 5 }}>{errors.password}</p>}
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role</label>
              <div style={{ position: 'relative' }}>
                <span style={iconStyle}>💼</span>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '13px 14px 13px 40px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 10, color: '#e8e8f0', fontSize: 14, outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit', cursor: 'pointer',
                    appearance: 'none', WebkitAppearance: 'none',
                  }}
                  onFocus={onFocus}
                  onBlur={onBlur(false)}>
                  <option value="Analyst"  style={{ background: '#0d0d1a' }}>Analyst</option>
                  <option value="Manager"  style={{ background: '#0d0d1a' }}>Manager</option>
                  <option value="Admin"    style={{ background: '#0d0d1a' }}>Admin</option>
                </select>
                {/* Dropdown arrow */}
                <span style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.28)', pointerEvents: 'none', fontSize: 12,
                }}>▼</span>
              </div>
            </div>

            {/* Terms */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input type="checkbox" required
                style={{ width: 15, height: 15, marginTop: 2, accentColor: CYAN, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                I agree to the{' '}
                <a href="#" style={{ color: CYAN, fontWeight: 600, textDecoration: 'none' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="#" style={{ color: CYAN, fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</a>
              </span>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading
                  ? 'rgba(0,207,255,0.15)'
                  : `linear-gradient(135deg, ${CYAN}, ${INDIGO})`,
                border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
                color: '#fff', fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : `0 0 36px rgba(0,207,255,0.22)`,
                transition: 'all 0.3s ease', marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 0 52px rgba(0,207,255,0.35)`; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = loading ? 'none' : `0 0 36px rgba(0,207,255,0.22)`; }}>
              {loading ? (
                <>
                  <span style={{
                    width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin 0.8s linear infinite',
                  }} />
                  Creating Account...
                </>
              ) : 'Create Account →'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          </div>

          {/* Sign in link */}
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{
              color: CYAN, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Sign in
            </Link>
          </p>
        </div>

        {/* Backend hint */}
        <div style={{
          marginTop: 20, padding: '12px 18px',
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)',
          borderRadius: 12, textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
            Backend must be running on{' '}
            <code style={{ color: 'rgba(0,207,255,0.6)', fontFamily: 'monospace' }}>localhost:8000</code>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.18); }
        input:-webkit-autofill, select:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #0d0d1a inset !important;
          -webkit-text-fill-color: #e8e8f0 !important;
        }
      `}</style>
    </div>
  );
}
