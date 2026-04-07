'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUpIcon, BellIcon, ShieldIcon, LogoutIcon } from '@/components/ui/Icons';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function InteractiveScenarioAnalyst() {
  const router = useRouter();
  const [user, setUser] = useState({ id: 1, name: 'Admin User', email: 'admin@stocksense.com' });
  const handleLogout = () => {
      localStorage.removeItem('token');
      router.push('/auth/login');
  };

  const [scenario, setScenario] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const exampleScenarios = [
    "Tomorrow there will be a citywide lockdown due to health emergency",
    "Weather forecast shows heavy snowstorm for next 3 days",
    "News: 15% tax increase on all grocery items from next week",
    "Competitor store in S1 area announced closure next Monday",
    "Local festival next weekend expected to bring 50% more shoppers"
  ];

  const analyzeScenario = async () => {
    if (!scenario.trim()) {
      setError('Please enter a scenario');
      return;
    }

    console.log('Starting analysis...', scenario);
    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      console.log('Sending request to:', `${API_BASE}/llm/analyze-scenario`);
      const res = await fetch(`${API_BASE}/llm/analyze-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenario.trim() })
      });

      console.log('Response status:', res.status);

      if (res.ok) {
        const data = await res.json();
        console.log('Analysis result:', data);
        setResult(data);
      } else {
        const errData = await res.json();
        console.error('Error response:', errData);
        setError(errData.detail || errData.message || 'Analysis failed');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to connect to AI service: ${errorMessage}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const getImpactColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const getActionColor = (action: string) => {
    switch (action?.toUpperCase()) {
      case 'URGENT': return 'bg-red-100 text-red-800 border-red-300';
      case 'MODERATE': return 'bg-orange-100 text-orange-800 border-orange-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#060610', color:'#e8e8f0', fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* Nav */}
      <nav style={{ position:'sticky', top:0, zIndex:50, height:64, display:'flex', alignItems:'center', background:'rgba(6,6,16,0.85)', backdropFilter:'blur(24px) saturate(160%)', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'0 2rem' }}>
        <div style={{ maxWidth:1280, margin:'0 auto', width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:32 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, background:'linear-gradient(135deg,#00cfff,#6366f1)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(0,207,255,0.3)' }}>
                <TrendingUpIcon className="text-white" size={20} />
              </div>
              <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.025em', color:'#fff' }}>StockSense</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              {[['overview','Overview'],['purchase-orders','Purchase Orders'],['ai-scenarios','AI Scenarios'],['scenario-chat','AI Chat']].map(([tab, label]) => (
                <a key={tab} href={tab === 'overview' ? '/admin' : tab === 'ai-scenarios' ? '/admin/ai-scenarios' : tab === 'scenario-chat' ? '/admin/scenario-chat' : `/admin?tab=${tab}`}
                  style={{ padding:'6px 16px', borderRadius:8, fontSize:13, fontWeight:600, textDecoration:'none', transition:'all 0.2s',
                    background: tab === 'scenario-chat' ? 'rgba(0,207,255,0.1)' : 'transparent',
                    color: tab === 'scenario-chat' ? '#00cfff' : 'rgba(255,255,255,0.45)',
                    boxShadow: tab === 'scenario-chat' ? '0 0 0 1px rgba(0,207,255,0.2)' : 'none',
                  }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button style={{ position:'relative', padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8 }}>
                  <span style={{ color:'rgba(255,255,255,0.4)' }}><BellIcon size={18} /></span>
                  <span style={{ position:'absolute', top:8, right:8, width:6, height:6, background:'#ef4444', borderRadius:'50%' }}></span>
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#00cfff,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', boxShadow:'0 0 12px rgba(0,207,255,0.25)' }}>
                      {user.name ? user.name[0] : user.email[0].toUpperCase()}
                  </div>
                  <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{user.name || user.email}</div>
                      <div style={{ fontSize:11, color:'#00cfff', display:'flex', alignItems:'center', gap:4 }}>
                          <ShieldIcon size={9} /> Admin
                      </div>
                  </div>
              </div>
              <button onClick={handleLogout} style={{ padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8, color:'rgba(255,255,255,0.35)', transition:'color 0.2s' }}
                  onMouseEnter={e=>(e.currentTarget.style.color='#ef4444')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.35)')}>
                  <LogoutIcon size={17} />
              </button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div style={{ maxWidth:1280, margin:'0 auto', padding:'2rem 2rem' }} className="space-y-6">
      <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            Interactive Scenario Analyst
          </h1>
          <p className="text-foreground/60 mt-1">
            Describe any business scenario in plain English. AI will analyze your database and calculate exact impact on your stores.
          </p>
        </div>
      </div>

      {/* Input Section */}
      <Card glass>
        <h2 className="text-lg font-semibold mb-4">Describe Your Scenario</h2>

        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="Example: Tomorrow there will be a lockdown..."
          className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-4 py-3 min-h-[140px] outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
          disabled={analyzing}
        />

        <div className="mt-4 flex gap-3">
          <button 
            type="button"
            onClick={analyzeScenario}
            disabled={analyzing || !scenario.trim()}
            style={{ opacity: analyzing || !scenario.trim() ? 0.5 : 1, whiteSpace:'nowrap', height:42, padding:'0 24px', borderRadius:10, fontSize:14, fontWeight:700, border:'none', background: 'linear-gradient(135deg, #00cfff, #6366f1)', color:'#fff', cursor: analyzing || !scenario.trim() ? 'not-allowed' : 'pointer', boxShadow: analyzing || !scenario.trim() ? 'none' : '0 0 16px rgba(0,207,255,0.3)', transition:'all 0.2s' }}
            onMouseEnter={e=>{ if(!(analyzing || !scenario.trim())) { e.currentTarget.style.boxShadow='0 0 24px rgba(0,207,255,0.4)'; e.currentTarget.style.transform='translateY(-1px)' } }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow=analyzing || !scenario.trim() ? 'none' : '0 0 16px rgba(0,207,255,0.3)'; e.currentTarget.style.transform='translateY(0)' }}
          >
            {analyzing ? 'Analyzing with AI...' : 'Analyze Impact'}
          </button>
          <button
            type="button"
            onClick={() => setScenario('')}
            disabled={analyzing}
            style={{ whiteSpace:'nowrap', height:42, padding:'0 20px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', cursor: analyzing ? 'not-allowed' : 'pointer', transition:'all 0.2s' }}
            onMouseEnter={e=> { if(!analyzing) { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' } }}
            onMouseLeave={e=> { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
          >
            Clear
          </button>
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground/60 mb-2">Try these examples:</p>
          <div className="space-y-2">
            {exampleScenarios.map((ex, idx) => (
              <button
                key={idx}
                onClick={() => setScenario(ex)}
                className="block w-full text-left text-sm text-foreground/50 hover:text-primary hover:bg-white/5 p-2 rounded transition-smooth"
                disabled={analyzing}
              >
                "{ex}"
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="bg-error/10 border-error/20">
          <p className="text-error">{error}</p>
        </Card>
      )}

      {/* Results Display */}
      {result && result.status === 'success' && (
        <Card glass className="border-primary/20 bg-primary/5">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <TrendingUpIcon size={24} className="text-primary" />
            AI Analysis
          </h2>

          <div className="prose prose-invert max-w-none">
            <div className="text-foreground/80 whitespace-pre-wrap leading-relaxed text-base">
              {result.analysis?.scenario_summary || result.analysis?.raw_response || 'No analysis available'}
            </div>
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}
