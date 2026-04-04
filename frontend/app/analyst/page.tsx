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

        // Fetch model metrics and GNN stats
        fetchModelMetrics();
        fetchGNNStats();
        fetchStockoutCount();
        fetchAnomaliesSummary();
    }, [router]);

    // Close export menu when clicking outside
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
                // Deduplicate by SKU — count unique SKUs at risk
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
            // Fall back to mock data (already set)
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
            // Download full analysis report
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
            // POST /simulations/run with no body → backend returns default scenarios using live DB data
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
            // POST /simulations/custom?scenario_text=... → AI + GNN powered analysis
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
        // Add chat-analyzed scenario to simulation results
        setSimulationResults(prev => [
            result,
            ...prev.slice(0, 3)  // Keep top 3 default scenarios
        ]);
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
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

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Navigation */}
            <nav className="glass border-b border-white/10 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-info/20">
                                    <TrendingUpIcon className="text-white" size={24} />
                                </div>
                                <span className="text-xl font-bold gradient-text">StockSensePro</span>
                            </div>
                            <div className="hidden md:flex items-center gap-1">
                                {['overview', 'analysis', 'forecasts', 'gnn'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                            ? 'bg-info/20 text-info'
                                            : 'text-muted hover:text-foreground hover:bg-white/5'
                                            }`}
                                    >
                                        {tab === 'gnn' ? 'GNN Insights' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="relative hidden sm:block">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search forecasts..."
                                    className="!bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-xs focus:ring-1 focus:ring-info outline-none transition-all w-40 focus:w-56 shadow-inner"
                                />
                            </div>
                            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors relative">
                                <BellIcon className="text-muted" size={20} />
                            </button>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                                    {user.name ? user.name[0] : user.email[0].toUpperCase()}
                                </div>
                                <div className="hidden sm:block">
                                    <div className="text-sm font-medium">{user.name || user.email}</div>
                                    <div className="text-xs text-info flex items-center gap-1">
                                        <ChartIcon size={10} /> Analyst
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleLogout} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                                <LogoutIcon className="text-muted hover:text-error" size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">
                            Analytics <span className="gradient-text">Dashboard</span>
                        </h1>
                        <p className="text-muted text-sm flex items-center gap-2">
                            <ChartIcon size={14} className="text-info" />
                            Forecast Analysis & Model Insights
                            <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={fetchModelMetrics} disabled={metricsLoading}>
                            <RefreshIcon size={14} className={metricsLoading ? 'animate-spin' : ''} />
                            Refresh Data
                        </Button>
                        <div className="relative export-menu-container">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                            >
                                <DatabaseIcon size={14} />
                                Export Report
                            </Button>
                            {showExportMenu && (
                                <div className="absolute right-0 mt-2 w-64 glass border border-white/10 rounded-lg shadow-xl z-50">
                                    <div className="p-2">
                                        <button
                                            onClick={handleExportReport}
                                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
                                        >
                                            <div className="font-medium">Full Analysis Report</div>
                                            <div className="text-xs text-muted">All metrics + volume stats</div>
                                        </button>
                                        <button
                                            onClick={handleExportModelPerformance}
                                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
                                        >
                                            <div className="font-medium">Model Performance</div>
                                            <div className="text-xs text-muted">MAE, MAPE, WAPE by SKU</div>
                                        </button>
                                        <button
                                            onClick={handleExportVolumeStats}
                                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
                                        >
                                            <div className="font-medium">Volume Statistics</div>
                                            <div className="text-xs text-muted">SKU demand patterns</div>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Analysis View Content */}
                {activeTab === 'analysis' && (
                    <div className="animate-in fade-in duration-300">
                        <AnalysisView />
                    </div>
                )}

                {/* GNN 3D View Content */}
                {activeTab === 'gnn' && (
                    <div className="animate-in fade-in duration-300">
                        <GNN3DVisualizer />
                    </div>
                )}

                {/* Main Dashboard Content (Only show if NOT analysis or gnn tab) */}
                {activeTab !== 'analysis' && activeTab !== 'gnn' && (
                    <>
                        {/* Model Performance Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <Card glass className="group hover:border-info/30 transition-all">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted uppercase tracking-wider">Active Model</p>
                                        <h3 className="text-xl font-bold mt-1 text-info">
                                            {modelMetrics.find(m => m.status === 'active')?.model.split(' ')[0] || 'TFT'}
                                        </h3>
                                        <p className="text-xs text-muted mt-1">
                                            {modelMetrics.find(m => m.status === 'active')?.type.split(' ')[0] || 'Loading...'}
                                        </p>
                                    </div>
                                    <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center text-info">
                                        <ActivityIcon size={20} />
                                    </div>
                                </div>
                            </Card>

                            <Card glass className="group hover:border-success/30 transition-all">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted uppercase tracking-wider">Avg. MAPE</p>
                                        <h3 className="text-2xl font-bold mt-1 text-success">
                                            {modelMetrics.find(m => m.status === 'active')?.mape.toFixed(1) || '8.5'}%
                                        </h3>
                                        <div className="flex items-center gap-1 mt-1">
                                            {metricsLoading ? (
                                                <span className="text-xs text-muted">Loading...</span>
                                            ) : (
                                                <>
                                                    <TrendingDownIcon size={12} className="text-success" />
                                                    <span className="text-xs text-success">Live Data</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center text-success">
                                        <CheckIcon size={20} />
                                    </div>
                                </div>
                            </Card>

                            <Card glass className="group hover:border-warning/30 transition-all">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted uppercase tracking-wider">High-Risk Stockouts</p>
                                        <h3 className="text-2xl font-bold mt-1 text-warning">
                                            {stockoutCount === null ? '—' : stockoutCount}
                                        </h3>
                                        <p className="text-xs text-muted mt-1">
                                            {stockoutCount === null ? 'Loading...' : `${stockoutCount} SKUs at risk`}
                                        </p>
                                    </div>
                                    <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center text-warning">
                                        <AlertIcon size={20} />
                                    </div>
                                </div>
                            </Card>

                            <Card glass className="group hover:border-primary/30 transition-all">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted uppercase tracking-wider">GNN Nodes</p>
                                        <h3 className="text-2xl font-bold mt-1">{gnnStats ? gnnStats.nodes.toLocaleString() : '—'}</h3>
                                        <p className="text-xs text-muted mt-1">{gnnStats ? `${gnnStats.edges.toLocaleString()} edges` : 'Loading...'}</p>
                                    </div>
                                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                        <DatabaseIcon size={20} />
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                            {/* Model Comparison */}
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
                                                        <TableCell className="text-right">
                                                            {getStatusBadge(model.status)}
                                                        </TableCell>
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
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowAllAnomalies((prev) => !prev)}
                                            >
                                                {showAllAnomalies ? 'Show Top 3' : 'View All'}
                                            </Button>
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
                                                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                                                    <p className="text-xs text-muted uppercase tracking-wider">Flagged SKUs</p>
                                                    <p className="text-xl font-bold text-warning mt-1">{anomalies.anomaly_count}</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-info/10 border border-info/30">
                                                    <p className="text-xs text-muted uppercase tracking-wider">Threshold</p>
                                                    <p className="text-xl font-bold text-info mt-1">P{Math.round(anomalies.thresholds.percentile * 100)}</p>
                                                </div>
                                            </div>

                                            <div className="text-xs text-muted">
                                                MAPE &gt; {anomalies.thresholds.mape.toFixed(1)} or WAPE &gt; {anomalies.thresholds.wape.toFixed(1)}
                                            </div>

                                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                {(showAllAnomalies ? anomalies.top_anomalies : anomalies.top_anomalies.slice(0, 3)).length === 0 ? (
                                                    <div className="text-sm text-success">No SKUs exceed anomaly thresholds.</div>
                                                ) : (showAllAnomalies ? anomalies.top_anomalies : anomalies.top_anomalies.slice(0, 3)).map((item) => (
                                                    <div key={item.product_id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-sm font-medium font-mono">{item.product_id}</span>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className="text-warning">MAPE {item.mape.toFixed(1)}%</span>
                                                                <span className="text-muted">|</span>
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

                        {/* Second Row */}
                        <div className="grid grid-cols-1 gap-8 mb-8">
                            {/* Product Accuracy - Full Width */}
                            <ProductAccuracyTable />
                        </div>

                        {/* Third Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                            {/* Accuracy Summary - Takes 1 column */}
                            <AccuracySummaryCard />

                            {/* What-If Simulation - Takes 2 columns */}
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
                                            <Button variant="primary" size="sm" onClick={runSimulation} disabled={simulationLoading}>
                                                <RefreshIcon size={14} className={simulationLoading ? 'animate-spin' : ''} />
                                                {simulationLoading ? 'Running...' : 'Run Simulation'}
                                            </Button>
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
                                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                                        autoFocus
                                                    />
                                                    <Button variant="primary" size="sm" onClick={runCustomScenario} disabled={simulationLoading}>Analyze</Button>
                                                    <Button variant="ghost" size="sm" onClick={() => { setShowCustomInput(false); setCustomScenario(''); }}>Cancel</Button>
                                                </div>
                                            ) : (
                                                <div className="p-3 bg-info/10 border border-info/30 rounded-lg flex items-center justify-between">
                                                    <p className="text-sm text-info flex items-center gap-2">
                                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                        </svg>
                                                        Use the chat assistant or run a custom AI scenario
                                                    </p>
                                                    <Button variant="ghost" size="sm" onClick={() => setShowCustomInput(true)}>Custom</Button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Results */}
                                        {simulationResults.length === 0 ? (
                                            <div className="text-center py-8 text-muted">
                                                <RefreshIcon size={32} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-sm">Click <span className="text-foreground font-medium">Run Simulation</span> to load live scenarios from the database</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {simulationResults.map((sim: any, idx: number) => (
                                                    <div key={idx} className={`p-4 rounded-lg border ${sim.ai_reasoning ? 'bg-primary/5 border-primary/30' : 'bg-white/5 border-white/5'}`}>
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="font-medium text-sm">{sim.scenario}</div>
                                                                    {sim.ai_reasoning && (
                                                                        <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">AI</span>
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

                {/* LLM Assistant Floating Button */}
                <div className="fixed bottom-6 right-6 z-40">
                    <button
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        className="w-14 h-14 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-full shadow-lg shadow-info/30 flex items-center justify-center hover:scale-110 transition-transform group"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                    </button>
                    <div className="absolute -top-10 right-0 bg-surface-elevated text-xs px-3 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10">
                        💬 Ask AI Assistant
                    </div>
                </div>
            </div>

            {/* Chat Panel */}
            <ChatPanel
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onScenarioAnalyzed={handleChatScenario}
            />

            {/* Toast Notification */}
            {notification && (
                <Toast
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification(null)}
                />
            )}
        </div >
    );
}
