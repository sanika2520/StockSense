// 'use client';

// import { useState, useEffect, useRef, useCallback } from 'react';
// import Card, { CardHeader, CardTitle, CardContent } from '../ui/Card';
// import Button from '../ui/Button';
// import { RefreshIcon, CheckIcon, AlertIcon, TrendingUpIcon } from '../ui/Icons';

// interface ForecastItem {
//     sku: string;
//     product_name: string;
//     category: string;
//     current_stock: number;
//     seven_day_forecast: number;
//     stock_status: string;
// }

// interface ForecastAlert {
//     severity: 'low' | 'medium' | 'high';
//     store_id: string;
// }

// interface ForecastSummary {
//     critical_stock_count: number;
//     avg_confidence: number;
// }

// interface DemandDataPoint {
//     date: string;
//     actual: number | null;
//     forecast: number | null;
//     is_forecast: boolean;
// }

// interface ProductDetail {
//     sku: string;
//     product_name: string;
//     category: string;
//     current_stock: number;
//     confidence: number;
//     demand_data: DemandDataPoint[];
//     seven_day_forecast: number;
//     stock_days_remaining: number;
//     stock_status: string;
// }

// interface InsightAssistantProps {
//     forecasts?: ForecastItem[];
//     alerts?: ForecastAlert[];
//     summary?: ForecastSummary | null;
//     productDetail?: ProductDetail | null;
//     onDrawerChange?: (open: boolean) => void;
// }

// interface Insight {
//     type: 'analysis' | 'suggestion' | 'warning';
//     content: string;
// }

// export default function InsightAssistant({ forecasts, alerts, summary, productDetail, onDrawerChange }: InsightAssistantProps) {
//     const [isOpen, setIsOpen] = useState(false);
//     const [loading, setLoading] = useState(false);
//     const [insights, setInsights] = useState<Insight[]>([]);
//     const [hasGenerated, setHasGenerated] = useState(false);
//     const chatEndRef = useRef<HTMLDivElement>(null);

//     const generateInsights = useCallback(async () => {
//         setLoading(true);
//         // Simulate LLM processing delay
//         await new Promise(resolve => setTimeout(resolve, 1500));

//         const newInsights: Insight[] = [];

//         // --- SCOPE: SINGLE PRODUCT DETAIL (Forecasts Page) ---
//         if (productDetail) {
//             // 1. Core Status & Forecast
//             newInsights.push({
//                 type: 'analysis',
//                 content: `Analyzing ${productDetail.product_name} (${productDetail.sku}): Current stock is ${productDetail.current_stock}. The forecast suggests a demand of ${productDetail.seven_day_forecast.toFixed(0)} units over the next 7 days.`
//             });

//             // 2. Trend Analysis (Is demand going up or down?)
//             if (productDetail.demand_data && productDetail.demand_data.length > 0) {
//                 const forecastsPoints = productDetail.demand_data.filter((d) => d.is_forecast && d.forecast !== null);
//                 if (forecastsPoints.length > 1) {
//                     const first = forecastsPoints[0].forecast;
//                     const last = forecastsPoints[forecastsPoints.length - 1].forecast;
//                     if (first !== null && last !== null && first !== 0) {
//                         const diff = last - first;
//                         const percentChange = (diff / first) * 100;
//                         if (percentChange > 10) {
//                             newInsights.push({
//                                 type: 'suggestion',
//                                 content: `Trend Alert: Demand is rapidly increasing! It’s expected to grow by ${percentChange.toFixed(0)}% over the forecast period. Consider increasing safety stock.`
//                             });
//                         } else if (percentChange < -10) {
//                             newInsights.push({
//                                 type: 'analysis',
//                                 content: `Trend Alert: Demand is tapering off. Expect a ${Math.abs(percentChange).toFixed(0)}% drop by the end of the period. You can safely reduce replenishment orders.`
//                             });
//                         } else {
//                             newInsights.push({
//                                 type: 'analysis',
//                                 content: `➡️ Demand is relatively stable. Standard replenishment schedules should suffice.`
//                             });
//                         }
//                     }
//                 }
//             }

//             // 3. Critical Stock & Restock Recommendation
//             if (productDetail.stock_status === 'critical') {
//                 const deficit = productDetail.seven_day_forecast - productDetail.current_stock;
//                 const recommendedOrder = Math.ceil(deficit * 1.2); // +20% buffer
//                 newInsights.push({
//                     type: 'warning',
//                     content: `CRITICAL: You are projected to stock out in ${productDetail.stock_days_remaining} days. I recommend placing an immediate order for at least ${recommendedOrder} units to cover the coming week plus safety stock.`
//                 });
//             } else if (productDetail.stock_days_remaining < 14) {
//                 newInsights.push({
//                     type: 'suggestion',
//                     content: `Stock is getting low (${productDetail.stock_days_remaining} days left). Add this item to your next scheduled purchase order.`
//                 });
//             }

