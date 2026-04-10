
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Toast from '@/components/ui/Toast';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';
import {
    TrendingUpIcon,
    TrendingDownIcon,
    ChartIcon,
    UserIcon,
    LogoutIcon,
    BellIcon,
    SearchIcon,
    ActivityIcon,
    AlertIcon,
    CheckIcon,
    DatabaseIcon,
    RefreshIcon,
    CalendarIcon,
    ShieldIcon,
} from '@/components/ui/Icons';
import AnalysisView from './components/AnalysisView';
import ProductAccuracyTable from './components/ProductAccuracyTable';
import AccuracySummaryCard from './components/AccuracySummaryCard';
import GNN3DVisualizer from './components/GNN3DVisualizer';
import ChatPanel from '@/components/ui/ChatPanel';

interface User {
    id?: number;
    name?: string;
    email: string;
    role: string;
    store_id?: string | null;
}

interface ModelMetric {
    model: string;
    type: string;
    mae: number;
    mape: number;
    wape: number;
    status: string;
    trained_at: string;
    epochs: number;
}

interface ModelMetricsResponse {
    models: ModelMetric[];
    active_model: ModelMetric | null;
    total_models: number;
}

interface ForecastAnomaly {
    product_id: string;
    avg_demand: number;
    mape: number;
    wape: number;
    reasons: string[];
    severity_score: number;
}

