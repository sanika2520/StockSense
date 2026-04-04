import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';

interface InventoryStoreSummary {
  store: string;
  totalSKUs: number;
  lowStock: number;
  criticalStock: number;
  value: number;
}

interface ForecastOption {
  sku: string;
  product_name: string;
  category: string;
  current_stock: number;
  seven_day_forecast: number;
}

interface RebalancingPlan {
  id: number;
  sku: string;
  from_store: string;
  to_store: string;
  quantity: number;
  status: string;
  created_at: string;
}

interface LaneSuggestion {
  id: string;
  from: string;
  to: string;
  quantity: number;
  risk: 'high' | 'medium' | 'low';
}

interface RebalancingWorkflowModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  inventoryByStore: InventoryStoreSummary[];
  forecasts: ForecastOption[];
  userStore: string | null;
  selectedStore: string;
  apiUrl: string;
  getAuthHeaders: () => HeadersInit;
  onPlanCreated?: () => Promise<void> | void;
}

const LANES: Array<{ from: string; to: string; id: string; pathD: string; labelX: number; labelY: number; dashClass: string }> = [
  { from: 'S1', to: 'S3', id: 'lane-s1-s3', pathD: 'M 180 55 Q 320 120 285 230', labelX: 265, labelY: 128, dashClass: 'flow-dash-1' },
  { from: 'S3', to: 'S2', id: 'lane-s3-s2', pathD: 'M 285 230 Q 180 295 75 230', labelX: 180, labelY: 276, dashClass: 'flow-dash-2' },
  { from: 'S2', to: 'S1', id: 'lane-s2-s1', pathD: 'M 75 230 Q 40 120 180 55', labelX: 95, labelY: 128, dashClass: 'flow-dash-3' },
];