//             // 4. Confidence Context
//             if (productDetail.confidence < 0.7) {
//                 newInsights.push({
//                     type: 'analysis',
//                     content: `Low Confidence (${(productDetail.confidence * 100).toFixed(0)}%): The model is uncertain, possibly due to erratic historical patterns. Verify with recent sales data manually before making large bulk orders.`
//                 });
//             } else {
//                 newInsights.push({
//                     type: 'analysis',
//                     content: `High Confidence (${(productDetail.confidence * 100).toFixed(0)}%): The prediction allows for aggressive optimization. You can lower safety stock buffers to free up capital.`
//                 });
//             }

//         }
//         // --- SCOPE: DASHBOARD OVERVIEW (Manager Page) ---
//         else {

//             // 1. Overall Health Check
//             if (summary) {
//                 if (summary.critical_stock_count > 0) {
//                     newInsights.push({
//                         type: 'warning',
//                         content: `🚨 Action Required: ${summary.critical_stock_count} products are at critical levels. This poses a high risk of lost revenue.`
//                     });
//                 }
//                 newInsights.push({
//                     type: 'analysis',
//                     content: `Model Health: The system is running with ${(summary.avg_confidence * 100).toFixed(1)}% average confidence. ${summary.avg_confidence > 0.85 ? "Predictions are highly reliable." : "Monitor low-confidence items closely."}`
//                 });
//             }

//             // 2. Category Intelligence (Aggregated Analysis)
//             if (forecasts && forecasts.length > 0) {
//                 // Find most affected category (Mock logic as forecasts might not cover all)
//                 const categoryCounts: Record<string, number> = {};
//                 forecasts.forEach(f => {
//                     if (f.stock_status === 'critical' || f.stock_status === 'low') {
//                         categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
//                     }
//                 });
//                 const riskyCategory = Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b, '');

//                 if (riskyCategory) {
//                     newInsights.push({
//                         type: 'analysis',
//                         content: `📦 Category Insight: The '${riskyCategory}' category has the highest number of inventory alerts. Check for supplier delays or seasonal demand spikes in this segment.`
//                     });
//                 }

//                 // Demand Surges
//                 const trendingUp = forecasts.filter(f => f.seven_day_forecast > f.current_stock * 1.5);
//                 if (trendingUp.length > 0) {
//                     newInsights.push({
//                         type: 'suggestion',
//                         content: `🚀 Opportunity: ${trendingUp.length} products (e.g., ${trendingUp[0].product_name}) are predicted to see massive demand (>150% of stock). Consider running a promotion or ensuring prime shelf placement.`
//                     });
//                 }
//             }

//             // 3. Smart Alert Prioritization
//             if (alerts && alerts.length > 0) {
//                 const highSeverity = alerts.filter(a => a.severity === 'high');
//                 if (highSeverity.length > 0) {
//                     // Store clustering
//                     const problematicStore = highSeverity[0].store_id;
//                     newInsights.push({
//                         type: 'warning',
//                         content: `📍 Store Focus: Store ${problematicStore} has the most critical alerts. I suggest doing a full inventory audit for this location.`
//                     });
//                 }
//             } else {
//                 newInsights.push({
//                     type: 'analysis',
//                     content: 'Everything looks optimal. Use this time to review slow-moving inventory candidates for potential clearance sales.'
//                 });
//             }
//         }

//         if (newInsights.length === 0) {
//             newInsights.push({
//                 type: 'analysis',
//                 content: 'System is stable. I\'m monitoring for any new patterns.'
//             });
//         }

//         setInsights(newInsights);
//         setLoading(false);
//         setHasGenerated(true);
//     }, [alerts, forecasts, productDetail, summary]);

//     useEffect(() => {
//         if (isOpen && !hasGenerated) {
//             void generateInsights();
//         }
//     }, [isOpen, hasGenerated, generateInsights]);

//     useEffect(() => {
//         chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//     }, [insights]);

