'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import InsightAssistant from '@/components/features/InsightAssistant';

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
        <div className="min-h-screen bg-background text-foreground">
            {/* Navigation */}
            <nav className="glass border-b border-white/10 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center shadow-lg">
                                    <TrendingUpIcon className="text-white" size={24} />
                                </div>
                                <span className="text-xl font-bold gradient-text">StockSensePro</span>
                            </div>
                            <div className="hidden md:flex items-center gap-1">
                                <button onClick={() => router.push('/manager')} className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-white/5">
                                    Dashboard
                                </button>
                                <button className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary/20 text-secondary">
                                    Forecasts
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => fetchProductDetail()} className="p-2 hover:bg-white/5 rounded-lg">
                                <RefreshIcon className={`text-muted ${chartLoading ? 'animate-spin' : ''}`} size={18} />
                            </button>
                            <button onClick={handleLogout} className="p-2 hover:bg-white/5 rounded-lg">
                                <LogoutIcon className="text-muted hover:text-error" size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight mb-2">
                        <span className="gradient-text">Demand Forecasts</span>
                    </h1>
                    <p className="text-muted text-sm">
                        View <span className="text-cyan-400">real 2023-2024 transaction data</span> and ML-generated forecasts with per-product confidence scores
                    </p>
                </div>

                {/* Filters */}
                <Card glass className="mb-8">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            {/* Category Filter */}
                            <div>
                                <label className="block text-xs text-muted mb-2">Category</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => {
                                        setSelectedCategory(e.target.value);
                                        setSelectedProduct('');
                                    }}
                                    className="w-full !bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-secondary outline-none"
                                >
                                    <option value="">All Categories</option>
                                    {categories.map(cat => (
                                        <option key={cat.code} value={cat.code}>
                                            {cat.name} ({cat.product_count})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Product Filter */}
                            <div className="col-span-2">
                                <label className="block text-xs text-muted mb-2">Product</label>
                                <select
                                    value={selectedProduct}
                                    onChange={(e) => setSelectedProduct(e.target.value)}
                                    className="w-full !bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-secondary outline-none"
                                >
                                    {products.map(prod => (
                                        <option key={prod.sku} value={prod.sku}>
                                            {prod.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Store Filter */}
                            <div>
                                <label className="block text-xs text-muted mb-2">Store</label>
                                <select
                                    value={selectedStore}
                                    onChange={(e) => setSelectedStore(e.target.value)}
                                    className="w-full !bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-secondary outline-none"
                                >
                                    <option value="S1">Store S1</option>
                                    <option value="S2">Store S2</option>
                                    <option value="S3">Store S3</option>
                                </select>
                            </div>

                            {/* History Days */}
                            <div>
                                <label className="block text-xs text-muted mb-2">History</label>
                                <select
                                    value={historyDays}
                                    onChange={(e) => setHistoryDays(Number(e.target.value))}
                                    className="w-full !bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-secondary outline-none"
                                >
                                    <option value={7}>7 days</option>
                                    <option value={14}>14 days</option>
                                    <option value={30}>30 days</option>
                                    <option value={60}>60 days</option>
                                    <option value={90}>90 days</option>
                                </select>
                            </div>

                            {/* Forecast Days */}
                            <div>
                                <label className="block text-xs text-muted mb-2">Forecast</label>
                                <select
                                    value={forecastDays}
                                    onChange={(e) => setForecastDays(Number(e.target.value))}
                                    className="w-full !bg-[#1a1a24] !text-[#e8e8f0] border border-white/10 rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-secondary outline-none"
                                >
                                    <option value={7}>7 days</option>
                                    <option value={14}>14 days</option>
                                    <option value={30}>30 days</option>
                                </select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Product Info Cards */}
                {productDetail && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <Card glass>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted uppercase">Current Stock</p>
                                <h3 className="text-2xl font-bold mt-1">{productDetail.current_stock}</h3>
                                <p className="text-xs text-muted">units</p>
                            </CardContent>
                        </Card>
                        <Card glass>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted uppercase">{forecastDays}-Day Forecast</p>
                                <h3 className="text-2xl font-bold mt-1">{productDetail.seven_day_forecast}</h3>
                                <p className="text-xs text-muted">predicted demand</p>
                            </CardContent>
                        </Card>
                        <Card glass>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted uppercase">Days of Stock</p>
                                <h3 className={`text-2xl font-bold mt-1 ${productDetail.stock_days_remaining < 7 ? 'text-error' : 'text-success'}`}>
                                    {productDetail.stock_days_remaining}
                                </h3>
                                <p className="text-xs text-muted">remaining</p>
                            </CardContent>
                        </Card>
                        <Card glass>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted uppercase">Status</p>
                                <div className="mt-2">{getStatusBadge(productDetail.stock_status)}</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Chart */}
                <Card glass className="mb-8">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <ChartIcon size={18} className="text-primary" />
                                    {productDetail?.product_name || 'Select a product'}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-2">
                                    {productDetail?.category_name} • {selectedStore}
                                    {productDetail?.data_source && (
                                        <Badge variant={productDetail.data_source.includes('real') ? 'success' : 'default'} className="text-xs">
                                            {productDetail.data_source}
                                        </Badge>
                                    )}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-0.5 bg-cyan-400"></div>
                                    <span className="text-muted">Historical</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-0.5 bg-pink-500" style={{ strokeDasharray: '4 4' }}></div>
                                    <span className="text-muted">Forecast</span>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                </Card>

                {/* Product List */}
                <Card glass>
                    <CardHeader>
                        <CardTitle>Products in {categories.find(c => c.code === selectedCategory)?.name || 'All Categories'}</CardTitle>
                        <CardDescription>Click on a product to view its forecast</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {products.map(product => (
                                <div
                                    key={product.sku}
                                    onClick={() => setSelectedProduct(product.sku)}
                                    className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedProduct === product.sku
                                        ? 'border-secondary bg-secondary/10'
                                        : 'border-white/10 hover:border-white/20 bg-white/5'
                                        }`}
                                >
                                    <div className="font-medium text-sm">{product.name}</div>
                                    <div className="text-xs text-muted font-mono mt-1">{product.sku}</div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* LLM Assistant */}
                <InsightAssistant productDetail={productDetail} />
            </div>
        </div>
    );
}
