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

interface PurchaseOrder {
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
        <div className="min-h-screen bg-background text-foreground">
            {/* Navigation */}
            <nav className="glass border-b border-white/10 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center shadow-lg shadow-secondary/20">
                                    <TrendingUpIcon className="text-white" size={24} />
                                </div>
                                <span className="text-xl font-bold gradient-text">StockSensePro</span>
                            </div>
                            <div className="hidden md:flex items-center gap-3">
                                {!userStore && (
                                    <select
                                        value={selectedStore}
                                        onChange={(e) => handleStoreChange(e.target.value)}
                                        className="px-3 py-1.5 !bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-lg text-sm focus:outline-none focus:border-secondary"
                                    >
                                        <option value="">All Stores</option>
                                        <option value="S1">Store S1</option>
                                        <option value="S2">Store S2</option>
                                        <option value="S3">Store S3</option>
                                    </select>
                                )}
                                {userStore && (
                                    <div className="px-3 py-1.5 bg-surface-elevated border border-secondary/30 rounded-lg text-sm text-secondary font-medium">
                                        Store: {userStore}
                                    </div>
                                )}
                            </div>
                            <div className="hidden md:flex items-center gap-1">
                                {['overview', 'forecasts'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => tab === 'forecasts' ? router.push('/forecasts') : setActiveTab(tab)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                            ? 'bg-secondary/20 text-secondary'
                                            : 'text-muted hover:text-foreground hover:bg-white/5'
                                            }`}
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Store Filter - only show for head manager */}
                            {!userStore && (
                                <select
                                    value={selectedStore}
                                    onChange={(e) => handleStoreChange(e.target.value)}
                                    className="bg-slate-900 text-white border border-white/20 rounded-lg py-1.5 px-3 text-xs focus:ring-1 focus:ring-secondary outline-none"
                                >
                                    <option value="">All Stores</option>
                                    <option value="S1">Store S1</option>
                                    <option value="S2">Store S2</option>
                                    <option value="S3">Store S3</option>
                                </select>
                            )}
                            {userStore && (
                                <div className="bg-secondary/20 text-secondary border border-secondary/30 rounded-lg py-1.5 px-3 text-xs font-medium">
                                    Store: {userStore}
                                </div>
                            )}
                            <button
                                onClick={() => fetchForecastData(selectedStore || undefined)}
                                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                                title="Refresh data"
                            >
                                <RefreshIcon className={`text-muted ${forecastLoading ? 'animate-spin' : ''}`} size={18} />
                            </button>
                            <div className="relative hidden sm:block">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search SKU..."
                                    className="!bg-[#1a1a24] !text-[#e8e8f0] border border-white/20 rounded-full py-1.5 pl-9 pr-4 text-xs focus:ring-1 focus:ring-secondary outline-none transition-all w-40 focus:w-56"
                                />
                            </div>
                            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors relative">
                                <BellIcon className="text-muted" size={20} />
                                {alerts.length > 0 && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full animate-pulse"></span>
                                )}
                            </button>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
                                    {user.name ? user.name[0] : user.email[0].toUpperCase()}
                                </div>
                                <div className="hidden sm:block">
                                    <div className="text-sm font-medium">{user.name || user.email}</div>
                                    <div className="text-xs text-secondary flex items-center gap-1">
                                        <BriefcaseIcon size={10} /> Manager
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
                            Welcome back, <span className="gradient-text">{user.name || user.email.split('@')[0]}</span>
                        </h1>
                        <p className="text-muted text-sm flex items-center gap-2">
                            <BriefcaseIcon size={14} className="text-secondary" />
                            Store Manager Dashboard
                            <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" size="sm">
                            <ChartIcon size={14} />
                            View Reports
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => setShowPOModal(true)}>
                            Create PO
                        </Button>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <Card glass className="group hover:border-success/30 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted uppercase tracking-wider">Total Inventory Value</p>
                                <h3 className="text-2xl font-bold mt-1">${(totalInventoryValue / 1000).toFixed(0)}K</h3>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="text-xs text-muted">From real inventory data</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center text-success">
                                <DatabaseIcon size={20} />
                            </div>
                        </div>
                    </Card>

                    <Card glass className="group hover:border-warning/30 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted uppercase tracking-wider">Low Stock Items</p>
                                <h3 className="text-2xl font-bold mt-1 text-warning">{summary?.low_stock_count || 0}</h3>
                                <p className="text-xs text-muted mt-1">From ML predictions</p>
                            </div>
                            <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center text-warning">
                                <AlertIcon size={20} />
                            </div>
                        </div>
                    </Card>

                    <Card glass className="group hover:border-error/30 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted uppercase tracking-wider">Critical Stock</p>
                                <h3 className="text-2xl font-bold mt-1 text-error">{summary?.critical_stock_count || 0}</h3>
                                <p className="text-xs text-muted mt-1">Needs immediate action</p>
                            </div>
                            <div className="w-10 h-10 bg-error/10 rounded-lg flex items-center justify-center text-error">
                                <TrendingDownIcon size={20} />
                            </div>
                        </div>
                    </Card>

                    <Card glass className="group hover:border-info/30 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted uppercase tracking-wider">Products Tracked</p>
                                <h3 className="text-2xl font-bold mt-1">{summary?.total_products || 0}</h3>
                                <p className="text-xs text-muted mt-1">TFT+GNN Model</p>
                            </div>
                            <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center text-info">
                                <ChartIcon size={20} />
                            </div>
                        </div>
                    </Card>
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

                {/* PO Creation Modal */}
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
        </div>
    );
}