//     return (
//     <>
//         {/* Slide-in Drawer */}
//         <div style={{
//             position: 'fixed',
//             top: 0,
//             right: 0,
//             height: '100vh',
//             width: 380,
//             zIndex: 200,
//             transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
//             transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
//             display: 'flex',
//             flexDirection: 'column',
//             background: 'rgba(6,6,16,0.97)',
//             backdropFilter: 'blur(24px) saturate(160%)',
//             borderLeft: '1px solid rgba(255,255,255,0.08)',
//             boxShadow: isOpen ? '-20px 0 60px rgba(0,0,0,0.5)' : 'none',
//         }}>
//             {/* Top glow line */}
//             <div style={{
//                 position: 'absolute', top: 0, left: 0, right: 0, height: 1,
//                 background: 'linear-gradient(90deg, transparent, rgba(0,207,255,0.4), transparent)',
//             }} />

//             {/* Header */}
//             <div style={{
//                 padding: '16px 20px',
//                 borderBottom: '1px solid rgba(255,255,255,0.06)',
//                 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//                 background: 'rgba(255,255,255,0.02)',
//                 flexShrink: 0,
//             }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//                     <div style={{
//                         width: 32, height: 32, borderRadius: '50%',
//                         background: 'linear-gradient(135deg, #00cfff, #6366f1)',
//                         display: 'flex', alignItems: 'center', justifyContent: 'center',
//                         boxShadow: '0 0 12px rgba(0,207,255,0.3)',
//                     }}>
//                         <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>AI</span>
//                     </div>
//                     <div>
//                         <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Insight Assistant</div>
//                         <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>Powered by LLM</div>
//                     </div>
//                 </div>
//                 <button
//                     onClick={() => { setIsOpen(false); onDrawerChange?.(false); }}
//                     style={{
//                         background: 'transparent', border: 'none', cursor: 'pointer',
//                         color: 'rgba(255,255,255,0.35)', padding: 8, borderRadius: 8,
//                         fontSize: 18, lineHeight: 1, transition: 'color 0.2s',
//                     }}
//                     onMouseEnter={e => e.currentTarget.style.color = '#fff'}
//                     onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
//                 >
//                     ✕
//                 </button>
//             </div>

//             {/* Chat Body */}
//             <div style={{
//                 padding: 16, flex: 1, overflowY: 'auto',
//                 display: 'flex', flexDirection: 'column', gap: 16,
//             }}>
//                 {/* Initial Message */}
//                 <div style={{ display: 'flex', gap: 12 }}>
//                     <div style={{
//                         width: 28, height: 28, borderRadius: '50%',
//                         background: 'linear-gradient(135deg, #00cfff, #6366f1)',
//                         flexShrink: 0, display: 'flex', alignItems: 'center',
//                         justifyContent: 'center', marginTop: 4,
//                     }}>
//                         <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>AI</span>
//                     </div>
//                     <div style={{
//                         background: 'rgba(255,255,255,0.03)',
//                         border: '1px solid rgba(255,255,255,0.06)',
//                         borderRadius: '16px 16px 16px 4px',
//                         padding: '10px 14px', fontSize: 13,
//                         color: '#e8e8f0', lineHeight: 1.6,
//                     }}>
//                         Hello! I've analyzed your latest forecast data. Here are my key findings and suggestions.
//                     </div>
//                 </div>

//                 {/* Loading dots */}
//                 {loading && (
//                     <div style={{ display: 'flex', gap: 12 }}>
//                         <div style={{
//                             width: 28, height: 28, borderRadius: '50%',
//                             background: 'linear-gradient(135deg, #00cfff, #6366f1)',
//                             flexShrink: 0, display: 'flex', alignItems: 'center',
//                             justifyContent: 'center', marginTop: 4,
//                         }}>
//                             <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>AI</span>
//                         </div>
//                         <div style={{
//                             background: 'rgba(255,255,255,0.03)',
//                             border: '1px solid rgba(255,255,255,0.06)',
//                             borderRadius: '16px 16px 16px 4px',
//                             padding: '12px 16px',
//                         }}>
//                             <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
//                                 <span style={{ width: 6, height: 6, background: '#00cfff', borderRadius: '50%', animation: 'bounce 1s infinite' }}></span>
//                                 <span style={{ width: 6, height: 6, background: '#00cfff', borderRadius: '50%', animation: 'bounce 1s infinite 0.15s' }}></span>
//                                 <span style={{ width: 6, height: 6, background: '#00cfff', borderRadius: '50%', animation: 'bounce 1s infinite 0.3s' }}></span>
//                             </div>
//                         </div>
//                     </div>
//                 )}