const RebalancingWorkflowModal: React.FC<RebalancingWorkflowModalProps> = ({
  showModal,
  setShowModal,
  inventoryByStore,
  forecasts,
  userStore,
  selectedStore,
  apiUrl,
  getAuthHeaders,
  onPlanCreated,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [fromStore, setFromStore] = useState('S1');
  const [toStore, setToStore] = useState('S2');
  const [quantity, setQuantity] = useState<number>(20);
  const [status, setStatus] = useState('suggested');
  const [saving, setSaving] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [executingPlanId, setExecutingPlanId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [success, setSuccess] = useState('');
  const [recentPlans, setRecentPlans] = useState<RebalancingPlan[]>([]);
  const [laneDirection, setLaneDirection] = useState<Record<string, boolean>>({
    'lane-s1-s3': false,
    'lane-s3-s2': false,
    'lane-s2-s1': false,
  });

  const stores = useMemo(() => {
    const fromData = inventoryByStore.map((item) => item.store);
    const canonical = ['S1', 'S2', 'S3'];
    const ordered = canonical.filter((store) => fromData.includes(store));
    if (ordered.length === 3) return ordered;
    if (fromData.length > 0) return fromData;
    return canonical;
  }, [inventoryByStore]);

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

  const storeMetrics = useMemo(() => {
    const metrics = new Map<string, { pressure: number; capacity: number; value: number }>();
    for (const store of inventoryByStore) {
      const okCount = Math.max(store.totalSKUs - store.lowStock - store.criticalStock, 0);
      const pressure = store.criticalStock * 2 + store.lowStock;
      const capacity = okCount;
      metrics.set(store.store, { pressure, capacity, value: store.value });
    }
    return metrics;
  }, [inventoryByStore]);

  const directedLanes = useMemo(() => {
    return LANES.map((lane) => {
      const isReversed = laneDirection[lane.id] || false;
      return {
        ...lane,
        isReversed,
        activeFrom: isReversed ? lane.to : lane.from,
        activeTo: isReversed ? lane.from : lane.to,
      };
    });
  }, [laneDirection]);

  const laneSuggestions = useMemo<LaneSuggestion[]>(() => {
    return directedLanes.map((lane) => {
      const fromMetrics = storeMetrics.get(lane.activeFrom) || { pressure: 0, capacity: 0, value: 0 };
      const toMetrics = storeMetrics.get(lane.activeTo) || { pressure: 0, capacity: 0, value: 0 };

      const pressureGap = Math.max(toMetrics.pressure - fromMetrics.pressure, 0);
      const transferable = Math.max(Math.floor(fromMetrics.capacity * 0.12), 0);
      const suggested = Math.min(Math.max(pressureGap * 4, 0) + transferable, 80);

      const risk: 'high' | 'medium' | 'low' =
        toMetrics.pressure >= 8 ? 'high' : toMetrics.pressure >= 4 ? 'medium' : 'low';

      return {
        id: lane.id,
        from: lane.activeFrom,
        to: lane.activeTo,
        quantity: Math.max(Math.round(suggested), 0),
        risk,
      };
    });
  }, [storeMetrics, directedLanes]);

  const laneLookup = useMemo(() => {
    const map = new Map<string, LaneSuggestion>();
    for (const lane of laneSuggestions) {
      map.set(lane.id, lane);
    }
    return map;
  }, [laneSuggestions]);

  const toggleLaneDirection = (laneId: string) => {
    setLaneDirection((prev) => ({
      ...prev,
      [laneId]: !prev[laneId],
    }));
    setError('');
    setWarning('');
    setSuccess('Lane direction reversed. Suggestions updated.');
  };

  const fetchRecentPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await fetch(`${apiUrl}/rebalancing/`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setRecentPlans(Array.isArray(data) ? data.slice(0, 8) : []);
      }
    } catch {
      // Ignore errors in passive history section to keep modal usable.
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    if (!showModal) return;

    setError('');
    setWarning('');
    setSuccess('');

    const defaultFrom = userStore || selectedStore || stores[0] || 'S1';
    const fallbackTarget = stores.find((s) => s !== defaultFrom) || 'S2';

    setFromStore(defaultFrom);
    setToStore(fallbackTarget);
    setSelectedCategory('');
    setSelectedSku('');
    setQuantity(20);
    fetchRecentPlans();
  }, [showModal, userStore, selectedStore, stores]);

  useEffect(() => {
    setSelectedSku('');
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedSku) return;
    const selected = normalizedForecasts.find((f) => f.sku === selectedSku);
    if (!selected) return;
    const suggestedQty = Math.max(1, Math.ceil(selected.seven_day_forecast - selected.current_stock + 20));
    setQuantity(suggestedQty);
  }, [selectedSku, normalizedForecasts]);

  const useSuggestion = (lane: LaneSuggestion) => {
    if (userStore && lane.from !== userStore) {
      setError(`Your assigned store is ${userStore}. Choose a lane with ${userStore} as source.`);
      setWarning('');
      setSuccess('');
      return;
    }

    setFromStore(lane.from);
    setToStore(lane.to);
    setQuantity(Math.max(lane.quantity, 10));
    setSuccess('Suggestion loaded into form. Add SKU and submit.');
    setError('');
    setWarning('');
  };

  const executePlan = async (plan: RebalancingPlan) => {
    setError('');
    setWarning('');
    setSuccess('');
    setExecutingPlanId(plan.id);

    try {
      const res = await fetch(`${apiUrl}/rebalancing/${plan.id}/execute`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const maybeError = await res.json().catch(() => ({}));
        setError(maybeError?.detail || 'Unable to execute plan.');
        return;
      }

      const data = await res.json();

      setSuccess(`Plan #${plan.id} executed. Inventory moved from ${plan.from_store} to ${plan.to_store}.`);
      if (data?.warning) {
        setWarning(data.warning);
      }
      await fetchRecentPlans();
      if (onPlanCreated) {
        await onPlanCreated();
      }
    } catch {
      setError('Network issue while executing plan.');
    } finally {
      setExecutingPlanId(null);
    }
  };

  const createAndOptionallyExecutePlan = async (executeImmediately: boolean) => {
    setError('');
    setWarning('');
    setSuccess('');

    if (!selectedSku.trim()) {
      setError('SKU is required.');
      return;
    }

    if (fromStore === toStore) {
      setError('Source and destination stores must be different.');
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    setSaving(true);
    try {
      const createRes = await fetch(`${apiUrl}/rebalancing/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          sku: selectedSku.trim(),
          from_store: fromStore,
          to_store: toStore,
          quantity,
          status,
        }),
      });

      if (!createRes.ok) {
        const maybeError = await createRes.json().catch(() => ({}));
        setError(maybeError?.detail || 'Unable to save rebalancing plan.');
        return;
      }

      const created = await createRes.json();

      if (!executeImmediately) {
        setRecentPlans((prev) => [created, ...prev].slice(0, 8));
        setSuccess(`Plan #${created.id} created: ${created.from_store} -> ${created.to_store}.`);
      } else {
        const execRes = await fetch(`${apiUrl}/rebalancing/${created.id}/execute`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });

        if (!execRes.ok) {
          const maybeExecError = await execRes.json().catch(() => ({}));
          setError(maybeExecError?.detail || 'Plan created, but execution failed.');
          setRecentPlans((prev) => [created, ...prev].slice(0, 8));
          return;
        }

        const execData = await execRes.json();
        setSuccess(`Plan #${created.id} executed from ${created.from_store} to ${created.to_store}.`);
        if (execData?.warning) {
          setWarning(execData.warning);
        }
      }

      setSelectedSku('');
      await fetchRecentPlans();
      if (onPlanCreated) {
        await onPlanCreated();
      }
    } catch {
      setError('Network issue while saving/executing plan. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const submitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAndOptionallyExecutePlan(false);
  };

  if (!showModal) return null;

  const laneColor = (lane: LaneSuggestion) => {
    if (lane.risk === 'high') return '#f97316';
    if (lane.risk === 'medium') return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
      <div
        className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-5xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-2xl font-bold">Transfer & Rebalancing Workflow</h3>
            <p className="text-sm text-muted mt-1">Three-store circular flow with live transfer lanes and quick plan creation.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>
            Close
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="border border-white/10 rounded-xl p-4 bg-gradient-to-b from-white/[0.03] to-transparent">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-wider text-muted">Circular Store Network</p>
              <p className="text-sm text-muted">Click any arrow to reverse lane direction and recompute suggested transfer flow.</p>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <svg viewBox="0 0 360 300" className="w-full h-auto">
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
                    <polygon points="0 0, 8 4, 0 8" fill="#7dd3fc" />
                  </marker>
                </defs>

                {/* Circular directional lanes */}
                {directedLanes.map((lane) => {
                  const laneSuggestion = laneLookup.get(lane.id) || { id: lane.id, from: lane.activeFrom, to: lane.activeTo, quantity: 0, risk: 'low' as const };
                  return (
                    <g key={lane.id}>
                      <path
                        d={lane.pathD}
                        fill="none"
                        stroke={laneColor(laneSuggestion)}
                        strokeWidth="3"
                        markerEnd={lane.isReversed ? undefined : 'url(#arrowhead)'}
                        markerStart={lane.isReversed ? 'url(#arrowhead)' : undefined}
                        opacity="0.9"
                        className="cursor-pointer"
                        onClick={() => toggleLaneDirection(lane.id)}
                      />
                      <path
                        d={lane.pathD}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="2"
                        strokeDasharray="7 11"
                        className={`flow-dash ${lane.dashClass} ${lane.isReversed ? 'flow-reverse' : ''}`}
                        opacity="0.85"
                        onClick={() => toggleLaneDirection(lane.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <text x={lane.labelX} y={lane.labelY} fill="#cbd5e1" fontSize="12" textAnchor="middle">
                        {laneSuggestion.quantity} u
                      </text>
                    </g>
                  );
                })}

                {/* Store nodes */}
                <circle cx="180" cy="55" r="34" fill="#111827" stroke="#60a5fa" strokeWidth="2" />
                <circle cx="75" cy="230" r="34" fill="#111827" stroke="#22c55e" strokeWidth="2" />
                <circle cx="285" cy="230" r="34" fill="#111827" stroke="#f59e0b" strokeWidth="2" />

                <text x="180" y="52" fill="#ffffff" fontSize="16" textAnchor="middle" fontWeight="bold">S1</text>
                <text x="180" y="70" fill="#9ca3af" fontSize="11" textAnchor="middle">{(storeMetrics.get('S1')?.value || 0) > 0 ? `$${Math.round((storeMetrics.get('S1')?.value || 0) / 1000)}K` : 'N/A'}</text>

                <text x="75" y="227" fill="#ffffff" fontSize="16" textAnchor="middle" fontWeight="bold">S2</text>
                <text x="75" y="245" fill="#9ca3af" fontSize="11" textAnchor="middle">{(storeMetrics.get('S2')?.value || 0) > 0 ? `$${Math.round((storeMetrics.get('S2')?.value || 0) / 1000)}K` : 'N/A'}</text>

                <text x="285" y="227" fill="#ffffff" fontSize="16" textAnchor="middle" fontWeight="bold">S3</text>
                <text x="285" y="245" fill="#9ca3af" fontSize="11" textAnchor="middle">{(storeMetrics.get('S3')?.value || 0) > 0 ? `$${Math.round((storeMetrics.get('S3')?.value || 0) / 1000)}K` : 'N/A'}</text>
              </svg>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">How Suggested Units Are Estimated</p>
              <p className="text-xs text-muted leading-relaxed">
                These values are store-level transfer suggestions, not product-category totals. For each lane, the model compares destination stock pressure
                (critical counts weighted heavier than low counts) against source pressure, then adds a capped share of source healthy capacity.
                Formula used: <span className="text-foreground">max((toPressure - fromPressure) * 4, 0) + floor(fromCapacity * 0.12)</span>, capped at 80 units.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
              {laneSuggestions.map((lane) => (
                <button
                  key={`${lane.from}-${lane.to}`}
                  type="button"
                  onClick={() => useSuggestion(lane)}
                  className="text-left border border-white/10 bg-white/[0.03] rounded-lg p-3 hover:border-info/50 transition-colors"
                >
                  <p className="text-sm font-semibold">{lane.from}{' -> '}{lane.to}</p>
                  <p className="text-xs text-muted">Suggested: {lane.quantity} units</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <form onSubmit={submitPlan} className="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
              <p className="text-sm font-semibold mb-3">Create Transfer Plan</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">SKU</label>
                  <select
                    value={selectedSku}
                    onChange={(e) => setSelectedSku(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm disabled:opacity-50"
                    disabled={!selectedCategory}
                  >
                    <option value="">Select SKU</option>
                    {skuOptions.map((item) => (
                      <option key={item.sku} value={item.sku}>{item.sku} - {item.product_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">From Store</label>
                  <select
                    value={fromStore}
                    onChange={(e) => setFromStore(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm"
                    disabled={!!userStore}
                  >
                    {stores.map((store) => (
                      <option key={store} value={store}>{store}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">To Store</label>
                  <select
                    value={toStore}
                    onChange={(e) => setToStore(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm"
                  >
                    {stores.filter((store) => store !== fromStore).map((store) => (
                      <option key={store} value={store}>{store}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs text-muted block mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm"
                >
                  <option value="suggested">Suggested</option>
                  <option value="approved">Approved</option>
                  <option value="executed">Executed</option>
                </select>
              </div>

              {error && <p className="text-sm text-error mb-3">{error}</p>}
              {warning && <p className="text-sm text-warning mb-3">{warning}</p>}
              {success && <p className="text-sm text-success mb-3">{success}</p>}
              <p className="text-xs text-muted mb-3">
                Save creates a plan. Execute applies the transfer to inventory and records transfer_in/transfer_out events in transactions.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Rebalancing Plan'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => createAndOptionallyExecutePlan(true)}
                >
                  {saving ? 'Processing...' : 'Save & Execute'}
                </Button>
              </div>
            </form>

            <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Recent Plans</p>
                <Button variant="ghost" size="sm" onClick={fetchRecentPlans} disabled={loadingPlans}>
                  {loadingPlans ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {recentPlans.length === 0 ? (
                <p className="text-xs text-muted">No plans yet. Create one from the form above.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {recentPlans.map((plan) => (
                    <div key={plan.id} className="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{plan.from_store}{' -> '}{plan.to_store}</p>
                        <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-muted">{plan.status}</span>
                      </div>
                      <p className="text-xs text-muted mt-1">SKU: {plan.sku} | Qty: {Math.round(plan.quantity)}</p>
                      {plan.status !== 'executed' && (
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => executePlan(plan)}
                            disabled={executingPlanId === plan.id}
                          >
                            {executingPlanId === plan.id ? 'Executing...' : 'Execute'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .flow-dash {
          animation: flowShift 2.1s linear infinite;
        }

        .flow-dash-2 {
          animation-delay: 0.2s;
        }

        .flow-dash-3 {
          animation-delay: 0.4s;
        }

        .flow-reverse {
          animation-direction: reverse;
        }

        @keyframes flowShift {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -36;
          }
        }
      `}</style>
    </div>
  );
};

export default RebalancingWorkflowModal;
