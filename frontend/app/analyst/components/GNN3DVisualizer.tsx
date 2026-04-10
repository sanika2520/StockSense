'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { RefreshIcon, DatabaseIcon, SearchIcon } from '@/components/ui/Icons';

// Dynamically import ForceGraph3D to avoid SSR issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as any;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const getAuthHeaders = (): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

interface GraphNode {
    id: string;
    index: number;
    category: string;
    strength: number;
    label: string;
}

interface GraphEdge {
    source: string;
    target: string;
    weight: number;
}

interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    total_nodes: number;
    total_edges: number;
}

interface GraphStats {
    nodes: number;
    edges: number;
    density: number;
    degree_stats: { average: number; min: number; max: number };
    edge_weight_stats: { average: number; min: number; max: number };
}

interface ProductInfluence {
    sku: string;
    category: string;
    influence_weight: number;
    influence_strength: number;
}

interface ProductCatalog {
    [sku: string]: { category: string; name: string };
}

type ScopeType = 'sku' | 'category';
type EdgeOperation = 'set' | 'multiply' | 'add';
type GraphScopeMode = 'all' | 'category' | 'sku';

interface EdgeWeightUpdateResponse {
    success: boolean;
    dry_run: boolean;
    changed_edges: number;
    unchanged_edges: number;
    total_candidate_edges: number;
    message: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    'GROC': '#4ade80', 'FRPR': '#22c55e', 'BEVG': '#60a5fa', 'BKDY': '#f59e0b',
    'FRZN': '#06b6d4', 'SNCK': '#fbbf24', 'MEAT': '#ef4444', 'PRSN': '#ec4899',
    'BABC': '#a78bfa', 'CLOT': '#8b5cf6', 'FTRW': '#14b8a6', 'JWCH': '#fde047',
    'BAGL': '#fb923c', 'ELEC': '#3b82f6', 'STOF': '#6366f1', 'FURH': '#a855f7',
    'BEDM': '#d946ef', 'CLNS': '#10b981', 'KICH': '#f97316', 'PETC': '#84cc16',
    'SPRT': '#0ea5e9', 'TOYG': '#f43f5e', 'AUTO': '#64748b', 'BOOK': '#94a3b8',
};

const CATEGORY_NAMES: Record<string, string> = {
    'AUTO': 'Automotive & Accessories', 'BABC': 'Baby Care & Products',
    'BAGL': 'Bags & Luggage', 'BEDM': 'Bedding & Mattresses',
    'BEVG': 'Beverages', 'BKDY': 'Bakery & Pastries',
    'BOOK': 'Books & Media', 'CLNS': 'Cleaning Supplies',
    'CLOT': 'Clothing & Apparel', 'ELEC': 'Electronics',
    'FRPR': 'Fresh Produce', 'FRZN': 'Frozen Foods',
    'FURH': 'Furniture & Home', 'FTRW': 'Footwear',
    'GROC': 'Groceries & Staples', 'JWCH': 'Jewelry & Watches',
    'KICH': 'Kitchen & Dining', 'MEAT': 'Meat & Seafood',
    'PETC': 'Pet Care & Supplies', 'PRSN': 'Personal Care',
    'SNCK': 'Snacks & Confectionery', 'SPRT': 'Sports & Outdoors',
    'STOF': 'Stationery & Office', 'TOYG': 'Toys & Games',
};

// ── Shared input / select style ──────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: '#e8e8f0',
    outline: 'none',
    width: '100%',
    colorScheme: 'dark',
    transition: 'border-color 0.2s',
};

