import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface PurchaseOrderItemCreate {
  sku: string;
  product_category?: string;
  quantity_requested: number;
  unit_price?: number | null;
  notes?: string;
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

interface ForecastOption {
  sku: string;
  product_name: string;
  category: string;
  current_stock: number;
  seven_day_forecast: number;
}

interface PurchaseOrderModalProps {
  showPOModal: boolean;
  setShowPOModal: (show: boolean) => void;
  alerts: ForecastAlert[];
  forecasts: ForecastOption[];
  poItems: PurchaseOrderItemCreate[];
  setPOItems: (items: PurchaseOrderItemCreate[]) => void;
  poNotes: string;
  setPONotes: (notes: string) => void;
  handleCreatePO: () => Promise<void>;
}

const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  showPOModal,
  setShowPOModal,
  alerts,
  forecasts,
  poItems,
  setPOItems,
  poNotes,
  setPONotes,
  handleCreatePO,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isSkuOpen, setIsSkuOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const skuRef = useRef<HTMLDivElement>(null);

  const normalizedForecasts = useMemo(() => {
    const bySku = new Map<string, ForecastOption>();

    for (const row of forecasts) {
      const sku = String(row.sku || '').trim();
      if (!sku) continue;

      const category = String(row.category || '').trim() || 'Uncategorized';
      const productName = String(row.product_name || '').trim() || sku;

      if (!bySku.has(sku)) {
        bySku.set(sku, {
          ...row,
          sku,
          category,
          product_name: productName,
        });
      }
    }

    return Array.from(bySku.values()).sort((a, b) => {
      const categoryDiff = a.category.localeCompare(b.category);
      if (categoryDiff !== 0) return categoryDiff;
      return a.product_name.localeCompare(b.product_name);
    });
  }, [forecasts]);

  const categories = useMemo(() => {
    return Array.from(new Set(normalizedForecasts.map((f) => f.category))).sort();
  }, [normalizedForecasts]);

  const skuOptions = useMemo(() => {
    if (!selectedCategory) return [];
    return normalizedForecasts.filter((f) => f.category === selectedCategory);
  }, [normalizedForecasts, selectedCategory]);

  useEffect(() => {
    setSelectedSku('');
    setManualQty('');
  }, [selectedCategory]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setIsCategoryOpen(false);
      if (skuRef.current && !skuRef.current.contains(e.target as Node)) setIsSkuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedSku) return;
    const selected = normalizedForecasts.find((f) => f.sku === selectedSku);
    if (!selected) return;

    const recommendedQty = Math.max(1, Math.ceil(selected.seven_day_forecast - selected.current_stock + 20));
    setManualQty(String(recommendedQty));
  }, [selectedSku, normalizedForecasts]);

  if (!showPOModal) return null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:'1.5rem' }} onClick={() => setShowPOModal(false)}>
      <div style={{ position:'relative', width:'100%', maxWidth:672, background:'#080811', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, display:'flex', flexDirection:'column', maxHeight:'90vh', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-2 border-b border-white/10">
          <h3 className="text-xl font-bold">Create Purchase Order</h3>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* High-Risk Alerts Section */}
          <div className="mb-8">
            <label className="text-sm text-muted mb-3 block">Select SKUs from High-Risk Alerts</label>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-lg p-3 bg-white/3">
              {alerts.filter((a) => a.severity === 'high').length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No high-risk alerts. Add SKUs by category below.</p>
              ) : (
                alerts
                  .filter((a) => a.severity === 'high')
                  .slice(0, 10)
                  .map((alert) => {
                    const alreadyAdded = poItems.some((item) => item.sku === alert.sku);
                    return (
                      <div key={alert.id} className="flex items-center justify-between p-2 bg-white/5 rounded">
                        <div className="flex-1">
                          <span className="font-mono text-sm">{alert.sku}</span>
                          <span className="text-xs text-muted ml-2">
                            Stock: {alert.current_stock}, Forecast: {alert.predicted_demand.toFixed(0)}
                          </span>
                        </div>
                        <Button
                          variant={alreadyAdded ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => {
                            if (!alreadyAdded) {
                              setPOItems([
                                ...poItems,
                                {
                                  sku: alert.sku,
                                  quantity_requested: Math.ceil(alert.predicted_demand - alert.current_stock + 20),
                                  unit_price: null,
                                },
                              ]);
                            }
                          }}
                          disabled={alreadyAdded}
                        >
                          {alreadyAdded ? 'Added' : 'Add'}
                        </Button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Manual Add Section */}
          <div className="mb-8">
            <label className="text-sm text-muted mb-3 block">Or Add by Category and SKU</label>
            <div className="flex gap-2 flex-wrap">
              {/* Category custom dropdown */}
              <div ref={categoryRef} style={{ position: 'relative', flex: 1, minWidth: 128 }}>
                <button
                  type="button"
                  onClick={() => { setIsCategoryOpen(o => !o); setIsSkuOpen(false); }}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: selectedCategory ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCategory || 'Select category'}</span>
                  <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 8, flexShrink: 0, transform: isCategoryOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                </button>
                {isCategoryOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, zIndex: 10000, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    <div onClick={() => { setSelectedCategory(''); setIsCategoryOpen(false); }} style={{ padding: '8px 12px', fontSize: 13, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Select category</div>
                    {categories.map(cat => (
                      <div key={cat} onClick={() => { setSelectedCategory(cat); setIsCategoryOpen(false); }} style={{ padding: '8px 12px', fontSize: 13, color: selectedCategory === cat ? '#00cfff' : '#fff', background: selectedCategory === cat ? 'rgba(0,207,255,0.08)' : 'transparent', cursor: 'pointer' }} onMouseEnter={e => { if (selectedCategory !== cat) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }} onMouseLeave={e => { if (selectedCategory !== cat) e.currentTarget.style.background = 'transparent'; }}>{cat}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* SKU custom dropdown */}
              <div ref={skuRef} style={{ position: 'relative', flex: 1, minWidth: 128, opacity: !selectedCategory ? 0.45 : 1, pointerEvents: !selectedCategory ? 'none' : 'auto' }}>
                <button
                  type="button"
                  onClick={() => { setIsSkuOpen(o => !o); setIsCategoryOpen(false); }}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: selectedSku ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSku ? (skuOptions.find(s => s.sku === selectedSku)?.product_name || selectedSku) : 'Select SKU'}</span>
                  <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 8, flexShrink: 0, transform: isSkuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                </button>
                {isSkuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, zIndex: 10000, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    <div onClick={() => { setSelectedSku(''); setIsSkuOpen(false); }} style={{ padding: '8px 12px', fontSize: 13, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Select SKU</div>
                    {skuOptions.map(item => (
                      <div key={item.sku} onClick={() => { setSelectedSku(item.sku); setIsSkuOpen(false); }} style={{ padding: '8px 12px', fontSize: 13, color: selectedSku === item.sku ? '#00cfff' : '#fff', background: selectedSku === item.sku ? 'rgba(0,207,255,0.08)' : 'transparent', cursor: 'pointer' }} onMouseEnter={e => { if (selectedSku !== item.sku) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }} onMouseLeave={e => { if (selectedSku !== item.sku) e.currentTarget.style.background = 'transparent'; }}>{item.sku} — {item.product_name}</div>
                    ))}
                  </div>
                )}
              </div>

              <Input
                type="number"
                placeholder="Qty"
                className="w-24"
                value={manualQty}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualQty(e.target.value)}
              />

              <button
                onClick={() => {
                  const qty = parseFloat(manualQty);
                  const selected = normalizedForecasts.find((f) => f.sku === selectedSku);

                  if (selectedSku && qty > 0 && selected) {
                    const alreadyExists = poItems.some((item) => item.sku === selectedSku);
                    if (!alreadyExists) {
                      setPOItems([
                        ...poItems,
                        {
                          sku: selectedSku,
                          product_category: selected.category,
                          quantity_requested: qty,
                          unit_price: null,
                        },
                      ]);
                      setSelectedSku('');
                      setManualQty('');
                    } else {
                      alert('SKU already added!');
                    }
                  } else {
                    alert('Please select category, SKU, and valid quantity');
                  }
                }}
                style={{
                  height: 38,
                  padding: '0 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  background: 'linear-gradient(135deg, #00cfff, #6366f1)',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 0 14px rgba(0,207,255,0.25)',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 22px rgba(0,207,255,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 14px rgba(0,207,255,0.25)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Add
              </button>
            </div>
          </div>

          {/* PO Items Section */}
          <div className="mb-8">
            <label className="text-sm text-muted mb-3 block">PO Items ({poItems.length})</label>
            {poItems.length === 0 ? (
              <p className="text-xs text-muted text-center py-8 border border-white/10 rounded-lg bg-white/3">No items added yet</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {poItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-sm font-bold">{item.sku}</span>
                      <Button variant="ghost" size="sm" onClick={() => setPOItems(poItems.filter((_, i) => i !== idx))}>
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted block mb-2">Qty</label>
                        <Input
                          type="number"
                          value={item.quantity_requested}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const newItems = [...poItems];
                            newItems[idx].quantity_requested = parseFloat(e.target.value) || 0;
                            setPOItems(newItems);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-2">Unit Price (optional)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const newItems = [...poItems];
                            newItems[idx].unit_price = parseFloat(e.target.value) || null;
                            setPOItems(newItems);
                          }}
                          placeholder="Rs0.00"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes Section */}
          <div>
            <label className="text-sm text-muted mb-3 block">Notes (optional)</label>
            <textarea
              value={poNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPONotes(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-foreground resize-none"
              rows={3}
              placeholder="Add any special instructions or notes..."
            />
          </div>
        </div>

        {/* Footer - Fixed */}
        {/* Footer - Fixed */}
<div style={{ padding:'16px 24px', borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', gap:12, background:'#080811', borderRadius:'0 0 16px 16px' }}>
  <button
    onClick={() => { setShowPOModal(false); setPOItems([]); setPONotes(''); }}
    style={{ flex:1, padding:'12px', borderRadius:10, fontSize:14, fontWeight:600, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:'rgba(255,255,255,0.6)', cursor:'pointer', transition:'all 0.2s' }}
    onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='#fff'; }}
    onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}
  >
    Cancel
  </button>
  <button
    onClick={handleCreatePO}
    disabled={poItems.length === 0}
    style={{ flex:1, padding:'12px', borderRadius:10, fontSize:14, fontWeight:700, border:'none', background: poItems.length === 0 ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #00cfff, #6366f1)', color: poItems.length === 0 ? 'rgba(255,255,255,0.25)' : '#fff', cursor: poItems.length === 0 ? 'not-allowed' : 'pointer', boxShadow: poItems.length === 0 ? 'none' : '0 0 15px rgba(0,207,255,0.2)', transition:'all 0.2s' }}
    onMouseEnter={e => { if (poItems.length > 0) { e.currentTarget.style.boxShadow='0 0 32px rgba(0,207,255,0.35)'; e.currentTarget.style.transform='translateY(-1px)'; }}}
    onMouseLeave={e => { if (poItems.length > 0) { e.currentTarget.style.boxShadow='0 0 15px rgba(0,207,255,0.2)'; e.currentTarget.style.transform='translateY(0)'; }}}
  >
    Create PO ({poItems.length} items)
  </button>
</div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
