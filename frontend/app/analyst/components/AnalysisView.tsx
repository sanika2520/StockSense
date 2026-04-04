'use client';

import { useState, useEffect, useMemo } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { ChartIcon, SearchIcon, CheckIcon, CalendarIcon, DatabaseIcon } from '@/components/ui/Icons';

// --- Types ---
interface Product {
    sku: string;
    name: string;
    category: string;
}

interface DataPoint {
    date: string;
    [key: string]: number | string;
}

interface ComparisonApiPoint {
    date: string;
    store_id: string;
    product_id: string;
    demand: number;
}

interface ComparisonApiResponse {
    start_date: string;
    end_date: string;
    points: ComparisonApiPoint[];
    data_source: string;
}

interface StoreOption {
    id: string;
    label: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const STORE_OPTIONS: StoreOption[] = [
    { id: 'S1', label: 'Store S1 (Downtown)' },
    { id: 'S2', label: 'Store S2 (Westside)' },
    { id: 'S3', label: 'Store S3 (Airport)' },
];

const buildDateRange = (startDate: string, endDate: string) => {
    const result: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) return result;

    const cursor = new Date(start);
    while (cursor <= end) {
        result.push(cursor.toISOString().split('T')[0]);
        cursor.setDate(cursor.getDate() + 1);
    }

    return result;
};

// --- Aggregate Data ---
const aggregateData = (data: DataPoint[], periodicity: 'daily' | 'weekly' | 'monthly') => {
    if (periodicity === 'daily' || data.length === 0) return data;

    const aggregated: DataPoint[] = [];
    let currentPeriod: DataPoint | null = null;
    let periodKey = '';

    data.forEach(d => {
        let key = '';
        if (periodicity === 'weekly') {
            // ISO Week (simplified: just grouping by year-week string if available, or just buckets of 7)
            // Using buckets of 7 for simplicity and speed (approx weekly)
            // Better: get actual week number
            const date = new Date(d.date);
            const onejan = new Date(date.getFullYear(), 0, 1);
            const week = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
            key = `${date.getFullYear()}-W${week}`;

        } else if (periodicity === 'monthly') {
            key = d.date.substring(0, 7); // YYYY-MM
        }

        if (key !== periodKey) {
            if (currentPeriod) {
                // finalize previous
                // Average the values? Or sum? For Demand/Sales, SUM is usually better. 
                // However, for viewing "trends" of avg daily sales, average is better.
                // Let's do Average for now to keep scale similar to daily.
                Object.keys(currentPeriod).forEach(k => {
                    if (k !== 'date' && k !== 'count') {
                        currentPeriod![k] = Number(currentPeriod![k]) / (currentPeriod!['count'] as number);
                    }
                });
                aggregated.push(currentPeriod);
            }
            periodKey = key;
            currentPeriod = { date: key, count: 0 };
            // Initialize sums
            Object.keys(d).forEach(k => {
                if (k !== 'date') currentPeriod![k] = 0;
            });
        }

        // Add to sum
        if (currentPeriod) {
            currentPeriod['count'] = (currentPeriod['count'] as number) + 1;
            Object.keys(d).forEach(k => {
                if (k !== 'date') {
                    if (!currentPeriod![k]) currentPeriod![k] = 0;
                    currentPeriod![k] = Number(currentPeriod![k]) + Number(d[k]);
                }
            });
        }
    });

    // Push last
    if (currentPeriod) {
        Object.keys(currentPeriod).forEach(k => {
            if (k !== 'date' && k !== 'count') {
                currentPeriod![k] = Number(currentPeriod![k]) / (currentPeriod!['count'] as number);
            }
        });
        aggregated.push(currentPeriod);
    }

    return aggregated;
};