//                 {/* Insights */}
//                 {insights.map((insight, idx) => (
//                     <div key={idx} style={{ display: 'flex', gap: 12 }}>
//                         <div style={{
//                             width: 28, height: 28, borderRadius: '50%',
//                             background: 'linear-gradient(135deg, #00cfff, #6366f1)',
//                             flexShrink: 0, display: 'flex', alignItems: 'center',
//                             justifyContent: 'center', marginTop: 4,
//                         }}>
//                             <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>AI</span>
//                         </div>
//                         <div style={{
//                             background: insight.type === 'warning'
//                                 ? 'rgba(248,113,113,0.08)'
//                                 : insight.type === 'suggestion'
//                                 ? 'rgba(0,207,255,0.08)'
//                                 : 'rgba(255,255,255,0.03)',
//                             border: insight.type === 'warning'
//                                 ? '1px solid rgba(248,113,113,0.2)'
//                                 : insight.type === 'suggestion'
//                                 ? '1px solid rgba(0,207,255,0.18)'
//                                 : '1px solid rgba(255,255,255,0.06)',
//                             borderRadius: '16px 16px 16px 4px',
//                             padding: '10px 14px', fontSize: 13,
//                             color: '#e8e8f0', lineHeight: 1.6,
//                         }}>
//                             <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
//                                 {insight.type === 'warning' && <span style={{ color: '#f87171', marginTop: 2 }}><AlertIcon size={14} /></span>}
//                                 {insight.type === 'suggestion' && <span style={{ color: '#00cfff', marginTop: 2 }}><TrendingUpIcon size={14} /></span>}
//                                 {insight.type === 'analysis' && <span style={{ color: '#34d399', marginTop: 2 }}><CheckIcon size={14} /></span>}
//                                 <p style={{ margin: 0 }}>{insight.content}</p>
//                             </div>
//                         </div>
//                     </div>
//                 ))}
//                 <div ref={chatEndRef} />
//             </div>

//             {/* Footer */}
//             <div style={{
//                 padding: 12,
//                 borderTop: '1px solid rgba(255,255,255,0.06)',
//                 background: 'rgba(255,255,255,0.02)',
//                 flexShrink: 0,
//             }}>
//                 <button
//                     onClick={generateInsights}
//                     disabled={loading}
//                     style={{
//                         width: '100%', padding: '10px 16px', borderRadius: 8,
//                         fontSize: 13, fontWeight: 700,
//                         border: '1px solid rgba(255,255,255,0.08)',
//                         background: 'rgba(255,255,255,0.03)',
//                         color: loading ? 'rgba(255,255,255,0.3)' : '#fff',
//                         cursor: loading ? 'not-allowed' : 'pointer',
//                         display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
//                         transition: 'all 0.2s',
//                     }}
//                     onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
//                     onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
//                 >
//                     <RefreshIcon size={13} className={loading ? 'animate-spin' : ''} />
//                     {loading ? 'Analyzing...' : 'Regenerate Insights'}
//                 </button>
//             </div>
//         </div>

//         {/* Backdrop (subtle, only on mobile) */}
//         {isOpen && (
//     <div
//         onClick={() => { setIsOpen(false); onDrawerChange?.(false); }}
//         style={{
//             position: 'fixed', inset: 0, zIndex: 199,
//         }}
//     />
// )}

//         {/* Trigger Tab — fixed to right edge, visible when drawer is closed */}
//         {!isOpen && (
//             <button
//                 onClick={() => { setIsOpen(true); onDrawerChange?.(true); }}
//                 style={{
//                     position: 'fixed', right: 0, top: '50%',
//                     transform: 'translateY(-50%)',
//                     zIndex: 201,
//                     background: 'linear-gradient(135deg, #00cfff, #6366f1)',
//                     border: 'none', cursor: 'pointer',
//                     borderRadius: '10px 0 0 10px',
//                     padding: '14px 10px',
//                     display: 'flex', flexDirection: 'column',
//                     alignItems: 'center', gap: 8,
//                     boxShadow: '-4px 0 20px rgba(0,207,255,0.2)',
//                     transition: 'all 0.2s',
//                 }}
//                 onMouseEnter={e => e.currentTarget.style.boxShadow = '-4px 0 28px rgba(0,207,255,0.4)'}
//                 onMouseLeave={e => e.currentTarget.style.boxShadow = '-4px 0 20px rgba(0,207,255,0.2)'}
//             >
//                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//                     <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
//                 </svg>
//                 <span style={{
//                     color: '#fff', fontSize: 10, fontWeight: 800,
//                     letterSpacing: '0.08em', textTransform: 'uppercase',
//                     writingMode: 'vertical-rl', textOrientation: 'mixed',
//                 }}>AI</span>
//             </button>
//         )}
//     </>
//     );
// }