'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUpIcon, BellIcon, ShieldIcon, LogoutIcon } from '@/components/ui/Icons';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Scenario {
  id: string;
  name: string;
  description: string;
  demand_multiplier: number;
  duration_days: number;
  affected_categories: string[];
  probability: number;
  strategies: string[];
  priority_level: string;
}

interface ScenarioResult {
  name: string;
  records_tested: number;
  stockout_count: number;
  stockout_rate: number;
  avg_risk_score: number;
  probability: number;
  strategies: string[];
}

export default function AIScenarioTester() {
  const router = useRouter();
  const [user, setUser] = useState({ id: 1, name: 'Admin User', email: 'admin@stocksense.com' });
  
  const handleLogout = () => {
      localStorage.removeItem('token');
      router.push('/auth/login');
  };

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [scenarioOverrides, setScenarioOverrides] = useState<Record<string, Scenario>>({});
  const [deletedScenarioIds, setDeletedScenarioIds] = useState<string[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [useAI, setUseAI] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [categoryScoped, setCategoryScoped] = useState(true);
  const [showCustomScenarioModal, setShowCustomScenarioModal] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [customScenarioForm, setCustomScenarioForm] = useState({
    name: '',
    description: '',
    demand_multiplier: 2,
    duration_days: 7,
    affected_categories: 'All',
    probability: 0.5,
    strategies: 'Increase safety stock|Pre-negotiate supplier capacity|Monitor sell-through daily',
    priority_level: 'medium',
  });

  const baseScenarios = scenarios
    .filter((scenario) => !deletedScenarioIds.includes(scenario.id))
    .map((scenario) => scenarioOverrides[scenario.id] || scenario);

  const allScenarios = [...baseScenarios, ...customScenarios];

  const authFetch = (endpoint: string, options: RequestInit = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  };

  // Load available scenarios
  useEffect(() => {
    fetchScenarios(false);
  }, []);

  const applyScenarioSelection = (data: Scenario[]) => {
    const topScenarios = [...data]
      .sort((a: Scenario, b: Scenario) => b.probability - a.probability)
      .slice(0, 3)
      .map((s: Scenario) => s.id);

    setSelectedScenarios((prev) => {
      const preserved = prev.filter((id) => id.startsWith('custom_') || Boolean(scenarioOverrides[id]));
      const merged = [...topScenarios, ...preserved].filter((id) => !deletedScenarioIds.includes(id));
      return Array.from(new Set(merged));
    });
  };

  const fetchStandardScenariosFallback = async () => {
    const standardRes = await authFetch('/adversarial/scenarios?use_ai=false');
    if (!standardRes.ok) {
      throw new Error('Unable to load fallback scenarios');
    }
    const standardData = await standardRes.json();
    setScenarios(standardData);
    applyScenarioSelection(standardData);
    setUseAI(false);
  };

  const fetchScenarios = async (aiMode: boolean) => {
    setLoadingAI(true);
    setError('');

    const controller = new AbortController();
    const timeoutMs = aiMode ? 120000 : 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await authFetch(`/adversarial/scenarios?use_ai=${aiMode}`, {
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        setScenarios(data);
        applyScenarioSelection(data);
        setUseAI(aiMode);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (aiMode) {
          await fetchStandardScenariosFallback();
          setError(errData.detail || 'AI scenario generation is unavailable right now. Loaded standard scenarios instead.');
        } else {
          setScenarios([]);
          setSelectedScenarios((prev) => prev.filter((id) => id.startsWith('custom_') || Boolean(scenarioOverrides[id])));
          setError(errData.detail || 'Failed to load scenarios');
        }
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';

      if (aiMode) {
        try {
          await fetchStandardScenariosFallback();
          setError(isAbort
            ? 'AI scenario generation timed out after 120s. Loaded standard scenarios instead. Ensure Ollama + qwen2.5:7b are running for AI mode.'
            : 'Failed to load AI scenarios. Loaded standard scenarios instead.');
        } catch {
          setScenarios([]);
          setSelectedScenarios((prev) => prev.filter((id) => id.startsWith('custom_') || Boolean(scenarioOverrides[id])));
          setError(isAbort
            ? 'AI scenario generation timed out after 120s and fallback failed. Check backend logs and Ollama status.'
            : 'Failed to load scenarios');
        }
      } else {
        setScenarios([]);
        setSelectedScenarios((prev) => prev.filter((id) => id.startsWith('custom_') || Boolean(scenarioOverrides[id])));
        setError('Failed to load scenarios');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoadingAI(false);
    }
  };

  const toggleScenario = (scenarioId: string) => {
    setSelectedScenarios((prev) =>
      prev.includes(scenarioId)
        ? prev.filter((id) => id !== scenarioId)
        : [...prev, scenarioId]
    );
  };

  const logScenarioActivity = async (
    action: 'created' | 'updated' | 'deleted',
    scenario: Pick<Scenario, 'id' | 'name'>,
    details?: Record<string, unknown>
  ) => {
    try {
      await authFetch('/adversarial/scenario-activity', {
        method: 'POST',
        body: JSON.stringify({
          action,
          scenario_id: scenario.id,
          scenario_name: scenario.name,
          details,
        }),
      });
    } catch (activityError) {
      // Do not block core UX if audit logging fails.
      console.warn('Failed to log scenario activity:', activityError);
    }
  };

  const saveScenarioFromForm = () => {
    if (!customScenarioForm.name.trim()) {
      setError('Custom scenario name is required');
      return;
    }

    const scenarioId = editingScenarioId || `custom_${Date.now()}`;
    const affectedCategories = customScenarioForm.affected_categories
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const strategies = customScenarioForm.strategies
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);

    const scenarioPayload: Scenario = {
      id: scenarioId,
      name: customScenarioForm.name.trim(),
      description: customScenarioForm.description.trim() || 'Custom user-defined scenario',
      demand_multiplier: Number(customScenarioForm.demand_multiplier),
      duration_days: Number(customScenarioForm.duration_days),
      affected_categories: affectedCategories.length > 0 ? affectedCategories : ['All'],
      probability: Number(customScenarioForm.probability),
      strategies: strategies.length > 0 ? strategies : ['Review inventory and supplier capacity'],
      priority_level: customScenarioForm.priority_level,
    };

    const isEdit = Boolean(editingScenarioId);
    const sourceType = scenarioId.startsWith('custom_') ? 'custom' : 'override';

    if (scenarioId.startsWith('custom_')) {
      setCustomScenarios((prev) => {
        const existing = prev.some((item) => item.id === scenarioId);
        if (existing) {
          return prev.map((item) => (item.id === scenarioId ? scenarioPayload : item));
        }
        return [...prev, scenarioPayload];
      });
    } else {
      setScenarioOverrides((prev) => ({ ...prev, [scenarioId]: scenarioPayload }));
      setDeletedScenarioIds((prev) => prev.filter((id) => id !== scenarioId));
    }

    void logScenarioActivity(
      isEdit ? 'updated' : 'created',
      { id: scenarioPayload.id, name: scenarioPayload.name },
      { source: sourceType }
    );

    setSelectedScenarios((prev) => (prev.includes(scenarioId) ? prev : [...prev, scenarioId]));
    setShowCustomScenarioModal(false);
    setEditingScenarioId(null);
    setError('');
    setCustomScenarioForm({
      name: '',
      description: '',
      demand_multiplier: 2,
      duration_days: 7,
      affected_categories: 'All',
      probability: 0.5,
      strategies: 'Increase safety stock|Pre-negotiate supplier capacity|Monitor sell-through daily',
      priority_level: 'medium',
    });
  };

  const openScenarioEditor = (scenario: Scenario) => {
    setEditingScenarioId(scenario.id);
    setCustomScenarioForm({
      name: scenario.name,
      description: scenario.description,
      demand_multiplier: scenario.demand_multiplier,
      duration_days: scenario.duration_days,
      affected_categories: scenario.affected_categories.join(', '),
      probability: scenario.probability,
      strategies: scenario.strategies.join('|'),
      priority_level: scenario.priority_level,
    });
    setShowCustomScenarioModal(true);
  };

  const deleteScenario = (scenarioId: string) => {
    const existingScenario = allScenarios.find((scenario) => scenario.id === scenarioId);

    setSelectedScenarios((prev) => prev.filter((id) => id !== scenarioId));

    if (scenarioId.startsWith('custom_')) {
      setCustomScenarios((prev) => prev.filter((scenario) => scenario.id !== scenarioId));
      return;
    }

    setDeletedScenarioIds((prev) => (prev.includes(scenarioId) ? prev : [...prev, scenarioId]));
    setScenarioOverrides((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });

    if (existingScenario) {
      const sourceType = scenarioId.startsWith('custom_') ? 'custom' : 'override';
      void logScenarioActivity(
        'deleted',
        { id: existingScenario.id, name: existingScenario.name },
        { source: sourceType }
      );
    }
  };

  const runAITest = async () => {
    setLoading(true);
    setError('');
    setResults(null);

    const selectedScenarioIds = new Set(selectedScenarios);
    const selectedScenarioPayload = allScenarios.filter((scenario) => selectedScenarioIds.has(scenario.id));

    try {
      const res = await authFetch('/adversarial/run-ai-test', {
        method: 'POST',
        body: JSON.stringify({
          scenario_ids: selectedScenarios.length > 0 ? selectedScenarios : null,
          category_scoped: categoryScoped,
          custom_scenarios: selectedScenarioPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        const errData = await res.json();
        setError(errData.detail || 'Test failed');
      }
    } catch (err) {
      setError('Failed to run AI test');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-error bg-error/10 border border-error/20';
      case 'high':
        return 'text-warning bg-warning/10 border border-warning/20';
      case 'medium':
        return 'text-info bg-info/10 border border-info/20';
      default:
        return 'text-info bg-info/10 border border-info/20';
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
                    background: tab === 'ai-scenarios' ? 'rgba(0,207,255,0.1)' : 'transparent',
                    color: tab === 'ai-scenarios' ? '#00cfff' : 'rgba(255,255,255,0.45)',
                    boxShadow: tab === 'ai-scenarios' ? '0 0 0 1px rgba(0,207,255,0.2)' : 'none',
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
            AI Adversarial Scenario Tester
          </h1>
          <p className="text-foreground/60 mt-1">
            Intelligent stress testing with realistic scenarios and strategic recommendations
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => fetchScenarios(!useAI)}
            disabled={loadingAI}
            style={{ whiteSpace:'nowrap', height:44, padding:'0 20px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', cursor: loadingAI ? 'not-allowed':'pointer', transition:'all 0.2s', backdropFilter:'blur(10px)' }}
            onMouseEnter={e=>{ if(!loadingAI) { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' } }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
          >
            {loadingAI ? 'Analyzing...' : useAI ? 'Use Standard Scenarios' : 'Use AI-Generated Scenarios'}
          </button>
          <button
            onClick={() => setCategoryScoped((prev) => !prev)}
            style={{ whiteSpace:'nowrap', height:44, padding:'0 20px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', cursor:'pointer', transition:'all 0.2s', backdropFilter:'blur(10px)' }}
            onMouseEnter={e=> { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' }}
            onMouseLeave={e=> { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
          >
            {categoryScoped ? 'Strict Categories' : 'Broad Scope'}
          </button>
          <button
            onClick={() => setShowCustomScenarioModal(true)}
            style={{ whiteSpace:'nowrap', height:44, padding:'0 20px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', cursor:'pointer', transition:'all 0.2s', backdropFilter:'blur(10px)' }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(0,207,255,0.4)' }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
          >
            + Add Custom Scenario
          </button>
          <button
            onClick={runAITest}
            disabled={loading || selectedScenarios.length === 0}
            style={{ whiteSpace:'nowrap', height:44, padding:'0 24px', borderRadius:10, fontSize:14, fontWeight:700, border:'none', background: loading || selectedScenarios.length === 0 ? 'rgba(0,207,255,0.15)' : 'linear-gradient(135deg, #00cfff, #6366f1)', color:'#fff', cursor: loading || selectedScenarios.length === 0 ? 'not-allowed' : 'pointer', boxShadow: loading || selectedScenarios.length === 0 ? 'none' : '0 0 20px rgba(0,207,255,0.3)', transition:'all 0.2s' }}
            onMouseEnter={e=>{ if(!loading && selectedScenarios.length > 0) { e.currentTarget.style.boxShadow='0 0 24px rgba(0,207,255,0.5)'; e.currentTarget.style.transform='translateY(-1px)' } }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow=loading || selectedScenarios.length === 0 ?'none':'0 0 20px rgba(0,207,255,0.3)'; e.currentTarget.style.transform='translateY(0)' }}
          >
            {loading ? 'Running...' : `Run ${selectedScenarios.length} Scenarios`}
          </button>
        </div>
      </div>

      {useAI && (
        <Card className="bg-[rgba(0,207,255,0.05)] border border-[rgba(0,207,255,0.15)] rounded-[12px]">
          <p className="text-sm" style={{ color:'#00cfff' }}>
            <strong>AI Mode Active:</strong> Scenarios generated by AI based on YOUR actual database patterns (last 30 days demand, volatility, inventory levels)
          </p>
        </Card>
      )}

      {error && (
        <Card className="bg-error/10 border-error/20">
          <p className="text-error">{error}</p>
        </Card>
      )}

      {/* Scenario Selection */}
      <Card glass>
        <h2 className="text-lg font-semibold mb-4">Select Scenarios to Test</h2>
        <p className="text-sm text-foreground/60 mb-4">
          Choose which scenarios to simulate. Each scenario represents a different business risk.
        </p>
        <p className="text-xs text-foreground/50 mb-4">
          Scope mode: {categoryScoped
            ? 'Strict Categories (only SKU/store pairs matching scenario categories are tested)'
            : 'Broad Scope (all SKU/store pairs are tested for each scenario)'}
        </p>

        <div className="space-y-3">
          {allScenarios.map((scenario) => (
            <div
              key={scenario.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all duration-300 relative overflow-hidden ${selectedScenarios.includes(scenario.id)
                ? 'border-primary/20 bg-primary/5 z-10'
                : 'border-white/10 hover:border-white/20 bg-white/5 hover:translate-x-1'
                }`}
              onClick={() => toggleScenario(scenario.id)}
            >
              {selectedScenarios.includes(scenario.id) && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(0,207,255,0.5)]" />
              )}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario.id)}
                      onChange={() => { }}
                      className="w-4 h-4 rounded border-primary/50 text-primary bg-white/5 focus:ring-primary accent-primary cursor-pointer"
                    />
                    <h3 className="font-semibold text-foreground">{scenario.name}</h3>
                    {scenario.id.startsWith('custom_') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">
                        CUSTOM
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPriorityColor(
                        scenario.priority_level
                      )}`}
                    >
                      {scenario.priority_level.toUpperCase()}
                    </span>
                    <span className="text-sm text-foreground/50">
                      {(scenario.probability * 100).toFixed(0)}% probability
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openScenarioEditor(scenario);
                        }}
                        className="text-xs px-2 py-1 rounded border border-white/15 bg-white/5 hover:bg-white/10"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteScenario(scenario.id);
                        }}
                        className="text-xs px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-foreground/80 mb-2">{scenario.description}</p>

                  <div className="flex gap-4 text-xs text-foreground/60 mb-2">
                    <span className="flex items-center gap-1">{scenario.demand_multiplier}× demand spike</span>
                    <span className="flex items-center gap-1">{scenario.duration_days} days</span>
                    <span className="flex items-center gap-1">
                      {scenario.affected_categories.join(', ') || 'All categories'}
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className="text-xs font-semibold text-foreground/70 mb-1">
                      Recommended Strategies:
                    </p>
                    <ul className="text-xs text-foreground/50 space-y-1">
                      {scenario.strategies.slice(0, 3).map((strategy, idx) => (
                        <li key={idx}>• {strategy}</li>
                      ))}
                      {scenario.strategies.length > 3 && (
                        <li className="text-foreground/30">
                          + {scenario.strategies.length - 3} more...
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loadingAI && allScenarios.length === 0 && (
            <div className="text-sm text-foreground/70 bg-white/5 border border-white/10 rounded-lg p-4">
              No scenarios loaded. Ensure you are logged in and the backend is reachable, then click Use AI-Generated Scenarios or refresh the page.
            </div>
          )}
        </div>
      </Card>

      {showCustomScenarioModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomScenarioModal(false)}>
          <div style={{ background: 'rgba(6,6,16,0.7)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.08)' }} className="w-full max-w-2xl rounded-[16px] p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">{editingScenarioId ? 'Edit Scenario' : 'Add Custom Scenario'}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-foreground/70">Name</label>
                <input
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.name}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Weekend Festival Surge"
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70">Priority</label>
                <select
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.priority_level}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, priority_level: e.target.value }))}
                >
                  <option value="critical" style={{ background: '#0d0d1a' }}>critical</option>
                  <option value="high" style={{ background: '#0d0d1a' }}>high</option>
                  <option value="medium" style={{ background: '#0d0d1a' }}>medium</option>
                  <option value="low" style={{ background: '#0d0d1a' }}>low</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-foreground/70">Description</label>
                <textarea
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 min-h-20 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.description}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the business event and expected impact"
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70">Demand Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="20"
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.demand_multiplier}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, demand_multiplier: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70">Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.duration_days}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, duration_days: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70">Probability (0-1)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.probability}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, probability: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70">Affected Categories (comma separated)</label>
                <input
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.affected_categories}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, affected_categories: e.target.value }))}
                  placeholder="Fresh Produce, Bakery"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-foreground/70">Strategies (separate with |)</label>
                <input
                  className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all"
                  value={customScenarioForm.strategies}
                  onChange={(e) => setCustomScenarioForm((prev) => ({ ...prev, strategies: e.target.value }))}
                  placeholder="Increase stock|Add backup supplier|Set alert thresholds"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCustomScenarioModal(false);
                  setEditingScenarioId(null);
                }}
                style={{ whiteSpace:'nowrap', height:42, padding:'0 20px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', cursor:'pointer', transition:'all 0.2s' }}
                onMouseEnter={e=> { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' }}
                onMouseLeave={e=> { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={saveScenarioFromForm}
                style={{ whiteSpace:'nowrap', height:42, padding:'0 24px', borderRadius:10, fontSize:14, fontWeight:700, border:'none', background: 'linear-gradient(135deg, #00cfff, #6366f1)', color:'#fff', cursor: 'pointer', boxShadow: '0 0 16px rgba(0,207,255,0.3)', transition:'all 0.2s' }}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 0 24px rgba(0,207,255,0.4)'; e.currentTarget.style.transform='translateY(-1px)' }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 0 16px rgba(0,207,255,0.3)'; e.currentTarget.style.transform='translateY(0)' }}
              >
                {editingScenarioId ? 'Save Changes' : 'Add Scenario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {results && (
        <Card glass className="border-success/20">
          <h2 className="text-lg font-semibold mb-4 text-success">
            Testing Complete
          </h2>
          <p className="text-xs text-foreground/60 mb-4">
            Result scope: {results.scope_mode === 'broad' ? 'Broad Scope' : 'Strict Categories'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
              <p className="text-2xl font-bold text-info">
                {results.scenarios_tested}
              </p>
              <p className="text-xs text-foreground/60 uppercase tracking-wider mt-1">Scenarios Tested</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
              <p className="text-2xl font-bold text-accent">
                {results.total_records}
              </p>
              <p className="text-xs text-foreground/60 uppercase tracking-wider mt-1">Risk Assessments</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
              <p className="text-lg font-bold text-error truncate">
                {results.most_critical_scenario?.name || 'N/A'}
              </p>
              <p className="text-xs text-foreground/60 uppercase tracking-wider mt-1">Most Critical</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Results by Scenario</h3>
            {Object.entries(results.results_by_scenario || {}).map(
              ([scenarioId, result]: [string, any]) => (
                <div key={scenarioId} className="bg-white/5 p-4 rounded border border-white/5">
                  <h4 className="font-semibold mb-2">{result.name}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-foreground/50">Stockout Rate:</span>
                      <p className="font-semibold text-error text-lg">
                        {(result.stockout_rate * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <span className="text-foreground/50">Records Tested:</span>
                      <p className="font-semibold text-lg">{result.records_tested}</p>
                    </div>
                    <div>
                      <span className="text-foreground/50">Avg Risk Score:</span>
                      <p className="font-semibold text-lg">{result.avg_risk_score.toFixed(3)}</p>
                    </div>
                    <div>
                      <span className="text-foreground/50">Probability:</span>
                      <p className="font-semibold text-lg text-success">
                        {(result.probability * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-foreground/70 mb-1">
                      Top Strategies:
                    </p>
                    <ul className="text-xs text-foreground/50 space-y-1">
                      {result.strategies.slice(0, 3).map((strategy: string, idx: number) => (
                        <li key={idx}>· {strategy}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            )}
          </div>
        </Card>
      )}
    </div>
    </div>
  );
}