const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
};

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            padding: '16px 20px',
            transition: 'all 0.3s ease',
        }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}44`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );
}

// ── View Tab button ──────────────────────────────────────────────────────────
function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '7px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: active ? 'linear-gradient(135deg, #00cfff22, #6366f122)' : 'transparent',
                color: active ? '#00cfff' : 'rgba(255,255,255,0.45)',
                boxShadow: active ? '0 0 0 1px rgba(0,207,255,0.3)' : 'none',
            }}
        >
            {children}
        </button>
    );
}

// ── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            {children}
        </p>
    );
}

// ── Ghost button ─────────────────────────────────────────────────────────────
function GhostButton({ onClick, disabled, children, style: extraStyle }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)',
                color: disabled ? 'rgba(255,255,255,0.25)' : '#e8e8f0',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap' as const,
                ...extraStyle,
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        >
            {children}
        </button>
    );
}

function GradientButton({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                background: disabled ? 'rgba(0,207,255,0.15)' : 'linear-gradient(135deg, #00cfff, #6366f1)',
                color: '#fff',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: disabled ? 'none' : '0 0 14px rgba(0,207,255,0.25)',
                whiteSpace: 'nowrap' as const,
            }}
            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,207,255,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={e => { if (!disabled) { e.currentTarget.style.boxShadow = '0 0 14px rgba(0,207,255,0.25)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
        >
            {children}
        </button>
    );
}

export default function GNN3DVisualizer() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);
    const [view, setView] = useState<'3d' | 'explorer' | 'reference'>('explorer');
    const [stats, setStats] = useState<GraphStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedSKU, setSelectedSKU] = useState('');
    const [influences, setInfluences] = useState<ProductInfluence[]>([]);
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [productCatalog, setProductCatalog] = useState<ProductCatalog>({});
    const [showEdges, setShowEdges] = useState(true);
    const [graphScopeMode, setGraphScopeMode] = useState<GraphScopeMode>('all');
    const [graphScopeCategories, setGraphScopeCategories] = useState<string[]>([]);
    const [graphScopeSKU, setGraphScopeSKU] = useState('');
    const [sourceScopeType, setSourceScopeType] = useState<ScopeType>('category');
    const [sourceScopeValue, setSourceScopeValue] = useState('GROC');
    const [targetScopeType, setTargetScopeType] = useState<ScopeType>('sku');
    const [targetScopeValue, setTargetScopeValue] = useState('');
    const [edgeOperation, setEdgeOperation] = useState<EdgeOperation>('set');
    const [edgeValue, setEdgeValue] = useState('1');
    const [edgeUpdateLoading, setEdgeUpdateLoading] = useState(false);
    const [edgeUpdateStatus, setEdgeUpdateStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => { fetchStats(); fetchGraphPreview(); fetchProductCatalog(); }, []);

    useEffect(() => {
        if (fgRef.current && graphData && view === '3d') {
            const fg = fgRef.current;
            setTimeout(() => {
                fg.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 1000);
            }, 500);
        }
    }, [graphData, view]);

    useEffect(() => { if (selectedSKU) fetchInfluences(selectedSKU); }, [selectedSKU]);

    useEffect(() => { if (!targetScopeValue && selectedSKU) setTargetScopeValue(selectedSKU); }, [selectedSKU, targetScopeValue]);

    useEffect(() => { if (!graphScopeSKU && selectedSKU) setGraphScopeSKU(selectedSKU); }, [selectedSKU, graphScopeSKU]);

    useEffect(() => {
        if (!graphData?.nodes?.length) return;
        const categories = Array.from(new Set(graphData.nodes.map(n => n.category))).sort();
        if (graphScopeCategories.length === 0 && categories.length > 0) setGraphScopeCategories([categories[0]]);
        const valid = graphScopeCategories.filter(c => categories.includes(c));
        if (valid.length !== graphScopeCategories.length) setGraphScopeCategories(valid.length > 0 ? valid : categories.slice(0, 1));
        const skus = graphData.nodes.map(n => n.id);
        if (graphScopeSKU && !skus.includes(graphScopeSKU) && skus.length > 0) setGraphScopeSKU(skus[0]);
    }, [graphData, graphScopeCategories, graphScopeSKU]);

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_URL}/gnn/graph-statistics`, { headers: getAuthHeaders() });
            if (res.ok) setStats(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchGraphPreview = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/gnn/graph-structure?limit=240&min_edge_weight=0.0`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setGraphData(data);
                if (data.nodes.length > 0) setSelectedSKU(data.nodes[0].id);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const fetchInfluences = async (sku: string) => {
        try {
            const res = await fetch(`${API_URL}/gnn/product-influences/${sku}?top_k=10`, { headers: getAuthHeaders() });
            if (res.ok) { const data = await res.json(); setInfluences(data.influences); }
        } catch (e) { console.error(e); }
    };

    const fetchProductCatalog = async () => {
        try {
            const res = await fetch(`${API_URL}/products/catalog`, { headers: getAuthHeaders() });
            if (res.ok) { const data = await res.json(); setProductCatalog(data.sku_lookup); }
        } catch (e) { console.error(e); }
    };

    const applyEdgeWeightUpdate = async (dryRun: boolean) => {
        const parsedValue = Number(edgeValue);
        if (!Number.isFinite(parsedValue)) { setEdgeUpdateStatus({ type: 'error', message: 'Edge value must be a valid number.' }); return; }
        if (!sourceScopeValue.trim() || !targetScopeValue.trim()) { setEdgeUpdateStatus({ type: 'error', message: 'Source and target scope values are required.' }); return; }
        setEdgeUpdateLoading(true); setEdgeUpdateStatus(null);
        try {
            const res = await fetch(`${API_URL}/gnn/edge-weights/bulk-update`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_scope_type: sourceScopeType, source_scope_value: sourceScopeValue.trim(), target_scope_type: targetScopeType, target_scope_value: targetScopeValue.trim(), operation: edgeOperation, value: parsedValue, dry_run: dryRun }),
            });
            const data: EdgeWeightUpdateResponse & { detail?: string } = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to update edge weights');
            setEdgeUpdateStatus({ type: 'success', message: `${data.message}. Changed ${data.changed_edges}/${data.total_candidate_edges} candidate edges.` });
            if (!dryRun) await Promise.all([fetchGraphPreview(), fetchStats(), selectedSKU ? fetchInfluences(selectedSKU) : Promise.resolve()]);
        } catch (err) {
            setEdgeUpdateStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update edge weights.' });
        } finally { setEdgeUpdateLoading(false); }
    };

    const getNodeColor = (node: GraphNode) => CATEGORY_COLORS[node.category] || '#64748b';
    const getNodeSize = (node: GraphNode) => Math.max(3, Math.min(15, node.strength / 2));
    const getEdgeColor = (weight: number) => {
        if (weight < 0.5) return 'rgba(96,165,250,0.4)';
        if (weight < 1.0) return 'rgba(34,197,94,0.5)';
        if (weight < 2.0) return 'rgba(251,191,36,0.6)';
        return 'rgba(239,68,68,0.7)';
    };

    const getSKUDescription = (sku: string) => {
        if (productCatalog[sku]?.name) return productCatalog[sku].name;
        const match = sku.match(/SKU_([A-Z]{4})(\d{3})/);
        if (match) return `${CATEGORY_NAMES[match[1]] || match[1]} - Item ${match[2]}`;
        return sku;
    };

    const selectedNode = graphData?.nodes.find(n => n.id === selectedSKU);
    const filteredSKUs = graphData?.nodes.filter(node => {
        const matchesSearch = searchFilter ? node.id.toLowerCase().includes(searchFilter.toLowerCase()) || getSKUDescription(node.id).toLowerCase().includes(searchFilter.toLowerCase()) : true;
        return matchesSearch && (categoryFilter === 'all' || node.category === categoryFilter);
    }) || [];

    const categoryOptions = Array.from(new Set((graphData?.nodes || []).map(n => n.category))).sort();
    const skuOptions = (graphData?.nodes || []).map(n => n.id);
    const sourceScopeOptions = sourceScopeType === 'sku' ? skuOptions : categoryOptions;
    const targetScopeOptions = targetScopeType === 'sku' ? skuOptions : categoryOptions;

    const visibleNodeIds = new Set(
        (graphData?.nodes || []).filter(node => {
            if (graphScopeMode === 'all') return true;
            if (graphScopeMode === 'category') return graphScopeCategories.length > 0 ? graphScopeCategories.includes(node.category) : true;
            return graphScopeSKU ? node.id === graphScopeSKU : true;
        }).map(n => n.id)
    );

    const toggleGraphScopeCategory = (cat: string) => {
        setGraphScopeCategories(prev => prev.includes(cat) ? (prev.length === 1 ? prev : prev.filter(c => c !== cat)) : [...prev, cat]);
    };

    const filtered3DNodes = (graphData?.nodes || []).filter(n => visibleNodeIds.has(n.id));
    const filtered3DEdges = (graphData?.edges || []).filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Header card ───────────────────────────────────────────── */}
            <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: '20px 24px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,207,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00cfff' }}>
                                <DatabaseIcon size={16} />
                            </div>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.025em' }}>GNN Product Influence Graph</h2>
                        </div>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', paddingLeft: 42 }}>
                            Graph Neural Network-based product relationship analysis
                            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.2)' }}>•</span>
                            <span style={{ color: '#00cfff', fontWeight: 600 }}>{stats?.nodes ?? 0}</span> products
                            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.2)' }}>•</span>
                            <span style={{ color: '#6366f1', fontWeight: 600 }}>{stats?.edges ?? 0}</span> connections
                        </p>
                    </div>

                    {/* View tabs */}
                    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
                        <ViewTab active={view === '3d'} onClick={() => setView('3d')}>🌐 3D View</ViewTab>
                        <ViewTab active={view === 'explorer'} onClick={() => setView('explorer')}>🔍 Explorer</ViewTab>
                        <ViewTab active={view === 'reference'} onClick={() => setView('reference')}>📦 SKU Reference</ViewTab>
                    </div>
                </div>
            </div>

            {/* ── Stats row ─────────────────────────────────────────────── */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
                    <StatCard label="Total Nodes" value={String(stats.nodes)} color="#00cfff" icon="◉" />
                    <StatCard label="Total Edges" value={String(stats.edges)} color="#6366f1" icon="⟷" />
                    <StatCard label="Avg Connections" value={stats.degree_stats.average.toFixed(1)} color="#34d399" icon="⟁" />
                    <StatCard label="Graph Density" value={`${(stats.density * 100).toFixed(2)}%`} color="#a78bfa" icon="▣" />
                    <StatCard label="Avg Edge Weight" value={stats.edge_weight_stats.average.toFixed(2)} color="#fbbf24" icon="⇝" />
                    <StatCard label="Weight Range" value={`${stats.edge_weight_stats.min.toFixed(1)}–${stats.edge_weight_stats.max.toFixed(1)}`} color="#f472b6" icon="↕" />
                </div>
            )}

            {/* ── 3D View ───────────────────────────────────────────────── */}
            {view === '3d' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* 3D Controls */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

                                {/* Show edges toggle */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e8e8f0', cursor: 'pointer' }}>
                                    <div
                                        onClick={() => setShowEdges(!showEdges)}
                                        style={{
                                            width: 36, height: 20, borderRadius: 10,
                                            background: showEdges ? 'linear-gradient(135deg,#00cfff,#6366f1)' : 'rgba(255,255,255,0.1)',
                                            position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute', top: 3, left: showEdges ? 18 : 3,
                                            width: 14, height: 14, borderRadius: '50%',
                                            background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                                        }} />
                                    </div>
                                    Show Edges
                                </label>

                                {/* Scope dropdown */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Scope</span>
                                    <select
                                        value={graphScopeMode}
                                        onChange={e => setGraphScopeMode(e.target.value as GraphScopeMode)}
                                        style={{ ...selectStyle, width: 140 }}
                                    >
                                        <option value="all">All SKUs</option>
                                        <option value="category">By Category</option>
                                        <option value="sku">Single SKU</option>
                                    </select>
                                </div>

                                {graphScopeMode === 'category' && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 540 }}>
                                        {categoryOptions.map(cat => {
                                            const selected = graphScopeCategories.includes(cat);
                                            return (
                                                <button
                                                    key={cat}
                                                    onClick={() => toggleGraphScopeCategory(cat)}
                                                    style={{
                                                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                                        border: `1px solid ${selected ? 'rgba(0,207,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                                        background: selected ? 'rgba(0,207,255,0.12)' : 'rgba(255,255,255,0.03)',
                                                        color: selected ? '#00cfff' : 'rgba(255,255,255,0.45)',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {CATEGORY_NAMES[cat] || cat}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {graphScopeMode === 'sku' && (
                                    <select value={graphScopeSKU} onChange={e => setGraphScopeSKU(e.target.value)} style={{ ...selectStyle, width: 220 }}>
                                        {skuOptions.map(sku => <option key={sku} value={sku}>{sku}</option>)}
                                    </select>
                                )}

                                <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(0,207,255,0.1)', border: '1px solid rgba(0,207,255,0.25)', color: '#00cfff', fontSize: 11, fontWeight: 700 }}>
                                    {filtered3DNodes.length} visible
                                </span>
                            </div>

                            {/* Edge weight legend */}
                            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                                {[
                                    { color: '#60a5fa', label: 'Weak' },
                                    { color: '#22c55e', label: 'Moderate' },
                                    { color: '#fbbf24', label: 'Strong' },
                                    { color: '#ef4444', label: 'Very Strong' },
                                ].map(({ color, label }) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 24, height: 2, background: color, borderRadius: 2 }} />
                                        <span>{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Info bar */}
                        <div style={{ padding: '10px 14px', background: 'rgba(0,207,255,0.06)', border: '1px solid rgba(0,207,255,0.15)', borderRadius: 10, fontSize: 12, color: 'rgba(0,207,255,0.85)', lineHeight: 1.6 }}>
                            <strong>ℹ️ Real Data:</strong> Edge weights represent actual product relationships — co-purchase patterns, category-based substitutes, and temporal demand correlations. Products cluster naturally by category and purchase behaviour.
                        </div>
                    </div>

                    {/* 3D Canvas */}
                    <div
                        id="graph-3d-container"
                        style={{ background: '#060610', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', height: 700, position: 'relative', width: '100%' }}
                    >
                        {loading ? (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,6,16,0.85)', backdropFilter: 'blur(8px)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 32, color: '#00cfff', marginBottom: 8, animation: 'spin 1s linear infinite' }}>⟳</div>
                                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>Loading graph data...</p>
                                </div>
                            </div>
                        ) : graphData && filtered3DNodes.length > 0 ? (
                            <ForceGraph3D
                                ref={fgRef}
                                width={undefined}
                                height={700}
                                graphData={{
                                    nodes: filtered3DNodes.map(n => ({ ...n, color: getNodeColor(n), val: getNodeSize(n) })),
                                    links: showEdges ? filtered3DEdges.map(e => ({ source: e.source, target: e.target, value: e.weight, color: getEdgeColor(e.weight) })) : [],
                                }}
                                nodeLabel={(node: unknown) => { const n = node as { id: string }; return `${n.id}: ${getSKUDescription(n.id)}`; }}
                                nodeColor={(node: unknown) => (node as { color: string }).color}
                                nodeVal={(node: unknown) => (node as { val: number }).val}
                                linkColor={(link: unknown) => (link as { color: string }).color}
                                linkWidth={(link: unknown) => Math.max(0.3, Math.min(3, (link as { value: number }).value / 2))}
                                linkOpacity={0.7}
                                backgroundColor="#060610"
                                showNavInfo={false}
                                onNodeClick={(node: unknown) => {
                                    const sku = (node as { id: string }).id;
                                    setSelectedSKU(sku);
                                    if (graphScopeMode === 'sku') setGraphScopeSKU(sku);
                                }}
                            />
                        ) : (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <div style={{ fontSize: 40 }}>🌐</div>
                                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>{graphData ? 'No nodes match current scope filter' : 'No graph data available'}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Explorer View ─────────────────────────────────────────── */}
            {view === 'explorer' && (
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>

                    {/* Left column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Filters */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Filters</p>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>Search and narrow down SKUs</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <SectionLabel>Search</SectionLabel>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }}>
                                            <SearchIcon size={13} />
                                        </span>
                                        <input
                                            type="text"
                                            value={searchFilter}
                                            onChange={e => setSearchFilter(e.target.value)}
                                            placeholder="SKU or name..."
                                            style={{ ...inputStyle, paddingLeft: 32 }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <SectionLabel>Category</SectionLabel>
                                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                                        <option value="all" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>All Categories</option>
                                        {Object.keys(CATEGORY_NAMES).map(code => (
                                            <option key={code} value={code} style={{ background: '#0d0d1a', color: '#e8e8f0' }}>{CATEGORY_NAMES[code]}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Edge Weight Editor */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Edge Weight Editor</p>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>Update SKU or category link weights</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {/* Source Scope */}
                                <div>
                                    <SectionLabel>Source Scope</SectionLabel>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                                        <select value={sourceScopeType} onChange={e => { setSourceScopeType(e.target.value as ScopeType); setSourceScopeValue(''); }} style={{ ...selectStyle, width: '100%' }}>
                                            <option value="sku" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>SKU</option>
                                            <option value="category" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>Category</option>
                                        </select>
                                        <select value={sourceScopeValue} onChange={e => setSourceScopeValue(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                                            {sourceScopeOptions.length === 0 ? (
                                                <option value="" style={{ background: '#0d0d1a', color: 'rgba(255,255,255,0.4)' }}>Loading...</option>
                                            ) : (
                                                sourceScopeOptions.map(opt => <option key={opt} value={opt} style={{ background: '#0d0d1a', color: '#e8e8f0' }}>{opt}</option>)
                                            )}
                                        </select>
                                    </div>
                                </div>
                                {/* Target Scope */}
                                <div>
                                    <SectionLabel>Target Scope</SectionLabel>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                                        <select value={targetScopeType} onChange={e => { setTargetScopeType(e.target.value as ScopeType); setTargetScopeValue(''); }} style={{ ...selectStyle, width: '100%' }}>
                                            <option value="sku" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>SKU</option>
                                            <option value="category" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>Category</option>
                                        </select>
                                        <select value={targetScopeValue} onChange={e => setTargetScopeValue(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                                            {targetScopeOptions.length === 0 ? (
                                                <option value="" style={{ background: '#0d0d1a', color: 'rgba(255,255,255,0.4)' }}>Loading...</option>
                                            ) : (
                                                targetScopeOptions.map(opt => <option key={opt} value={opt} style={{ background: '#0d0d1a', color: '#e8e8f0' }}>{opt}</option>)
                                            )}
                                        </select>
                                    </div>
                                </div>
                                {/* Operation + value */}
                                <div>
                                    <SectionLabel>Operation &amp; Value</SectionLabel>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <select value={edgeOperation} onChange={e => setEdgeOperation(e.target.value as EdgeOperation)} style={{ ...selectStyle, width: '100%' }}>
                                            <option value="set" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>Set</option>
                                            <option value="multiply" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>Multiply</option>
                                            <option value="add" style={{ background: '#0d0d1a', color: '#e8e8f0' }}>Add</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={edgeValue}
                                            onChange={e => setEdgeValue(e.target.value)}
                                            step="0.01"
                                            placeholder="Value"
                                            style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.9)', fontSize: 13, outline: 'none' }}
                                        />
                                    </div>
                                </div>
                                {/* Actions */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 4 }}>
                                    <GhostButton onClick={() => applyEdgeWeightUpdate(true)} disabled={edgeUpdateLoading}>
                                        Preview
                                    </GhostButton>
                                    <GradientButton onClick={() => applyEdgeWeightUpdate(false)} disabled={edgeUpdateLoading}>
                                        Apply
                                    </GradientButton>
                                </div>
                                {/* Status */}
                                {edgeUpdateStatus && (
                                    <div style={{
                                        fontSize: 12, borderRadius: 8, padding: '8px 12px',
                                        background: edgeUpdateStatus.type === 'success' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                                        border: `1px solid ${edgeUpdateStatus.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                        color: edgeUpdateStatus.type === 'success' ? '#34d399' : '#f87171',
                                    }}>
                                        {edgeUpdateStatus.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SKU Grid */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>SKU Explorer</p>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>Browse products and see their influence patterns</p>
                            </div>
                            <span style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontSize: 11, fontWeight: 700 }}>
                                {filteredSKUs.length} results
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                            {filteredSKUs.map(node => {
                                const isSelected = selectedSKU === node.id;
                                const color = getNodeColor(node);
                                return (
                                    <button
                                        key={node.id}
                                        onClick={() => setSelectedSKU(node.id)}
                                        style={{
                                            padding: 12, borderRadius: 10, textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s',
                                            background: isSelected ? 'rgba(0,207,255,0.08)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isSelected ? 'rgba(0,207,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                                        }}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}1a`, border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color, flexShrink: 0 }}>
                                                {node.category}
                                            </div>
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#e8e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.id}</div>
                                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getSKUDescription(node.id)}</div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reference View ────────────────────────────────────────── */}
            {view === 'reference' && selectedNode && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>

                    {/* Selected SKU summary */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
                        {/* Color dot + SKU */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: `${getNodeColor(selectedNode)}22`, border: `1px solid ${getNodeColor(selectedNode)}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: getNodeColor(selectedNode) }}>
                                {selectedNode.category}
                            </div>
                            <div>
                                <p style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{selectedNode.id}</p>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{getSKUDescription(selectedNode.id)}</p>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                                { label: 'Category', value: CATEGORY_NAMES[selectedNode.category] || selectedNode.category },
                                { label: 'Strength', value: selectedNode.strength.toFixed(2) },
                                { label: 'Label', value: selectedNode.label },
                                { label: 'SKU', value: selectedNode.id },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
                                    <p style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Influences table */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
                        <div style={{ marginBottom: 16 }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Top Influences</p>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>Products most strongly connected to <span style={{ color: '#00cfff' }}>{selectedNode.id}</span></p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {influences.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No influences available</div>
                            ) : influences.map((inf, idx) => {
                                const infColor = CATEGORY_COLORS[inf.category] || '#64748b';
                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.2s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: infColor, boxShadow: `0 0 6px ${infColor}88` }} />
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0', fontFamily: 'monospace' }}>{inf.sku}</div>
                                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{CATEGORY_NAMES[inf.category] || inf.category}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(0,207,255,0.1)', border: '1px solid rgba(0,207,255,0.25)', color: '#00cfff', fontSize: 11, fontWeight: 700 }}>
                                                W {inf.influence_weight.toFixed(2)}
                                            </span>
                                            <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontSize: 11, fontWeight: 700 }}>
                                                S {inf.influence_strength.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
