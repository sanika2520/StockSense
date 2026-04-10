'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import {
    TrendingUpIcon,
    TrendingDownIcon,
    ChartIcon,
    LogoutIcon,
    BellIcon,
    BriefcaseIcon,
    SearchIcon,
    AlertIcon,
    DatabaseIcon,
    RefreshIcon,
} from '@/components/ui/Icons';
import AlertsPanel from './components/AlertsPanel';
import ForecastsTable from './components/ForecastsTable';
import PurchaseOrders from './components/PurchaseOrders';
import InventoryByStore from './components/InventoryByStore';
import PurchaseOrderModal from './components/PurchaseOrderModal';
import RebalancingWorkflowModal from './components/RebalancingWorkflowModal';

interface User {
    id?: number;
    name?: string;
    email: string;
    role: string;
}

interface ForecastItem {
    sku: string;
    product_name: string;
    category: string;
    store_id: string;
    current_stock: number;
    seven_day_forecast: number;
    stock_status: string;
    daily_forecasts: Array<{ date: string; predicted_demand: number }>;
}

interface ForecastAlert {
    id: string;
    type: string;
    severity: string;
    product_name: string;
    sku: string;
    store_id: string;
    current_stock: number;
    predicted_demand: number;
    message: string;
}

interface ForecastSummary {
    total_products: number;
    critical_stock_count: number;
    low_stock_count: number;
    avg_confidence: number;
}

interface ProductCatalogItem {
    sku: string;
    name: string;
    category: string;
}

interface DropdownProductOption {
    sku: string;
    product_name: string;
    category: string;
    current_stock: number;
    seven_day_forecast: number;
}

export interface PurchaseOrder {
    id: number;
    po_number: string;
    store_id: string;
    total_items: number;
    total_quantity: number;
    total_amount: number | null;
    status: string;
    created_at: string;
    expected_delivery_date: string | null;
}

interface PurchaseOrderItemCreate {
    sku: string;
    product_category?: string;
    quantity_requested: number;
    unit_price?: number | null;
    notes?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ManagerDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Forecast data state
    const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
    const [alerts, setAlerts] = useState<ForecastAlert[]>([]);
    const [summary, setSummary] = useState<ForecastSummary | null>(null);
    const [productCatalog, setProductCatalog] = useState<ProductCatalogItem[]>([]);
    const [forecastLoading, setForecastLoading] = useState(false);
    const [selectedStore, setSelectedStore] = useState<string>('');

    // Purchase order state
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [showPOModal, setShowPOModal] = useState(false);
    const [poItems, setPOItems] = useState<PurchaseOrderItemCreate[]>([]);
    const [poNotes, setPONotes] = useState('');
    const [showRebalancingModal, setShowRebalancingModal] = useState(false);

    // Inventory data state
    const [inventoryByStore, setInventoryByStore] = useState<any[]>([]);
    const [totalInventoryValue, setTotalInventoryValue] = useState<number>(0);
    const [userStore, setUserStore] = useState<string | null>(null);