interface AnomaliesSummaryResponse {
    total_products: number;
    anomaly_count: number;
    thresholds: {
        percentile: number;
        mape: number;
        wape: number;
    };
    top_anomalies: ForecastAnomaly[];
    generated_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const getAuthHeaders = (): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AnalystDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedModel, setSelectedModel] = useState('TFT v2.1');
    const [modelMetrics, setModelMetrics] = useState<ModelMetric[]>([]);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
    const [simulationResults, setSimulationResults] = useState<any[]>([]);
    const [simulationLoading, setSimulationLoading] = useState(false);
    const [customScenario, setCustomScenario] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [gnnStats, setGnnStats] = useState<{ nodes: number; edges: number } | null>(null);
    const [stockoutCount, setStockoutCount] = useState<number | null>(null);
    const [anomalies, setAnomalies] = useState<AnomaliesSummaryResponse | null>(null);
    const [anomaliesLoading, setAnomaliesLoading] = useState(false);
    const [showAllAnomalies, setShowAllAnomalies] = useState(false);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!userData) {
            router.push('/auth/login');
            return;
        }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'analyst') {
            if (parsed.role === 'admin') {
                router.push('/admin');
            } else if (parsed.role === 'manager') {
                router.push('/manager');
            }
            return;
        }
        setUser(parsed);
        setLoading(false);

        fetchModelMetrics();
        fetchGNNStats();
        fetchStockoutCount();
        fetchAnomaliesSummary();
    }, [router]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showExportMenu) {
                const target = event.target as HTMLElement;
                if (!target.closest('.export-menu-container')) {
                    setShowExportMenu(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showExportMenu]);

    const fetchStockoutCount = async () => {
        try {
            const response = await fetch(`${API_URL}/adversarial/?high_risk_only=true`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const data = await response.json();
                const uniqueSkus = new Set(data.map((r: any) => r.sku));
                setStockoutCount(uniqueSkus.size);
            }
        } catch (error) {
            console.error('Error fetching stockout count:', error);
        }
    };

    const fetchGNNStats = async () => {
        try {
            const response = await fetch(`${API_URL}/gnn/graph-statistics`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const data = await response.json();
                setGnnStats({ nodes: data.nodes, edges: data.edges });
            }
        } catch (error) {
            console.error('Error fetching GNN stats:', error);
        }
    };

    const fetchModelMetrics = async () => {
        setMetricsLoading(true);
        try {
            const response = await fetch(`${API_URL}/analytics/model-metrics`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const data: ModelMetricsResponse = await response.json();
                setModelMetrics(data.models);
                if (data.active_model) {
                    setSelectedModel(data.active_model.model);
                }
            }
        } catch (error) {
            console.error('Error fetching model metrics:', error);
        } finally {
            setMetricsLoading(false);
        }
    };

    const fetchAnomaliesSummary = async () => {
        setAnomaliesLoading(true);
        try {
            const response = await fetch(`${API_URL}/analytics/anomalies-summary?top_k=500&percentile_threshold=0.8`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const data: AnomaliesSummaryResponse = await response.json();
                setAnomalies(data);
            }
        } catch (error) {
            console.error('Error fetching anomalies summary:', error);
        } finally {
            setAnomaliesLoading(false);
        }
    };

    const handleExportReport = async () => {
        try {
            const response = await fetch(`${API_URL}/analytics/export/full-analysis`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analysis_report_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setShowExportMenu(false);
                setNotification({ message: 'Full analysis report exported successfully', type: 'success' });
            } else {
                setNotification({ message: 'Failed to export report. Please try again.', type: 'error' });
            }
        } catch (error) {
            console.error('Error exporting report:', error);
            setNotification({ message: 'Failed to export report. Check console for details.', type: 'error' });
        }
    };

    const handleExportModelPerformance = async () => {
        try {
            const response = await fetch(`${API_URL}/analytics/export/model-performance`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `model_performance_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setShowExportMenu(false);
                setNotification({ message: 'Model performance data exported successfully', type: 'success' });
            }
        } catch (error) {
            console.error('Error exporting model performance:', error);
            setNotification({ message: 'Failed to export. Please try again.', type: 'error' });
        }
    };

    const handleExportVolumeStats = async () => {
        try {
            const response = await fetch(`${API_URL}/analytics/export/sku-volume-stats`, {
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sku_volume_stats_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setShowExportMenu(false);
                setNotification({ message: 'SKU volume statistics exported successfully', type: 'success' });
            }
        } catch (error) {
            console.error('Error exporting volume stats:', error);
            setNotification({ message: 'Failed to export. Please try again.', type: 'error' });
        }
    };

    const runSimulation = async () => {
        setSimulationLoading(true);
        try {
            const response = await fetch(`${API_URL}/simulations/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify([]),
            });
            if (response.ok) {
                const data = await response.json();
                setSimulationResults(data);
                setNotification({ message: 'Simulation completed successfully', type: 'success' });
            } else {
                setNotification({ message: 'Simulation failed. Please try again.', type: 'warning' });
            }
        } catch (error) {
            console.error('Error running simulation:', error);
            setNotification({ message: 'Simulation error. Check that the backend is running.', type: 'warning' });
        } finally {
            setSimulationLoading(false);
        }
    };

    const runCustomScenario = async () => {
        if (!customScenario.trim()) {
            setNotification({ message: 'Please enter a scenario description', type: 'warning' });
            return;
        }
        setSimulationLoading(true);
        try {
            const params = new URLSearchParams({ scenario_text: customScenario });
            if (user?.store_id) {
                params.set('store_id', user.store_id.toUpperCase());
            }
            const response = await fetch(
                `${API_URL}/simulations/custom?${params.toString()}`,
                {
                    method: 'POST',
                    headers: getAuthHeaders(),
                }
            );
            if (response.ok) {
                const result = await response.json();
                setSimulationResults(prev => [result, ...prev.slice(0, 3)]);
                const reasoning = result.ai_reasoning ? ` — ${result.ai_reasoning}` : '';
                setNotification({
                    message: `AI analysis complete: ${result.demand.toLocaleString()} units projected${reasoning}`,
                    type: 'success',
                });
                setCustomScenario('');
                setShowCustomInput(false);
            } else {
                setNotification({ message: 'AI analysis failed. Try again.', type: 'error' });
            }
        } catch (error) {
            console.error('Error running custom scenario:', error);
            setNotification({ message: 'Failed to analyze scenario.', type: 'error' });
        } finally {
            setSimulationLoading(false);
        }
    };

    const handleChatScenario = (result: any) => {
        setSimulationResults(prev => [result, ...prev.slice(0, 3)]);
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060610' }}>
                <div className="animate-pulse text-2xl font-bold gradient-text">Loading Analyst Dashboard...</div>
            </div>
        );
    }

    if (!user) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <Badge variant="success">Active</Badge>;
            case 'standby': return <Badge variant="info">Standby</Badge>;
            case 'archived': return <Badge variant="default">Archived</Badge>;
            case 'new': return <Badge variant="error">New</Badge>;
            case 'investigating': return <Badge variant="warning">Investigating</Badge>;
            case 'resolved': return <Badge variant="success">Resolved</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    const getRiskBadge = (risk: string) => {
        switch (risk) {
            case 'low': return <Badge variant="success">Low Risk</Badge>;
            case 'medium': return <Badge variant="warning">Medium</Badge>;
            case 'high': return <Badge variant="error">High Risk</Badge>;
            default: return <Badge>{risk}</Badge>;
        }
    };

    const tabs = [
        { key: 'overview', label: 'Overview' },
        { key: 'analysis', label: 'Analysis' },
        //{ key: 'forecasts', label: 'Forecasts' },
        { key: 'gnn', label: 'GNN Insights' },
    ];

    return (
        <div style={{ minHeight: '100vh', background: '#060610', color: '#e8e8f0', fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* Nav — matches Admin Dashboard exactly */}
            <nav style={{ position: 'sticky', top: 0, zIndex: 50, height: 64, display: 'flex', alignItems: 'center', background: 'rgba(6,6,16,0.85)', backdropFilter: 'blur(24px) saturate(160%)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 2rem' }}>
                <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

                    {/* Left: logo + tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                        {/* Logo */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#00cfff,#6366f1)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,207,255,0.3)' }}>
                                <TrendingUpIcon className="text-white" size={20} />
                            </div>
                            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.025em', color: '#fff' }}>StockSense</span>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {tabs.map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: 8,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: 'pointer',
                                        textDecoration: 'none',
                                        transition: 'all 0.2s',
                                        background: activeTab === key ? 'rgba(0,207,255,0.1)' : 'transparent',
                                        color: activeTab === key ? '#00cfff' : 'rgba(255,255,255,0.45)',
                                        boxShadow: activeTab === key ? '0 0 0 1px rgba(0,207,255,0.2)' : 'none',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: search + bell + user + logout */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                <SearchIcon size={14} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search forecasts..."
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '5px 14px 5px 30px', fontSize: 12, color: '#e8e8f0', outline: 'none', width: 160, transition: 'width 0.2s' }}
                                onFocus={e => (e.currentTarget.style.width = '220px')}
                                onBlur={e => (e.currentTarget.style.width = '160px')}
                            />
                        </div>

                        {/* Bell */}
                        <button style={{ position: 'relative', padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8 }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)' }}><BellIcon size={18} /></span>
                            <span style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }}></span>
                        </button>

                        {/* User info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#00cfff,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', boxShadow: '0 0 12px rgba(0,207,255,0.25)' }}>
                                {user.name ? user.name[0] : user.email[0].toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user.name || user.email}</div>
                                <div style={{ fontSize: 11, color: '#00cfff', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ChartIcon size={9} /> Analyst
                                </div>
                            </div>
                        </div>

                        {/* Logout */}
                        <button
                            onClick={handleLogout}
                            style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8, color: 'rgba(255,255,255,0.35)', transition: 'color 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                        >
                            <LogoutIcon size={17} />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Page content */}
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem 2rem' }} className="space-y-6">

                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4" style={{ marginBottom: 8 }}>
                    <div>
                        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
                            Analytics Dashboard
                        </h1>
                        <p style={{ color: 'rgba(232,232,240,0.6)', marginTop: 4, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#818cf8' }}>
                                <ChartIcon size={14} />
                            </span>
                            Forecast Analysis & Model Insights
                            <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'inline-block' }} />
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Refresh button — ghost style */}
                        <button
                            onClick={fetchModelMetrics}
                            disabled={metricsLoading}
                            style={{ whiteSpace: 'nowrap', height: 44, padding: '0 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#fff', cursor: metricsLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 8 }}
                            onMouseEnter={e => { if (!metricsLoading) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                        >
                            <RefreshIcon size={14} className={metricsLoading ? 'animate-spin' : ''} />
                            Refresh Data
                        </button>

                        {/* Export — primary CTA style */}
                        <div className="relative export-menu-container">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                style={{ whiteSpace: 'nowrap', height: 44, padding: '0 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, #00cfff, #6366f1)', color: '#fff', cursor: 'pointer', boxShadow: '0 0 20px rgba(0,207,255,0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8 }}
                                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 24px rgba(0,207,255,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,207,255,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                                <DatabaseIcon size={14} />
                                Export Report
                            </button>
                            {showExportMenu && (
                                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 256, background: 'rgba(6,6,16,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.6)', zIndex: 50, padding: 8 }}>
                                    {[
                                        { label: 'Full Analysis Report', sub: 'All metrics + volume stats', fn: handleExportReport },
                                        { label: 'Model Performance', sub: 'MAE, MAPE, WAPE by SKU', fn: handleExportModelPerformance },
                                        { label: 'Volume Statistics', sub: 'SKU demand patterns', fn: handleExportVolumeStats },
                                    ].map(({ label, sub, fn }) => (
                                        <button
                                            key={label}
                                            onClick={fn}
                                            style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#e8e8f0', transition: 'background 0.2s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>{sub}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Analysis tab */}
                {activeTab === 'analysis' && (
                    <div className="animate-fadeIn">
                        <AnalysisView />
                    </div>
                )}

                {/* GNN tab */}
                {activeTab === 'gnn' && (
                    <div className="animate-fadeIn">
                        <GNN3DVisualizer />
                    </div>
                )}

                {/* Overview / Forecasts tabs */}
                {activeTab !== 'analysis' && activeTab !== 'gnn' && (
                    <>
                        {/* Stat Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Active Model */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, transition: 'all 0.3s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(129,140,248,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Model</p>
                                        <h3 style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#fff' }}>
                                            {modelMetrics.find(m => m.status === 'active')?.model.split(' ')[0] || 'TFT'}
                                        </h3>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
                                            {modelMetrics.find(m => m.status === 'active')?.type.split(' ')[0] || 'Loading...'}
                                        </p>
                                    </div>
                                    <div style={{ width: 40, height: 40, background: 'rgba(129,140,248,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
                                        <ActivityIcon size={20} />
                                    </div>
                                </div>
                            </div>

                            {/* Avg MAPE */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, transition: 'all 0.3s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Avg. MAPE</p>
                                        <h3 style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#fff' }}>
                                            {modelMetrics.find(m => m.status === 'active')?.mape.toFixed(1) || '8.5'}%
                                        </h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            {metricsLoading ? (
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>Loading...</span>
                                            ) : (
                                                <>
                                                    <span style={{ color: '#34d399' }}>
                                                        <TrendingDownIcon size={12} />
                                                    </span>
                                                    <span style={{ fontSize: 11, color: '#34d399' }}>Live Data</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ width: 40, height: 40, background: 'rgba(52,211,153,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                                        <CheckIcon size={20} />
                                    </div>
                                </div>
                            </div>

                            {/* High-Risk Stockouts */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, transition: 'all 0.3s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(251,191,36,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>High-Risk Stockouts</p>
                                        <h3 style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#fff' }}>
                                            {stockoutCount === null ? '—' : stockoutCount}
                                        </h3>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
                                            {stockoutCount === null ? 'Loading...' : `${stockoutCount} SKUs at risk`}
                                        </p>
                                    </div>
                                    <div style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
                                        <AlertIcon size={20} />
                                    </div>
                                </div>
                            </div>

                            {/* GNN Nodes */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, transition: 'all 0.3s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,207,255,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>GNN Nodes</p>
                                        <h3 style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{gnnStats ? gnnStats.nodes.toLocaleString() : '—'}</h3>
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>{gnnStats ? `${gnnStats.edges.toLocaleString()} edges` : 'Loading...'}</p>
                                    </div>
                                    <div style={{ width: 40, height: 40, background: 'rgba(0,207,255,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00cfff' }}>
                                        <DatabaseIcon size={20} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Content Grid — Model Comparison + Anomalies */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Model Performance Comparison */}
                            <Card glass className="lg:col-span-2">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-lg">
                                                <ActivityIcon size={18} className="text-info" />
                                                Model Performance Comparison
                                            </CardTitle>
                                            <CardDescription>Compare accuracy metrics across models</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {metricsLoading ? (
                                        <div className="text-center py-8 text-muted">
                                            <RefreshIcon size={24} className="mx-auto mb-2 animate-spin" />
                                            Loading model metrics...
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Model</TableHead>
                                                    <TableHead className="text-right">MAE</TableHead>
                                                    <TableHead className="text-right">MAPE</TableHead>
                                                    <TableHead className="text-right">WAPE</TableHead>
                                                    <TableHead className="text-right">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {modelMetrics.map((model) => (
                                                    <TableRow
                                                        key={model.model}
                                                        className={`hover:bg-white/5 cursor-pointer ${selectedModel === model.model ? 'bg-info/10' : ''}`}
                                                        onClick={() => setSelectedModel(model.model)}
                                                    >
                                                        <TableCell>
                                                            <div>
                                                                <div className="font-medium text-sm">{model.model}</div>
                                                                <div className="text-xs text-muted">{model.type}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono">{model.mae.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right font-mono">{model.mape.toFixed(1)}%</TableCell>
                                                        <TableCell className="text-right font-mono">{model.wape.toFixed(1)}%</TableCell>
                                                        <TableCell className="text-right">{getStatusBadge(model.status)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Anomalies Panel */}
                            <Card glass>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <AlertIcon size={18} className="text-warning" />
                                            Detected Anomalies
                                        </CardTitle>
                                        {anomalies && anomalies.top_anomalies.length > 3 && (
                                            <button
                                                onClick={() => setShowAllAnomalies((prev) => !prev)}
                                                style={{ height: 32, padding: '0 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#fff', cursor: 'pointer', transition: 'all 0.2s' }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                                            >
                                                {showAllAnomalies ? 'Show Top 3' : 'View All'}
                                            </button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {anomaliesLoading ? (
                                        <div className="text-center py-8 text-muted">
                                            <RefreshIcon size={24} className="mx-auto mb-2 animate-spin" />
                                            Loading anomalies...
                                        </div>
                                    ) : !anomalies ? (
                                        <div className="text-center py-8 text-muted text-sm">No anomaly data available.</div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                                                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Flagged SKUs</p>
                                                    <p style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24', marginTop: 4 }}>{anomalies.anomaly_count}</p>
                                                </div>
                                                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)' }}>
                                                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Threshold</p>
                                                    <p style={{ fontSize: 20, fontWeight: 700, color: '#818cf8', marginTop: 4 }}>P{Math.round(anomalies.thresholds.percentile * 100)}</p>
                                                </div>
                                            </div>

                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                                                MAPE &gt; {anomalies.thresholds.mape.toFixed(1)} or WAPE &gt; {anomalies.thresholds.wape.toFixed(1)}
                                            </div>

                                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                {(showAllAnomalies ? anomalies.top_anomalies : anomalies.top_anomalies.slice(0, 3)).length === 0 ? (
                                                    <div className="text-sm text-success">No SKUs exceed anomaly thresholds.</div>
                                                ) : (showAllAnomalies ? anomalies.top_anomalies : anomalies.top_anomalies.slice(0, 3)).map((item) => (
                                                    <div key={item.product_id} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-sm font-medium font-mono">{item.product_id}</span>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className="text-warning">MAPE {item.mape.toFixed(1)}%</span>
                                                                <span style={{ color: 'rgba(255,255,255,0.38)' }}>|</span>
                                                                <span className="text-info">WAPE {item.wape.toFixed(1)}%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Product Accuracy — full width */}
                        <div>
                            <ProductAccuracyTable />
                        </div>

                        {/* Third Row — Accuracy Summary + What-If Simulation */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <AccuracySummaryCard />

                            {/* What-If Simulation */}
                            <div className="lg:col-span-2">
                                <Card glass>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="flex items-center gap-2 text-lg">
                                                    <RefreshIcon size={18} className="text-primary" />
                                                    What-If Simulation
                                                </CardTitle>
                                                <CardDescription>Test different demand scenarios</CardDescription>
                                            </div>
                                            <button
                                                onClick={runSimulation}
                                                disabled={simulationLoading}
                                                style={{ whiteSpace: 'nowrap', height: 36, padding: '0 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: simulationLoading ? 'rgba(0,207,255,0.15)' : 'linear-gradient(135deg, #00cfff, #6366f1)', color: '#fff', cursor: simulationLoading ? 'not-allowed' : 'pointer', boxShadow: simulationLoading ? 'none' : '0 0 16px rgba(0,207,255,0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}
                                                onMouseEnter={e => { if (!simulationLoading) { e.currentTarget.style.boxShadow = '0 0 24px rgba(0,207,255,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                                                onMouseLeave={e => { e.currentTarget.style.boxShadow = simulationLoading ? 'none' : '0 0 16px rgba(0,207,255,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                            >
                                                <RefreshIcon size={13} className={simulationLoading ? 'animate-spin' : ''} />
                                                {simulationLoading ? 'Running...' : 'Run Simulation'}
                                            </button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {/* Custom scenario input */}
                                        <div className="mb-4">
                                            {showCustomInput ? (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={customScenario}
                                                        onChange={(e) => setCustomScenario(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && runCustomScenario()}
                                                        placeholder="e.g. Major snowstorm next week..."
                                                        className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#00cfff] focus:ring-1 focus:ring-[#00cfff] transition-all text-sm flex-1"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={runCustomScenario}
                                                        disabled={simulationLoading}
                                                        style={{ whiteSpace: 'nowrap', height: 38, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, #00cfff, #6366f1)', color: '#fff', cursor: 'pointer', transition: 'all 0.2s' }}
                                                    >
                                                        Analyze
                                                    </button>
                                                    <button
                                                        onClick={() => { setShowCustomInput(false); setCustomScenario(''); }}
                                                        style={{ whiteSpace: 'nowrap', height: 38, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#fff', cursor: 'pointer', transition: 'all 0.2s' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ padding: 12, background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <p style={{ fontSize: 13, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                        </svg>
                                                        Use the chat assistant or run a custom AI scenario
                                                    </p>
                                                    <button
                                                        onClick={() => setShowCustomInput(true)}
                                                        style={{ height: 30, padding: '0 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#fff', cursor: 'pointer', transition: 'all 0.2s' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                                    >
                                                        Custom
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Simulation Results */}
                                        {simulationResults.length === 0 ? (
                                            <div className="text-center py-8" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                                <RefreshIcon size={32} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-sm">Click <span style={{ color: '#e8e8f0', fontWeight: 500 }}>Run Simulation</span> to load live scenarios from the database</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {simulationResults.map((sim: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        style={{
                                                            padding: 16,
                                                            borderRadius: 10,
                                                            background: sim.ai_reasoning ? 'rgba(0,207,255,0.04)' : 'rgba(255,255,255,0.03)',
                                                            border: sim.ai_reasoning ? '1px solid rgba(0,207,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="font-medium text-sm">{sim.scenario}</div>
                                                                    {sim.ai_reasoning && (
                                                                        <span style={{ padding: '2px 8px', background: 'rgba(0,207,255,0.15)', color: '#00cfff', fontSize: 10, borderRadius: 20, fontWeight: 700 }}>AI</span>
                                                                    )}
                                                                </div>
                                                                {sim.ai_reasoning && (
                                                                    <div className="text-xs text-muted mt-1 italic">{sim.ai_reasoning}</div>
                                                                )}
                                                                <div className="text-xs text-muted mt-1">Confidence: {sim.confidence}%</div>
                                                            </div>
                                                            <div className="text-right ml-4">
                                                                <div className="font-bold text-lg">{sim.demand.toLocaleString()}</div>
                                                                <div className="mt-1">{getRiskBadge(sim.risk)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Chat FAB — updated to match design system */}
            <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 40 }}>
                <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #00cfff, #6366f1)', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(0,207,255,0.4)', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(0,207,255,0.6)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(0,207,255,0.4)'; }}
                    title="Ask AI Assistant"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                </button>
            </div>

            {/* Chat Panel */}
            <ChatPanel
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onScenarioAnalyzed={handleChatScenario}
            />

            {/* Toast */}
            {notification && (
                <Toast
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification(null)}
                />
            )}
        </div>
    );
}
