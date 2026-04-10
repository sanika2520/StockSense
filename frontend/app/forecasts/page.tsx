'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

/* ─── Custom dropdown that always opens downward ─────────────────────────── */
interface SelectOption { value: string | number; label: string }
interface CustomSelectProps {
    value: string | number;
    onChange: (v: string) => void;
    options: SelectOption[];
    style?: React.CSSProperties;
}

function CustomSelect({ value, onChange, options, style }: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const selectedLabel = options.find(o => String(o.value) === String(value))?.label ?? '';

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const base: React.CSSProperties = {
        width: '100%',
        background: 'rgba(255,255,255,0.05)',
        color: '#fff',
        border: open ? '1px solid #00cfff' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '8px 32px 8px 12px',
        fontSize: 13,
        outline: 'none',
        transition: 'border 0.2s',
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...style,
    };

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            {/* Trigger */}
            <div style={base} onClick={() => {
  if (!open && ref.current) {
    const rect = ref.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }
  setOpen(o => !o);
}}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedLabel}
                </span>
                <span style={{
                    position: 'absolute', right: 10, top: '50%', transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
                    transition: 'transform 0.2s', pointerEvents: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11,
                }}>▼</span>
            </div>

            {/* Menu — always opens downward via portal */}
            {open && createPortal(
                <div style={{
                    position: 'fixed',
                    top: menuPos.top,
                    left: menuPos.left,
                    width: menuPos.width,
                    background: '#0a0a14',
                    border: '1px solid rgba(0,207,255,0.25)',
                    borderRadius: 8,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                    zIndex: 99999,
                    maxHeight: 240,
                    overflowY: 'auto',
                }}>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            onClick={() => { onChange(String(opt.value)); setOpen(false); }}
                            style={{
                                padding: '9px 14px',
                                fontSize: 13,
                                cursor: 'pointer',
                                color: String(opt.value) === String(value) ? '#00cfff' : '#e8e8f0',
                                background: String(opt.value) === String(value) ? 'rgba(0,207,255,0.08)' : 'transparent',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (String(opt.value) !== String(value)) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                            onMouseLeave={e => { if (String(opt.value) !== String(value)) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}
/* ─────────────────────────────────────────────────────────────────────────── */
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import {
    TrendingUpIcon,
    ChartIcon,
    LogoutIcon,
    SearchIcon,
    RefreshIcon,
} from '@/components/ui/Icons';
//import InsightAssistant from '@/components/features/InsightAssistant';

interface User {
    id?: number;
    name?: string;
    email: string;
    role: string;
}

interface Category {
    code: string;
    name: string;
    product_count: number;
}

interface Product {
    sku: string;
    name: string;
    category: string;
}

interface DemandDataPoint {
    date: string;
    actual: number | null;
    forecast: number | null;
    is_forecast: boolean;
}

interface ProductDetail {
    sku: string;
    product_name: string;
    category: string;
    category_name: string;
    store_id: string;
    current_stock: number;
    confidence: number;
    confidence_level: string;
    demand_data: DemandDataPoint[];
    seven_day_forecast: number;
    stock_days_remaining: number;
    stock_status: string;
    data_source: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ForecastsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

    // Filters
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [selectedStore, setSelectedStore] = useState<string>('S1');
    const [historyDays, setHistoryDays] = useState<number>(30);
    const [forecastDays, setForecastDays] = useState<number>(7);

    // Data
    const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
    const [chartLoading, setChartLoading] = useState(false);

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
        setUser(parsed);
        setLoading(false);

        fetchCategories();
    }, [router]);

    useEffect(() => {
        fetchProducts();
    }, [selectedCategory]);

    useEffect(() => {
        if (selectedProduct) {
            fetchProductDetail();
        }
    }, [selectedProduct, selectedStore, historyDays, forecastDays]);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${API_URL}/forecast/categories`, {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
                if (data.length > 0) {
                    setSelectedCategory(data[0].code);
                }
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    const fetchProducts = async () => {
        try {
            const url = selectedCategory
                ? `${API_URL}/forecast/products?category=${selectedCategory}`
                : `${API_URL}/forecast/products`;
            const res = await fetch(url, {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setProducts(data);
                if (data.length > 0 && !selectedProduct) {
                    setSelectedProduct(data[0].sku);
                }
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const fetchProductDetail = async () => {
        if (!selectedProduct) return;

        setChartLoading(true);
        try {
            const res = await fetch(
                `${API_URL}/forecast/detail/${selectedProduct}?store_id=${selectedStore}&history_days=${historyDays}&forecast_days=${forecastDays}`,
                {
                    headers: getAuthHeaders(),
                }
            );
            if (res.ok) {
                const data = await res.json();
                setProductDetail(data);
            }
        } catch (error) {
            console.error('Error fetching product detail:', error);
        } finally {
            setChartLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-2xl font-bold gradient-text">Loading...</div>
            </div>
        );
    }

    if (!user) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ok': return <Badge variant="success">Healthy</Badge>;
            case 'low': return <Badge variant="warning">Low Stock</Badge>;
            case 'critical': return <Badge variant="error">Critical</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    // Calculate chart dimensions
    const chartWidth = 800;
    const chartHeight = 300;
    const padding = { top: 20, right: 30, bottom: 40, left: 50 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // Generate chart path
    const generateChartPath = () => {
        if (!productDetail?.demand_data) return { actualPath: '', forecastPath: '', points: [] };

        const data = productDetail.demand_data;
        const values = data.map(d => d.actual || d.forecast || 0);
        const maxValue = Math.max(...values) * 1.1;
        const minValue = Math.min(...values) * 0.9;
        const range = maxValue - minValue || 1;

        const xScale = (i: number) => (i / (data.length - 1)) * innerWidth;
        const yScale = (v: number) => innerHeight - ((v - minValue) / range) * innerHeight;

        let actualPath = '';
        let forecastPath = '';
        const points: { x: number; y: number; value: number; date: string; isForecast: boolean }[] = [];

        let lastActualX = 0;
        let lastActualY = 0;

        data.forEach((d, i) => {
            const x = xScale(i);
            const value = d.actual || d.forecast || 0;
            const y = yScale(value);

            points.push({ x, y, value, date: d.date, isForecast: d.is_forecast });

            if (!d.is_forecast && d.actual !== null) {
                if (actualPath === '') {
                    actualPath = `M ${x} ${y}`;
                } else {
                    actualPath += ` L ${x} ${y}`;
                }
                lastActualX = x;
                lastActualY = y;
            } else if (d.is_forecast && d.forecast !== null) {
                if (forecastPath === '') {
                    // Start from last actual point for continuity
                    forecastPath = `M ${lastActualX} ${lastActualY} L ${x} ${y}`;
                } else {
                    forecastPath += ` L ${x} ${y}`;
                }
            }
        });

        return { actualPath, forecastPath, points, maxValue, minValue };
    };

    const { actualPath, forecastPath, points, maxValue, minValue } = generateChartPath();

    return (
        <div style={{ minHeight: '100vh', background: '#060610', color: '#e8e8f0', fontFamily: "'Inter',system-ui,sans-serif" }}>
            {/* Navigation */}
            <nav style={{ position: 'sticky', top: 0, zIndex: 50, height: 64, display: 'flex', alignItems: 'center', background: 'rgba(6,6,16,0.85)', backdropFilter: 'blur(24px) saturate(160%)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 2rem' }}>
                <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#00cfff,#6366f1)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,207,255,0.3)' }}>
                                <TrendingUpIcon className="text-white" size={20} />
                            </div>
                            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.025em', color: '#fff' }}>StockSense</span>
                        </div>
                        <div className="hidden md:flex items-center gap-4">
                            <button
                                onClick={() => router.push('/manager')}
                                style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: 'transparent', color: 'rgba(255,255,255,0.45)' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
                            >
                                Dashboard
                            </button>
                            <button
                                style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: 'rgba(0,207,255,0.1)', color: '#00cfff', boxShadow: '0 0 0 1px rgba(0,207,255,0.2)' }}
                            >
                                Forecasts
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={() => fetchProductDetail()}
                            style={{ position: 'relative', padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8 }}
                            title="Refresh data"
                        >
                            <span style={{ color: 'rgba(255,255,255,0.4)' }}><RefreshIcon className={chartLoading ? 'animate-spin' : ''} size={18} /></span>
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #00cfff, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'M'}
                            </div>
                            <div className="hidden md:block">
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name || 'Manager'}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{user?.email}</div>
                            </div>
                        </div>

                        <button onClick={handleLogout} style={{ padding: 8, marginLeft: 8, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8, color: 'rgba(255,255,255,0.35)', transition: 'color 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
                            <LogoutIcon size={17} />
                        </button>
                    </div>
                </div>
            </nav>

            <div style={{
                marginRight: drawerOpen ? 380 : 0,
                transition: 'margin-right 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                padding: '2rem 2rem',
            }}>
                {/* Header */}
                <div style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 8 }}>
                        Demand Forecasts
                    </h1>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
                        View <span style={{ color: '#00cfff' }}>real 2023-2024 transaction data</span> and ML-generated forecasts with per-product confidence scores
                    </p>
                </div>

                {/* Filters */}
                <div style={{ background: 'rgba(6,6,16,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, marginBottom: 32,  overflow: 'visible', isolation: 'isolate' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, alignItems: 'flex-start' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Category</label>
                            <CustomSelect
                                value={selectedCategory}
                                onChange={(v) => { setSelectedCategory(v); setSelectedProduct(''); }}
                                options={[
                                    { value: '', label: 'All Categories' },
                                    ...categories.map(cat => ({ value: cat.code, label: `${cat.name} (${cat.product_count})` })),
                                ]}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Product</label>
                            <CustomSelect
                                value={selectedProduct}
                                onChange={setSelectedProduct}
                                options={products.map(prod => ({ value: prod.sku, label: prod.name }))}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Store</label>
                            <CustomSelect
                                value={selectedStore}
                                onChange={setSelectedStore}
                                options={[
                                    { value: 'S1', label: 'Store S1' },
                                    { value: 'S2', label: 'Store S2' },
                                    { value: 'S3', label: 'Store S3' },
                                ]}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>History</label>
                            <CustomSelect
                                value={historyDays}
                                onChange={(v) => setHistoryDays(Number(v))}
                                options={[
                                    { value: 7, label: '7 days' },
                                    { value: 14, label: '14 days' },
                                    { value: 30, label: '30 days' },
                                    { value: 60, label: '60 days' },
                                    { value: 90, label: '90 days' },
                                ]}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Forecast</label>
                            <CustomSelect
                                value={forecastDays}
                                onChange={(v) => setForecastDays(Number(v))}
                                options={[
                                    { value: 7, label: '7 days' },
                                    { value: 14, label: '14 days' },
                                    { value: 30, label: '30 days' },
                                ]}
                            />
                        </div>
                    </div>
                </div>

                {/* Product Info Cards */}
                {productDetail && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 32 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(circle at top right, rgba(0,207,255,0.05), transparent 60%)' }}></div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Stock</p>
                                <h3 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '8px 0 4px 0', letterSpacing: '-0.02em' }}>{productDetail.current_stock}</h3>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>units</p>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(circle at top right, rgba(99,102,241,0.05), transparent 60%)' }}></div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{forecastDays}-Day Forecast</p>
                                <h3 style={{ fontSize: 28, fontWeight: 800, color: '#818cf8', margin: '8px 0 4px 0', letterSpacing: '-0.02em' }}>{productDetail.seven_day_forecast}</h3>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>predicted demand</p>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: `radial-gradient(circle at top right, ${productDetail.stock_days_remaining < 7 ? 'rgba(248,113,113,0.05)' : 'rgba(0,207,255,0.05)'}, transparent 60%)` }}></div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Days of Stock</p>
                                <h3 style={{ fontSize: 28, fontWeight: 800, color: productDetail.stock_days_remaining < 7 ? '#f87171' : '#00cfff', margin: '8px 0 4px 0', letterSpacing: '-0.02em' }}>{productDetail.stock_days_remaining}</h3>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>remaining</p>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(circle at top right, rgba(255,255,255,0.02), transparent 60%)' }}></div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</p>
                                <div style={{ marginTop: 12 }}>{getStatusBadge(productDetail.stock_status)}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Chart */}
                <div style={{ background: 'rgba(6,6,16,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', marginBottom: 32 }}>
                    <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ color: '#00cfff', display: 'flex' }}><ChartIcon size={18} /></span>
                                {productDetail?.product_name || 'Select a product'}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>
                                {productDetail?.category_name} • {selectedStore}
                                {productDetail?.data_source && (
                                    <Badge variant={productDetail.data_source.includes('real') ? 'success' : 'default'} className="text-xs">
                                        {productDetail.data_source}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 16, height: 2, background: '#00cfff' }}></div>
                                <span style={{ color: 'rgba(255,255,255,0.45)' }}>Historical</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 16, height: 2, background: '#ec4899', borderBottom: '2px dashed #ec4899' }}></div>
                                <span style={{ color: 'rgba(255,255,255,0.45)' }}>Forecast</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: 24 }}>
                        {chartLoading ? (
                            <div className="h-80 flex items-center justify-center text-muted">
                                Loading chart data...
                            </div>
                        ) : productDetail?.demand_data ? (
                            <div className="overflow-x-auto">
                                <svg width={chartWidth} height={chartHeight} className="mx-auto">
                                    <defs>
                                        <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="rgb(34, 211, 238)" stopOpacity="0.3" />
                                            <stop offset="100%" stopColor="rgb(34, 211, 238)" stopOpacity="0" />
                                        </linearGradient>
                                        <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="rgb(236, 72, 153)" stopOpacity="0.3" />
                                            <stop offset="100%" stopColor="rgb(236, 72, 153)" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>

                                    <g transform={`translate(${padding.left}, ${padding.top})`}>
                                        {/* Grid lines */}
                                        {[0, 1, 2, 3, 4].map(i => (
                                            <line
                                                key={i}
                                                x1={0}
                                                y1={(innerHeight / 4) * i}
                                                x2={innerWidth}
                                                y2={(innerHeight / 4) * i}
                                                stroke="rgba(255,255,255,0.1)"
                                                strokeDasharray="4"
                                            />
                                        ))}

                                        {/* Area fill for actual */}
                                        {actualPath && (
                                            <path
                                                d={`${actualPath} L ${points.filter(p => !p.isForecast).slice(-1)[0]?.x || 0} ${innerHeight} L ${points[0]?.x || 0} ${innerHeight} Z`}
                                                fill="url(#actualGradient)"
                                            />
                                        )}

                                        {/* Actual demand line */}
                                        <path
                                            d={actualPath}
                                            fill="none"
                                            stroke="rgb(34, 211, 238)"
                                            strokeWidth="2"
                                        />

                                        {/* Forecast line */}
                                        <path
                                            d={forecastPath}
                                            fill="none"
                                            stroke="rgb(236, 72, 153)"
                                            strokeWidth="2"
                                            strokeDasharray="6 3"
                                        />

                                        {/* Today marker */}
                                        {points.length > 0 && (
                                            <g>
                                                {(() => {
                                                    const todayIndex = points.findIndex(p => p.isForecast) - 1;
                                                    if (todayIndex >= 0 && points[todayIndex]) {
                                                        return (
                                                            <>
                                                                <line
                                                                    x1={points[todayIndex].x}
                                                                    y1={0}
                                                                    x2={points[todayIndex].x}
                                                                    y2={innerHeight}
                                                                    stroke="rgba(255,255,255,0.3)"
                                                                    strokeDasharray="4"
                                                                />
                                                                <text
                                                                    x={points[todayIndex].x}
                                                                    y={-5}
                                                                    fill="rgba(255,255,255,0.6)"
                                                                    fontSize="10"
                                                                    textAnchor="middle"
                                                                >
                                                                    Last Data
                                                                </text>
                                                            </>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </g>
                                        )}

                                        {/* Data points */}
                                        {points.map((point, i) => (
                                            <circle
                                                key={i}
                                                cx={point.x}
                                                cy={point.y}
                                                r={3}
                                                fill={point.isForecast ? 'rgb(236, 72, 153)' : 'rgb(34, 211, 238)'}
                                                className="hover:r-5 transition-all cursor-pointer"
                                            >
                                                <title>{point.date}: {point.value.toFixed(1)} units</title>
                                            </circle>
                                        ))}

                                        {/* Y-axis labels */}
                                        {maxValue && [0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                                            const value = minValue! + (maxValue - minValue!) * (1 - pct);
                                            return (
                                                <text
                                                    key={i}
                                                    x={-10}
                                                    y={(innerHeight * pct) + 4}
                                                    fill="rgba(255,255,255,0.5)"
                                                    fontSize="10"
                                                    textAnchor="end"
                                                >
                                                    {value.toFixed(0)}
                                                </text>
                                            );
                                        })}

                                        {/* X-axis labels */}
                                        {points.filter((_, i) => i % Math.ceil(points.length / 6) === 0).map((point, i) => (
                                            <text
                                                key={i}
                                                x={point.x}
                                                y={innerHeight + 20}
                                                fill="rgba(255,255,255,0.5)"
                                                fontSize="10"
                                                textAnchor="middle"
                                            >
                                                {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </text>
                                        ))}
                                    </g>
                                </svg>
                            </div>
                        ) : (
                            <div className="h-80 flex items-center justify-center text-muted">
                                Select a product to view demand data
                            </div>
                        )}
                    </div>
                </div>

                {/* Product List */}
                <div style={{ background: 'rgba(6,6,16,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', marginBottom: 32 }}>
                    <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Products in {categories.find(c => c.code === selectedCategory)?.name || 'All Categories'}</h3>
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Click on a product to view its forecast</p>
                    </div>
                    <div style={{ padding: 24 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            {products.map(product => (
                                <div
                                    key={product.sku}
                                    onClick={() => setSelectedProduct(product.sku)}
                                    style={{
                                        padding: 16,
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        border: selectedProduct === product.sku ? '1px solid rgba(0,207,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                        background: selectedProduct === product.sku ? 'rgba(0,207,255,0.05)' : 'rgba(255,255,255,0.02)'
                                    }}
                                    onMouseEnter={e => { if (selectedProduct !== product.sku) e.currentTarget.style.border = '1px solid rgba(255,255,255,0.15)' }}
                                    onMouseLeave={e => { if (selectedProduct !== product.sku) e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)' }}
                                >
                                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedProduct === product.sku ? '#00cfff' : '#fff', marginBottom: 4 }}>{product.name}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{product.sku}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                
            </div>
        </div>
    );
}