export default function AnalysisView() {
    // --- Filters State ---
    const [comparisonMode, setComparisonMode] = useState<'products' | 'stores'>('products');
    const [selectedStore, setSelectedStore] = useState('S1');
    const [selectedCompareStores, setSelectedCompareStores] = useState<string[]>(['S1', 'S2']);
    const [startDate, setStartDate] = useState('2024-01-01');
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // --- Data State ---
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [chartData, setChartData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [uiNotice, setUiNotice] = useState('');

    // --- Visualization State ---
    const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');

    const categoryOptions = useMemo(
        () => Array.from(new Set(products.map(p => p.category).filter(Boolean))),
        [products]
    );

    const filteredProducts = useMemo(
        () => products
            .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
            .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase())),
        [products, selectedCategory, searchQuery]
    );

    useEffect(() => {
        const categorySkus = products
            .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
            .map(p => p.sku);
        const categorySkuSet = new Set(categorySkus);

        setSelectedProducts((prev) => {
            const next = prev.filter((sku) => categorySkuSet.has(sku));

            if (comparisonMode === 'stores' && next.length === 0 && categorySkus.length > 0) {
                return [categorySkus[0]];
            }

            return next.length === prev.length ? prev : next;
        });
    }, [products, selectedCategory, comparisonMode]);

    const seriesConfig = useMemo(() => {
        if (comparisonMode === 'products') {
            return selectedProducts.map((sku) => {
                const product = products.find(p => p.sku === sku);
                return { key: sku, label: product ? `${product.name} (${sku})` : sku };
            });
        }

        return selectedCompareStores.map((storeId) => {
            const store = STORE_OPTIONS.find(s => s.id === storeId);
            return {
                key: `store:${storeId}`,
                label: store ? store.label : storeId,
            };
        });
    }, [comparisonMode, selectedProducts, selectedCompareStores, products]);

    const getAuthHeaders = (): HeadersInit => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    // Fetch Products
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await fetch(`${API_URL}/forecast/products`, {
                    headers: getAuthHeaders(),
                });
                if (res.ok) {
                    const data = await res.json();
                    // map to simple product
                    const mapped = data.map((p: any) => ({
                        sku: p.sku,
                        name: p.name,
                        category: p.category_name || p.category // fallback
                    }));
                    setProducts(mapped);
                    if (mapped.length > 0) {
                        setSelectedProducts([mapped[0].sku]);
                    }
                } else {
                    setProducts([]);
                    setUiNotice('Unable to load products from live API.');
                }
            } catch (e) {
                console.error("Failed to fetch products", e);
                setProducts([]);
                setUiNotice('Unable to load products from live API.');
            }
        };
        fetchProducts();
    }, []);

    useEffect(() => {
        const fetchComparisonData = async () => {
            const storeIds = comparisonMode === 'products' ? [selectedStore] : selectedCompareStores;
            const productIds = comparisonMode === 'products' ? selectedProducts : [selectedProducts[0]].filter(Boolean) as string[];

            if (storeIds.length === 0 || productIds.length === 0) {
                setChartData([]);
                return;
            }

            if (!startDate || !endDate || startDate > endDate) {
                setChartData([]);
                setUiNotice('Please choose a valid date range.');
                return;
            }

            setLoading(true);
            try {
                const params = new URLSearchParams({
                    start_date: startDate,
                    end_date: endDate,
                    store_ids: storeIds.join(','),
                    product_ids: productIds.join(','),
                });

                const res = await fetch(`${API_URL}/forecast/comparison-history?${params.toString()}`, {
                    headers: getAuthHeaders(),
                });

                if (!res.ok) {
                    throw new Error(`Failed to load comparison history (${res.status})`);
                }

                const payload: ComparisonApiResponse = await res.json();

                const dateList = buildDateRange(startDate, endDate);
                const dataByDate = new Map<string, DataPoint>();

                dateList.forEach((day) => {
                    const point: DataPoint = { date: day };
                    if (comparisonMode === 'products') {
                        selectedProducts.forEach((sku) => {
                            point[sku] = 0;
                        });
                    } else {
                        selectedCompareStores.forEach((storeId) => {
                            point[`store:${storeId}`] = 0;
                        });
                    }
                    dataByDate.set(day, point);
                });

                payload.points.forEach((p) => {
                    const point = dataByDate.get(p.date);
                    if (!point) return;

                    const key = comparisonMode === 'products' ? p.product_id : `store:${p.store_id}`;
                    if (key in point) {
                        point[key] = Number.isFinite(Number(p.demand)) ? Number(p.demand) : 0;
                    }
                });

                let data = dateList.map((day) => dataByDate.get(day)!).filter(Boolean);

                if (data.length > 300) {
                    data = aggregateData(data, 'monthly');
                } else if (data.length > 60) {
                    data = aggregateData(data, 'weekly');
                }

                setChartData(data);
                if (payload.points.length === 0) {
                    setUiNotice('No live demand records found for the selected filters.');
                }
            } catch (e) {
                console.error('Failed to fetch comparison history', e);
                setChartData([]);
                setUiNotice('Failed to load live chart data.');
            } finally {
                setLoading(false);
            }
        };

        fetchComparisonData();
    }, [comparisonMode, selectedProducts, selectedCompareStores, startDate, endDate, selectedStore, products]);

    const toggleProduct = (sku: string) => {
        if (comparisonMode === 'stores') {
            setSelectedProducts((prev) => (prev.includes(sku) ? [] : [sku]));
            return;
        }

        setSelectedProducts((prev) => {
            if (prev.includes(sku)) {
                return prev.filter(s => s !== sku);
            }

            if (prev.length >= 5) {
                setUiNotice('You can compare up to 5 products at a time.');
                return prev;
            }

            return [...prev, sku];
        });
    };

    const toggleCompareStore = (storeId: string) => {
        setSelectedCompareStores((prev) => {
            if (prev.includes(storeId)) {
                return prev.filter(s => s !== storeId);
            }

            if (prev.length >= 3) {
                setUiNotice('You can compare up to 3 stores at a time.');
                return prev;
            }

            return [...prev, storeId];
        });
    };

    const toNumericValue = (point: DataPoint, key: string) => {
        const value = Number(point[key]);
        return Number.isFinite(value) ? value : 0;
    };

    const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b']; // Cyan, Violet, Pink, Emerald, Amber

    // --- Chart Renderer ---
    const renderChart = () => {
        if (chartData.length === 0) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-muted gap-2">
                    <ChartIcon size={32} className="opacity-20" />
                    <p>No live demand data for the current filters.</p>
                </div>
            );
        }

        if (loading) {
            return (
                <div className="h-full flex items-center justify-center text-muted animate-pulse">
                    Generating analysis...
                </div>
            );
        }

        const width = 1000;
        const height = 400;
        const padding = { top: 40, right: 30, bottom: 60, left: 60 };
        const innerWidth = width - padding.left - padding.right;
        const innerHeight = height - padding.top - padding.bottom;

        // Calculate Scale
        let maxVal = 0;
        chartData.forEach(d => {
            seriesConfig.forEach((series) => {
                const val = toNumericValue(d, series.key);
                if (val > maxVal) maxVal = val;
            });
        });
        maxVal = Math.max(maxVal * 1.1, 10); // Minimum scale of 10

        const xScale = (index: number) => (index / (chartData.length - 1)) * innerWidth; // Note: -1 can be 0 if length is 1
        const safeXScale = (index: number) => {
            if (chartData.length <= 1) return innerWidth / 2;
            return xScale(index);
        }
        const yScale = (value: number) => innerHeight - ((value / maxVal) * innerHeight);

        // Grid Lines
        const yTicks = 5;

        return (
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                <g transform={`translate(${padding.left}, ${padding.top})`}>

                    {/* Y-Axis Label */}
                    <text transform="rotate(-90)" x={-innerHeight / 2} y={-45} textAnchor="middle" fill="white" opacity="0.5" fontSize="12" fontWeight="bold" letterSpacing="1px">
                        UNITS (AVG)
                    </text>

                    {/* Y-Axis Grid & Labels */}
                    {Array.from({ length: yTicks + 1 }).map((_, i) => {
                        const val = (maxVal / yTicks) * i;
                        const y = yScale(val);
                        return (
                            <g key={`y-${i}`}>
                                <line x1={0} y1={y} x2={innerWidth} y2={y} stroke="rgba(255,255,255,0.1)" strokeDasharray="4" />
                                <text x={-10} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.5)" fontSize="11" className="font-mono">
                                    {Math.round(val)}
                                </text>
                            </g>
                        );
                    })}

                    {/* X-Axis Labels */}
                    {chartData.map((d, i) => {
                        // Show max 8 labels
                        const step = Math.ceil(chartData.length / 8);
                        if (i % step === 0) {
                            return (
                                <g key={`x-${i}`}>
                                    <text x={safeXScale(i)} y={innerHeight + 25} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11">
                                        {d.date}
                                    </text>
                                    <line x1={safeXScale(i)} y1={innerHeight} x2={safeXScale(i)} y2={innerHeight + 5} stroke="rgba(255,255,255,0.2)" />
                                </g>
                            );
                        }
                        return null;
                    })}
                    <text x={innerWidth / 2} y={innerHeight + 50} textAnchor="middle" fill="white" opacity="0.5" fontSize="12" fontWeight="bold" letterSpacing="1px">
                        DATE
                    </text>

                    {/* Data Visualization */}
                    {seriesConfig.map((series, idx) => {
                        const color = colors[idx % colors.length];

                        // Line Chart
                        if (chartType === 'line') {
                            const pathD = chartData.map((d, i) =>
                                `${i === 0 ? 'M' : 'L'} ${safeXScale(i)} ${yScale(toNumericValue(d, series.key))}`
                            ).join(' ');

                            return (
                                <g key={series.key}>
                                    <path d={pathD} fill="none" stroke={color} strokeWidth="2" className="drop-shadow-md" />
                                </g>
                            );
                        }

                        // Area Chart
                        if (chartType === 'area') {
                            const pathD = chartData.map((d, i) =>
                                `${i === 0 ? 'M' : 'L'} ${safeXScale(i)} ${yScale(toNumericValue(d, series.key))}`
                            ).join(' ');
                            // Close the path
                            const areaPath = `${pathD} L ${chartData.length > 0 ? safeXScale(chartData.length - 1) : 0} ${innerHeight} L 0 ${innerHeight} Z`;

                            return (
                                <g key={series.key}>
                                    <path d={areaPath} fill={color} fillOpacity="0.2" stroke="none" />
                                    <path d={pathD} fill="none" stroke={color} strokeWidth="2" />
                                </g>
                            );
                        }

                        // Bar Chart
                        if (chartType === 'bar') {
                            // Only render bars if data is not too dense, otherwise user should see line/aggregated
                            // Dynamic bar width
                            const groupWidth = innerWidth / chartData.length;
                            const barWidth = Math.max((groupWidth / Math.max(seriesConfig.length, 1)) * 0.8, 4); // min 4px width

                            // If too dense, only render lines? Or render simpler bars
                            return chartData.map((d, i) => {
                                const val = toNumericValue(d, series.key);
                                const h = innerHeight - yScale(val);
                                // Center the group
                                const groupStart = safeXScale(i) - (groupWidth / 2);
                                const x = groupStart + (groupWidth / 2) - ((Math.max(seriesConfig.length, 1) * barWidth) / 2) + (idx * barWidth);

                                return (
                                    <rect
                                        key={`${series.key}-${i}`}
                                        x={x}
                                        y={yScale(val)}
                                        width={barWidth}
                                        height={h}
                                        fill={color}
                                        opacity="0.8"
                                        rx="1"
                                    />
                                );
                            });
                        }
                    })}
                </g>
            </svg>
        );
    };

    useEffect(() => {
        if (!uiNotice) return;
        const timer = setTimeout(() => setUiNotice(''), 2200);
        return () => clearTimeout(timer);
    }, [uiNotice]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[600px]">
            {/* Sidebar Controls */}
            <div className="md:col-span-1 space-y-6">

                {/* Configuration Panel */}
                <Card glass className="h-full">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <DatabaseIcon size={18} className="text-primary" />
                            Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">

                        {/* Comparison Mode */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Compare By</label>
                            <select
                                value={comparisonMode}
                                onChange={(e) => setComparisonMode(e.target.value as 'products' | 'stores')}
                                className="w-full bg-slate-900 border border-white/20 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            >
                                <option value="products">Products (within one store)</option>
                                <option value="stores">Stores (for one SKU)</option>
                            </select>
                        </div>

                        {/* Store Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Store Location</label>
                            <select
                                value={selectedStore}
                                onChange={(e) => setSelectedStore(e.target.value)}
                                disabled={comparisonMode === 'stores'}
                                className="w-full bg-slate-900 border border-white/20 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            >
                                {STORE_OPTIONS.map((store) => (
                                    <option key={store.id} value={store.id}>{store.label}</option>
                                ))}
                            </select>
                            {comparisonMode === 'stores' && (
                                <p className="text-[10px] text-muted">Store comparison mode uses the store checklist below.</p>
                            )}
                        </div>

                        {/* Category Filter */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Category</label>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full bg-slate-900 border border-white/20 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            >
                                <option value="all">All Categories</option>
                                {categoryOptions.map((category) => (
                                    <option key={category} value={category}>{category}</option>
                                ))}
                            </select>
                        </div>

                        {comparisonMode === 'stores' && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted uppercase tracking-wider">Stores To Compare</label>
                                <div className="space-y-2">
                                    {STORE_OPTIONS.map((store) => (
                                        <label key={store.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/10 text-sm">
                                            <span>{store.label}</span>
                                            <input
                                                type="checkbox"
                                                checked={selectedCompareStores.includes(store.id)}
                                                onChange={() => toggleCompareStore(store.id)}
                                                className="accent-cyan-500"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Date Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Analysis Period</label>
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <span className="text-[10px] text-muted block mb-1">Start Date</span>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full bg-slate-900 border border-white/20 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        />
                                        <CalendarIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] text-muted block mb-1">End Date</span>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full bg-slate-900 border border-white/20 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        />
                                        <CalendarIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Product Search */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Product Search</label>
                            <div className="relative">
                                <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search SKU or name..."
                                    className="w-full bg-slate-900 border border-white/20 rounded-lg p-2 pl-9 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                />
                            </div>
                        </div>

                        {/* Product Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">
                                {comparisonMode === 'products' ? 'Products' : 'Target Product'}
                            </label>
                            {comparisonMode === 'stores' && (
                                <p className="text-[10px] text-muted">Select one product below, then compare it across stores.</p>
                            )}
                            <div className="space-y-2">
                                {filteredProducts
                                    .slice(0, 10)
                                    .map((p) => (
                                        <div key={p.sku} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded bg-surface-elevated flex items-center justify-center text-[10px] font-bold">
                                                    {p.sku.slice(-2)}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium">{p.name}</div>
                                                    <div className="text-[10px] text-muted">{p.category}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => toggleProduct(p.sku)}
                                                className={`px-2 py-1 rounded text-xs ${selectedProducts.includes(p.sku) ? 'bg-primary/20 text-primary' : 'bg-white/10 text-muted'}`}
                                            >
                                                {selectedProducts.includes(p.sku)
                                                    ? 'Selected'
                                                    : (comparisonMode === 'products' ? 'Compare' : 'Use')}
                                            </button>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {seriesConfig.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {seriesConfig.map((series) => (
                                    <Badge key={series.key} variant="info" className="text-[10px]">
                                        <CheckIcon size={10} className="mr-1" /> {series.label}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        {uiNotice && (
                            <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-md px-2 py-1">
                                {uiNotice}
                            </div>
                        )}

                        {/* Chart Type */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Chart Type</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['line', 'area', 'bar'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setChartType(type as any)}
                                        className={`px-2 py-1 rounded text-xs ${chartType === type ? 'bg-primary/20 text-primary' : 'bg-white/10 text-muted'}`}
                                    >
                                        {type.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                    </CardContent>
                </Card>
            </div>

            {/* Chart Panel */}
            <div className="md:col-span-3">
                <Card glass className="h-full">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <ChartIcon size={18} className="text-info" />
                            Comparative Demand Analysis
                        </CardTitle>
                        <CardDescription>
                            {comparisonMode === 'products'
                                ? 'Visualize historical demand trends across selected products in one store'
                                : 'Compare demand patterns of one selected product across selected stores'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-x-auto">
                            {renderChart()}
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
                            <span className="w-2 h-2 rounded-full bg-primary"></span>
                            <span>
                                {comparisonMode === 'products'
                                    ? 'Lines represent average demand values over time for selected products.'
                                    : 'Lines represent average demand values over time for selected stores of the chosen SKU.'}
                                {' '}For dense datasets, aggregation automatically switches to weekly/monthly.
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

        </div>
    );
}