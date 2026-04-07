import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { BriefcaseIcon } from '@/components/ui/Icons';
import { PurchaseOrder } from '../page';
import React from 'react';

interface PurchaseOrdersProps {
  purchaseOrders: PurchaseOrder[];
  forecastLoading: boolean;
  getStatusBadge: (status: string) => React.ReactNode;
  setShowPOModal: (show: boolean) => void;
}

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({ purchaseOrders, forecastLoading, getStatusBadge, setShowPOModal }) => (
  <Card glass>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BriefcaseIcon size={18} className="text-secondary" />
            Purchase Orders
          </CardTitle>
          <CardDescription>Recent orders and their status</CardDescription>
        </div>
        <button
  onClick={() => setShowPOModal(true)}
  style={{
    height: 36,
    padding: '0 16px',
    borderRadius: 8,
    fontSize: 13,
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
  + New PO
</button>
      </div>
    </CardHeader>
    <CardContent>
      {forecastLoading ? (
        <div className="text-center py-8 text-muted">Loading purchase orders...</div>
      ) : purchaseOrders.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <BriefcaseIcon size={32} className="mx-auto mb-2 text-muted opacity-50" />
          <p>No purchase orders yet</p>
          <p className="text-xs mt-1">Click "+ New PO" to create one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {purchaseOrders.slice(0, 5).map((po) => (
            <div key={po.id} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center">
                  <BriefcaseIcon size={16} className="text-muted" />
                </div>
                <div>
                  <div className="font-medium text-sm">{po.po_number}</div>
                  <div className="text-xs text-muted">{po.total_items} items • {po.total_quantity.toFixed(0)} units</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm">${po.total_amount ? po.total_amount.toLocaleString() : '—'}</div>
                <div className="mt-1">{getStatusBadge(po.status)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

export default PurchaseOrders;