    const getAuthHeaders = (): HeadersInit => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!userData) {
            router.push('/auth/login');
            return;
        }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'manager') {
            if (parsed.role === 'admin') {
                router.push('/admin');
            } else {
                router.push('/dashboard');
            }
            return;
        }
        setUser(parsed);
        const assignedStore = parsed.store_id || null;
        setUserStore(assignedStore);

        // Set selectedStore to user's assigned store if they have one
        if (assignedStore) {
            setSelectedStore(assignedStore);
        }
        setLoading(false);

        // Fetch forecast data with user's store filter
        fetchForecastData(assignedStore);
    }, [router]);

    const fetchForecastData = async (forcedStoreId?: string) => {
        setForecastLoading(true);
        try {
            // CRITICAL: Get user's assigned store FIRST
            const userData = localStorage.getItem('user');
            const parsedUser = userData ? JSON.parse(userData) : null;
            const userAssignedStore = parsedUser?.store_id;

            // If user has assigned store, ONLY use that - ignore all other parameters
            const effectiveStore = userAssignedStore || forcedStoreId || selectedStore;
            const storeParam = effectiveStore ? `?store_id=${effectiveStore}` : '';

            console.log('🔒 Fetching data for store:', effectiveStore, 'User assigned:', userAssignedStore);

            const authHeaders = getAuthHeaders();

            // Fetch forecasts by product
            const forecastRes = await fetch(`${API_URL}/forecast/by-product${storeParam}`, {
                headers: authHeaders,
            });
            if (forecastRes.ok) {
                const forecastData = await forecastRes.json();
                setForecasts(forecastData);
            }

            // Fetch alerts
            const alertsRes = await fetch(`${API_URL}/forecast/alerts${storeParam}`, {
                headers: authHeaders,
            });
            if (alertsRes.ok) {
                const alertsData = await alertsRes.json();
                setAlerts(alertsData);
            }

            // Fetch summary
            const summaryRes = await fetch(`${API_URL}/forecast/summary${storeParam}`, {
                headers: authHeaders,
            });
            if (summaryRes.ok) {
                const summaryData = await summaryRes.json();
                setSummary(summaryData);
            }

            // Fetch full product catalog (CSV-backed) for category/SKU dropdowns
            const productsRes = await fetch(`${API_URL}/forecast/products`, {
                headers: authHeaders,
            });
            if (productsRes.ok) {
                const productsData = await productsRes.json();
                setProductCatalog(Array.isArray(productsData) ? productsData : []);
            }

            // Fetch purchase orders
            if (userData) {
                const userStore = parsedUser.store_id;
                const poStoreId = userStore || forcedStoreId;
                if (poStoreId) {
                    const poRes = await fetch(`${API_URL}/api/purchase-orders/?store_id=${poStoreId}`, {
                        headers: authHeaders,
                    });
                    if (poRes.ok) {
                        const poData = await poRes.json();
                        setPurchaseOrders(poData);
                    }
                }
            }

            // Fetch inventory values - only user's store if assigned, otherwise all or selected
            const stores = userAssignedStore ? [userAssignedStore] : (forcedStoreId ? [forcedStoreId] : ['S1', 'S2', 'S3']);
            const inventoryPromises = stores.map(async (store) => {
                const invRes = await fetch(`${API_URL}/forecast/inventory-value?store_id=${store}`, {
                    headers: authHeaders,
                });
                if (invRes.ok) {
                    const invData = await invRes.json();

                    // Get store-specific forecast summary for stock status
                    const storeAlerts = await fetch(`${API_URL}/forecast/alerts?store_id=${store}`, {
                        headers: authHeaders,
                    });
                    let lowCount = 0, criticalCount = 0;
                    if (storeAlerts.ok) {
                        const alertsData = await storeAlerts.json();
                        lowCount = alertsData.filter((a: any) => a.severity === 'medium').length;
                        criticalCount = alertsData.filter((a: any) => a.severity === 'high').length;
                    }

                    return {
                        store,
                        totalSKUs: invData.total_skus,
                        lowStock: lowCount,
                        criticalStock: criticalCount,
                        value: invData.estimated_value
                    };
                }
                return null;
            });

            const inventoryData = (await Promise.all(inventoryPromises)).filter(Boolean);
            setInventoryByStore(inventoryData);

            // Calculate total inventory value across all stores
            const totalValue = inventoryData.reduce((sum, store) => sum + (store?.value || 0), 0);
            setTotalInventoryValue(totalValue);
        } catch (error) {
            console.error('Error fetching forecast data:', error);
        } finally {
            setForecastLoading(false);
        }
    };

    const handleStoreChange = (storeId: string) => {
        // Prevent store changes if user is assigned to specific store
        const userData = localStorage.getItem('user');
        if (userData) {
            const parsedUser = JSON.parse(userData);
            if (parsedUser.store_id) {
                // User is locked to their store, don't allow changes
                return;
            }
        }
        setSelectedStore(storeId);
        fetchForecastData(storeId || undefined);
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-2xl font-bold gradient-text">Loading Manager Dashboard...</div>
            </div>
        );
    }

    if (!user) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ok': return <Badge variant="success">OK</Badge>;
            case 'low': return <Badge variant="warning">Low</Badge>;
            case 'critical': return <Badge variant="error">Critical</Badge>;
            case 'pending': return <Badge variant="warning">Pending</Badge>;
            case 'approved': return <Badge variant="info">Approved</Badge>;
            case 'delivered': return <Badge variant="success">Delivered</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high': return 'border-l-error bg-error/5';
            case 'medium': return 'border-l-warning bg-warning/5';
            case 'low': return 'border-l-info bg-info/5';
            default: return 'border-l-muted';
        }
    };

    const dropdownProductOptions: DropdownProductOption[] = productCatalog.length > 0
        ? productCatalog.map((p) => ({
            sku: p.sku,
            product_name: p.name,
            category: p.category || 'Uncategorized',
            current_stock: 0,
            seven_day_forecast: 0,
        }))
        : forecasts.map((f) => ({
            sku: f.sku,
            product_name: f.product_name,
            category: f.category || 'Uncategorized',
            current_stock: f.current_stock,
            seven_day_forecast: f.seven_day_forecast,
        }));

    return (
        <div style={{ minHeight:'100vh', background:'#060610', color:'#e8e8f0', fontFamily:"'Inter',system-ui,sans-serif" }}>
            {/* Navigation */}
            <nav style={{ position:'sticky', top:0, zIndex:50, height:64, display:'flex', alignItems:'center', background:'rgba(6,6,16,0.85)', backdropFilter:'blur(24px) saturate(160%)', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'0 2rem' }}>
                <div style={{ maxWidth:1280, margin:'0 auto', width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:32 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:36, height:36, background:'linear-gradient(135deg,#00cfff,#6366f1)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(0,207,255,0.3)' }}>
                                <TrendingUpIcon className="text-white" size={20} />
                            </div>
                            <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.025em', color:'#fff' }}>StockSense</span>
                        </div>
                        <div className="hidden md:flex items-center gap-4">
                            {!userStore && (
                                <select
                                    value={selectedStore}
                                    onChange={(e) => handleStoreChange(e.target.value)}
                                    style={{ padding:'6px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', outline:'none', fontSize:13 }}
                                >
                                    <option value="" style={{ background: '#0d0d1a' }}>All Stores</option>
                                    <option value="S1" style={{ background: '#0d0d1a' }}>Store S1</option>
                                    <option value="S2" style={{ background: '#0d0d1a' }}>Store S2</option>
                                    <option value="S3" style={{ background: '#0d0d1a' }}>Store S3</option>
                                </select>
                            )}
                            {userStore && (
                                <div style={{ padding:'6px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(0,207,255,0.2)', borderRadius:8, color:'#00cfff', fontSize:13, fontWeight:600 }}>
                                    Store: {userStore}
                                </div>
                            )}
                            {['overview', 'forecasts'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => tab === 'forecasts' ? router.push('/forecasts') : setActiveTab(tab)}
                                    style={{ padding:'6px 16px', borderRadius:8, fontSize:13, fontWeight:600, border:'none', cursor:'pointer', transition:'all 0.2s',
                                        background: activeTab === tab ? 'rgba(0,207,255,0.1)' : 'transparent',
                                        color: activeTab === tab ? '#00cfff' : 'rgba(255,255,255,0.45)',
                                        boxShadow: activeTab === tab ? '0 0 0 1px rgba(0,207,255,0.2)' : 'none',
                                    }}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                        <button
                            onClick={() => fetchForecastData(selectedStore || undefined)}
                            style={{ padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8, color:'rgba(255,255,255,0.4)' }}
                            title="Refresh data"
                        >
                            <RefreshIcon className={forecastLoading ? 'animate-spin' : ''} size={18} />
                        </button>
                        <div className="relative hidden sm:block">
                            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.4)', pointerEvents:'none', display:'flex' }}><SearchIcon size={16} /></span>
                            <input
                                type="text"
                                placeholder="Search SKU..."
                                style={{ width:180, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:'6px 16px 6px 32px', fontSize:13, color:'#fff', outline:'none', transition:'all 0.2s' }}
                                onFocus={(e)=>e.currentTarget.style.border='1px solid #00cfff'}
                                onBlur={(e)=>e.currentTarget.style.border='1px solid rgba(255,255,255,0.1)'}
                            />
                        </div>
                        <button style={{ position:'relative', padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8 }}>
                            <span style={{ color:'rgba(255,255,255,0.4)' }}><BellIcon size={18} /></span>
                            {alerts.length > 0 && (
                                <span style={{ position:'absolute', top:8, right:8, width:6, height:6, background:'#f87171', borderRadius:'50%' }}></span>
                            )}
                        </button>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#00cfff,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', boxShadow:'0 0 12px rgba(0,207,255,0.25)' }}>
                                {user.name ? user.name[0] : user.email[0].toUpperCase()}
                            </div>
                            <div className="hidden sm:block text-left">
                                <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{user.name || user.email}</div>
                                <div style={{ fontSize:11, color:'#00cfff', display:'flex', alignItems:'center', gap:4 }}>
                                    <BriefcaseIcon size={9} /> Manager
                                </div>
                            </div>
                        </div>
                        <button onClick={handleLogout} style={{ padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8, color:'rgba(255,255,255,0.35)', transition:'color 0.2s' }}
                            onMouseEnter={e=>(e.currentTarget.style.color='#f87171')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.35)')}>
                            <LogoutIcon size={17} />
                        </button>
                    </div>
                </div>
            </nav>

            <div style={{ maxWidth:1280, margin:'0 auto', padding:'2rem 2rem' }}>
                {/* Header */}
                <div style={{ display:'flex', flexDirection:'column', gap:16, marginBottom:32 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
                        <div>
                            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 8 }}>
                                Welcome back, <span style={{ color:'#00cfff' }}>{user.name || user.email.split('@')[0]}</span>
                            </h1>
                            <p style={{ display:'flex', alignItems:'center', gap:8, color:'rgba(255,255,255,0.45)', fontSize:14 }}>
                                <span style={{ color:'#00cfff', display:'flex' }}><BriefcaseIcon size={14} /></span>
                                Store Manager Dashboard
                                <span style={{ width:4, height:4, background:'rgba(255,255,255,0.2)', borderRadius:'50%' }}></span>
                                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            </p>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <button
                                type="button"
                                style={{ whiteSpace:'nowrap', height:42, padding:'0 20px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'#fff', cursor:'pointer', transition:'all 0.2s', display:'flex', alignItems:'center', gap:8 }}
                                onMouseEnter={e=> { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' }}
                                onMouseLeave={e=> { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
                            >
                                <ChartIcon size={16} />
                                View Reports
                            </button>
    
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:24, marginBottom:32 }}>
                    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:24, position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', background:'radial-gradient(circle at top right, rgba(0,207,255,0.05), transparent 60%)' }}></div>
                        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                                <p style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Total Inventory Value</p>
                                <h3 style={{ fontSize:28, fontWeight:800, color:'#fff', margin:'8px 0 4px 0', letterSpacing:'-0.02em' }}>${(totalInventoryValue / 1000).toFixed(0)}K</h3>
                                <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>From real inventory data</div>
                            </div>
                            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(0,207,255,0.12)', border:'1px solid rgba(0,207,255,0.2)', color:'#00cfff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <DatabaseIcon size={20} />
                            </div>
                        </div>
                    </div>

                    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:24, position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', background:'radial-gradient(circle at top right, rgba(251,191,36,0.05), transparent 60%)' }}></div>
                        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                                <p style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Low Stock Items</p>
                                <h3 style={{ fontSize:28, fontWeight:800, color:'#fbbf24', margin:'8px 0 4px 0', letterSpacing:'-0.02em' }}>{summary?.low_stock_count || 0}</h3>
                                <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>From ML predictions</p>
                            </div>
                            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.2)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <AlertIcon size={20} />
                            </div>
                        </div>
                    </div>

                    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:24, position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', background:'radial-gradient(circle at top right, rgba(248,113,113,0.05), transparent 60%)' }}></div>
                        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                                <p style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Critical Stock</p>
                                <h3 style={{ fontSize:28, fontWeight:800, color:'#f87171', margin:'8px 0 4px 0', letterSpacing:'-0.02em' }}>{summary?.critical_stock_count || 0}</h3>
                                <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Needs immediate action</p>
                            </div>
                            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.2)', color:'#f87171', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <TrendingDownIcon size={20} />
                            </div>
                        </div>
                    </div>

                    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:24, position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', background:'radial-gradient(circle at top right, rgba(99,102,241,0.05), transparent 60%)' }}></div>
                        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                                <p style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Products Tracked</p>
                                <h3 style={{ fontSize:28, fontWeight:800, color:'#fff', margin:'8px 0 4px 0', letterSpacing:'-0.02em' }}>{summary?.total_products || 0}</h3>
                                <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>TFT+GNN Model</p>
                            </div>
                            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.2)', color:'#818cf8', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <ChartIcon size={20} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                    <AlertsPanel alerts={alerts} forecastLoading={forecastLoading} getSeverityColor={getSeverityColor} />
                    <ForecastsTable forecasts={forecasts} forecastLoading={forecastLoading} getStatusBadge={getStatusBadge} router={router} />
                </div>

                {/* Bottom Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <PurchaseOrders purchaseOrders={purchaseOrders} forecastLoading={forecastLoading} getStatusBadge={getStatusBadge} setShowPOModal={setShowPOModal} />
                    <InventoryByStore inventoryByStore={inventoryByStore} onManage={() => setShowRebalancingModal(true)} />
                </div>

                </div>

        
            {/* PO Creation Modal - outside content wrapper so it covers full viewport */}
            <PurchaseOrderModal
                showPOModal={showPOModal}
                setShowPOModal={setShowPOModal}
                alerts={alerts}
                forecasts={dropdownProductOptions}
                poItems={poItems}
                setPOItems={setPOItems}
                poNotes={poNotes}
                setPONotes={setPONotes}
                handleCreatePO={async () => {
                    if (poItems.length === 0) {
                        alert('Please add at least one item to the PO');
                        return;
                    }
                    const userData = localStorage.getItem('user');
                    if (!userData) return;
                    const parsedUser = JSON.parse(userData);
                    const storeId = parsedUser.store_id || selectedStore || 'S1';
                    try {
                        const res = await fetch(`${API_URL}/api/purchase-orders/`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...getAuthHeaders(),
                            },
                            body: JSON.stringify({
                                store_id: storeId,
                                created_by_user_id: parsedUser.id,
                                items: poItems,
                                notes: poNotes || null,
                                expected_delivery_date: null
                            })
                        });
                        if (res.ok) {
                            const newPO = await res.json();
                            setPurchaseOrders([newPO, ...purchaseOrders]);
                            setShowPOModal(false);
                            setPOItems([]);
                            setPONotes('');
                            alert(`Purchase Order ${newPO.po_number} created successfully!`);
                        } else {
                            const error = await res.json();
                            alert(`Failed to create PO: ${error.detail || 'Unknown error'}`);
                        }
                    } catch (error) {
                        console.error('Failed to create PO:', error);
                        alert('Failed to create purchase order');
                    }
                }}
            />

            <RebalancingWorkflowModal
                showModal={showRebalancingModal}
                setShowModal={setShowRebalancingModal}
                inventoryByStore={inventoryByStore}
                forecasts={dropdownProductOptions}
                userStore={userStore}
                selectedStore={selectedStore}
                apiUrl={API_URL}
                getAuthHeaders={getAuthHeaders}
                onPlanCreated={() => fetchForecastData(selectedStore || undefined)}
            />
        </div>
    );
}
    