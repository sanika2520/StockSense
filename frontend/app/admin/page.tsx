'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';
import {
    TrendingUpIcon,
    ChartIcon,
    UserIcon,
    SettingsIcon,
    LogoutIcon,
    BellIcon,
    ShieldIcon,
    UploadIcon,
    DatabaseIcon,
    ActivityIcon,
    AlertIcon,
    CheckIcon,
    ClockIcon,
    RefreshIcon,
} from '@/components/ui/Icons';

interface User {
    id?: number;
    name?: string;
    email: string;
    role: string;
}

interface ModelMetrics {
    mae: number;
    mape: number;
    wape: number;
}

interface GraphStats {
    num_nodes: number;
    num_edges: number;
}

interface HighRiskSKU {
    sku: string;
    store_id: string;
    risk_score: number;
    baseline_demand?: number;
    worst_case_demand?: number;
    current_inventory?: number;
    days_of_cover: number;
    stockout: boolean;
}

interface PurchaseOrder {
    id: number;
    po_number: string;
    store_id: string;
    status: string;
    total_items: number;
    total_quantity: number;
    total_amount: number | null;
    created_at: string;
    created_by?: { name: string; email: string };
    expected_delivery_date?: string;
    actual_delivery_date?: string;
    notes?: string;
    items?: PurchaseOrderItem[];
}

interface PurchaseOrderItem {
    id: number;
    sku: string;
    product_category: string | null;
    quantity_requested: number;
    quantity_delivered: number;
    unit_price: number | null;
    line_total: number | null;
}

interface StagingUpload {
    id: number;
    filename: string;
    uploaded_by: string;
    uploaded_at: string;
    status: string;
    row_count: number;
    valid_rows: number;
    invalid_rows: number;
    date_range: {
        min: string | null;
        max: string | null;
    };
    error_message: string | null;
}

interface AuditLogEntry {
    id: number;
    action: string;
    entity: string | null;
    details: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string | null;
    user: {
        id: number;
        name: string;
        email: string;
        role: string;
    } | null;
}

// Mock data for demo (features not yet implemented)

const mockPipelineStatus = [
    { name: 'Forecasting', status: 'completed', lastRun: '2 hours ago', duration: '4m 32s' },
    { name: 'GNN Build', status: 'completed', lastRun: '1 day ago', duration: '1m 15s' },
    { name: 'Adversarial Test', status: 'completed', lastRun: '2 hours ago', duration: '2m 45s' },
    { name: 'Data ETL', status: 'idle', lastRun: '3 hours ago', duration: '45s' },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AdminDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam) setActiveTab(tabParam);
        }
    }, []);
    
    // Real data states
    const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);
    const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
    const [adversarialRisks, setAdversarialRisks] = useState<HighRiskSKU[] | null>(null);
    const [totalSKUs, setTotalSKUs] = useState<number>(0);
    const [users, setUsers] = useState<User[]>([]);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'analyst' });
    
    // Purchase Orders
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [showDeliverModal, setShowDeliverModal] = useState(false);
    const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
    
    // CSV Upload
    const [stagingUploads, setStagingUploads] = useState<StagingUpload[]>([]);
    const [uploadingCSV, setUploadingCSV] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [auditLogScope, setAuditLogScope] = useState<'latest5' | 'all'>('latest5');
    
    // Adversarial Testing
    const [runningTest, setRunningTest] = useState(false);
    
    // Notifications
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; type?: 'danger' | 'warning' | 'info' } | null>(null);

    const dashboardCardClass = 'h-full';
    const panelRowClass = 'p-3 bg-white/5 rounded-lg border border-white/5';

    const authFetch = (endpoint: string, options: RequestInit = {}) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const hasFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;

        const headers: HeadersInit = {
            ...(hasFormDataBody ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        };

        return fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });
    };

    const refreshAuditLogs = async (scope: 'latest5' | 'all' = auditLogScope) => {
        const limit = scope === 'latest5' ? 5 : 200;
        const auditRes = await authFetch(`/api/audit-logs/?limit=${limit}`);
        if (auditRes.ok) {
            const data = await auditRes.json();
            setAuditLogs(data);
        }
    };

    const toCsvValue = (value: unknown) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? '');
        const escaped = serialized.replace(/"/g, '""');
        return `"${escaped}"`;
    };

    const buildAuditExportFileName = () => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
        return `audit_logs_${datePart}_${timePart}.csv`;
    };

    const handleExportAuditLogs = () => {
        const headers = [
            'id',
            'timestamp',
            'action',
            'status',
            'actor_email',
            'actor_name',
            'actor_role',
            'entity',
            'ip_address',
            'details_json',
        ];

        const rows = auditLogs.map((log) => {
            const status = getAuditStatus(log.action);
            return [
                log.id,
                log.created_at || '',
                log.action,
                status,
                log.user?.email || '',
                log.user?.name || '',
                log.user?.role || '',
                log.entity || '',
                log.ip_address || '',
                log.details || {},
            ];
        });

        const csvLines = [
            headers.map(toCsvValue).join(','),
            ...rows.map((row) => row.map(toCsvValue).join(',')),
        ];

        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = buildAuditExportFileName();
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!userData) {
            router.push('/auth/login');
            return;
        }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'admin') {
            router.push('/dashboard');
            return;
        }
        setUser(parsed);
        setLoading(false);
    }, [router]);

    // Fetch real data from backend
    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    router.push('/auth/login');
                    return;
                }

                // Fetch model metrics
                const metricsRes = await authFetch('/analytics/model-metrics');
                if (metricsRes.ok) {
                    const data = await metricsRes.json();
                    setModelMetrics({
                        mae: data.mae,
                        mape: data.mape,
                        wape: data.wape
                    });
                }

                // Fetch GNN graph statistics
                const graphRes = await authFetch('/gnn/graph-statistics');
                if (graphRes.ok) {
                    const data = await graphRes.json();
                    setGraphStats({
                        num_nodes: data.num_nodes,
                        num_edges: data.num_edges
                    });
                    setTotalSKUs(data.num_nodes);
                }

                // Fetch adversarial risk data for all risk buckets
                const riskRes = await authFetch('/adversarial/');
                if (riskRes.ok) {
                    const data = await riskRes.json();
                    setAdversarialRisks(data);
                }

                // Fetch users
                const usersRes = await authFetch('/api/users/');
                if (usersRes.ok) {
                    const data = await usersRes.json();
                    console.log('Users fetched:', data);
                    setUsers(data);
                } else {
                    console.error('Failed to fetch users:', usersRes.status);
                }
                
                // Fetch purchase orders
                const posRes = await authFetch('/api/purchase-orders/');
                if (posRes.ok) {
                    const data = await posRes.json();
                    setPurchaseOrders(data);
                }
                
                // Fetch staging uploads
                const stagingRes = await authFetch('/csv-upload/staging');
                if (stagingRes.ok) {
                    const data = await stagingRes.json();
                    setStagingUploads(data);
                }

                // Fetch recent activity audit logs
                await refreshAuditLogs();
            } catch (error) {
                console.error('Failed to fetch admin data:', error);
            }
        };

        if (!loading) {
            fetchAdminData();
        }
    }, [loading]);

    useEffect(() => {
        if (!loading) {
            refreshAuditLogs(auditLogScope);
        }
    }, [auditLogScope, loading]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
    };

    if (loading) {
        return (
            <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#060610', fontFamily:"'Inter',system-ui,sans-serif" }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
                    <div style={{ width:44, height:44, border:'3px solid rgba(0,207,255,0.15)', borderTopColor:'#00cfff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize:16, fontWeight:700, background:'linear-gradient(135deg,#00cfff,#6366f1)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Loading Admin Dashboard...</span>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            </div>
        );
    }

    if (!user) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed': return <Badge variant="success">Completed</Badge>;
            case 'running': return <Badge variant="info">Running</Badge>;
            case 'idle': return <Badge variant="default">Idle</Badge>;
            case 'valid': return <Badge variant="success">Valid</Badge>;
            case 'validating': return <Badge variant="warning">Validating</Badge>;
            case 'error': return <Badge variant="error">Error</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    const getRiskColor = (score: number) => {
        if (score >= 0.6) return 'text-error';
        if (score >= 0.3) return 'text-warning';
        return 'text-success';
    };

    const formatAuditAction = (log: AuditLogEntry) => {
        const actionLabels: Record<string, string> = {
            AUTH_LOGIN_SUCCESS: 'Logged in',
            AUTH_LOGIN_FAILED: 'Failed login attempt',
            AUTH_SIGNUP_SUCCESS: 'Created account',
            CSV_UPLOADED: 'Uploaded CSV file',
            CSV_UPLOAD_APPROVED: 'Approved CSV upload',
            CSV_UPLOAD_REJECTED: 'Rejected CSV upload',
            PO_CREATED: 'Created purchase order',
            PO_STATUS_UPDATED: 'Updated purchase order status',
            PO_DELIVERED: 'Delivered purchase order',
            PO_DELETED: 'Deleted purchase order',
            ADVERSARIAL_TEST_COMPLETED: 'Completed adversarial test run',
            ADVERSARIAL_TEST_FAILED: 'Adversarial test run failed',
            ADVERSARIAL_TEST_TIMEOUT: 'Adversarial test run timed out',
            AI_ADVERSARIAL_TEST_COMPLETED: 'Completed AI adversarial test run',
            AI_ADVERSARIAL_TEST_FAILED: 'AI adversarial test run failed',
            CUSTOM_SCENARIO_CREATED: 'Added custom scenario',
            CUSTOM_SCENARIO_UPDATED: 'Updated custom scenario',
            CUSTOM_SCENARIO_DELETED: 'Deleted custom scenario',
        };

        const base = actionLabels[log.action] || log.action.replaceAll('_', ' ').toLowerCase();
        const details = log.details || {};

        if (log.action === 'CSV_UPLOADED' && typeof details.filename === 'string') {
            return `${base} (${details.filename})`;
        }

        if (log.entity && log.entity.startsWith('purchase_order:')) {
            const poId = log.entity.split(':')[1];
            return `${base} #${poId}`;
        }

        if (log.entity && log.entity.startsWith('scenario:')) {
            if (typeof details.scenario_name === 'string' && details.scenario_name.trim()) {
                return `${base} (${details.scenario_name})`;
            }
            const scenarioId = log.entity.split(':')[1];
            return `${base} (${scenarioId})`;
        }

        return base.charAt(0).toUpperCase() + base.slice(1);
    };

    const formatAuditTime = (iso: string | null) => {
        if (!iso) return 'unknown time';

        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return 'unknown time';

        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    const formatAuditActor = (log: AuditLogEntry) => {
        if (log.user?.email) return log.user.email;
        if (log.user?.name) return log.user.name;
        return 'system';
    };

    const getAuditStatus = (action: string): 'success' | 'warning' | 'error' | 'info' => {
        if (action.endsWith('_FAILED')) return 'error';
        if (action.endsWith('_TIMEOUT')) return 'warning';
        if (action.includes('REJECTED') || action.includes('DELETED')) return 'warning';
        if (action.includes('SUCCESS') || action.includes('CREATED') || action.includes('UPDATED') || action.includes('APPROVED') || action.includes('COMPLETED') || action.includes('DELIVERED') || action.includes('UPLOADED')) {
            return 'success';
        }
        return 'info';
    };

    const getAuditStatusLabel = (status: 'success' | 'warning' | 'error' | 'info') => {
        if (status === 'success') return 'Success';
        if (status === 'warning') return 'Warning';
        if (status === 'error') return 'Error';
        return 'Info';
    };

    const getAuditStatusClasses = (status: 'success' | 'warning' | 'error' | 'info') => {
        if (status === 'success') {
            return {
                iconWrap: 'bg-success/20',
                iconColor: 'text-success',
            };
        }
        if (status === 'warning') {
            return {
                iconWrap: 'bg-warning/20',
                iconColor: 'text-warning',
            };
        }
        if (status === 'error') {
            return {
                iconWrap: 'bg-error/20',
                iconColor: 'text-error',
            };
        }
        return {
            iconWrap: 'bg-info/20',
            iconColor: 'text-info',
        };
    };

    const openUserModal = (user?: User) => {
        if (user) {
            setEditingUser(user);
            setUserForm({ name: user.name || '', email: user.email, password: '', role: user.role });
        } else {
            setEditingUser(null);
            setUserForm({ name: '', email: '', password: '', role: 'analyst' });
        }
        setShowUserModal(true);
    };

    const closeUserModal = () => {
        setShowUserModal(false);
        setEditingUser(null);
        setUserForm({ name: '', email: '', password: '', role: 'analyst' });
    };

    const handleSaveUser = async () => {
        try {
            if (editingUser) {
                // Update existing user
                const updateData: any = { name: userForm.name, email: userForm.email, role: userForm.role };
                if (userForm.password) {
                    updateData.password = userForm.password;
                }
                const res = await authFetch(`/api/users/${editingUser.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updateData),
                });
                if (res.ok) {
                    const updated = await res.json();
                    setUsers(users.map(u => u.id === updated.id ? updated : u));
                    await refreshAuditLogs();
                    closeUserModal();
                }
            } else {
                // Create new user
                const res = await authFetch('/api/users/', {
                    method: 'POST',
                    body: JSON.stringify(userForm),
                });
                if (res.ok) {
                    const newUser = await res.json();
                    setUsers([...users, newUser]);
                    await refreshAuditLogs();
                    closeUserModal();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to create user');
                }
            }
        } catch (error) {
            console.error('Failed to save user:', error);
            alert('Failed to save user');
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        
        try {
            const res = await authFetch(`/api/users/${userId}`, { method: 'DELETE' });
            if (res.ok) {
                setUsers(users.filter(u => u.id !== userId));
                await refreshAuditLogs();
            } else {
                const error = await res.json();
                alert(error.detail || 'Failed to delete user');
            }
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Failed to delete user');
        }
    };

    const handleApprovePO = async (poId: number) => {
        try {
            const res = await authFetch(`/api/purchase-orders/${poId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'approved' }),
            });
            if (res.ok) {
                const updated = await res.json();
                setPurchaseOrders(purchaseOrders.map(po => po.id === updated.id ? updated : po));
                await refreshAuditLogs();
            }
        } catch (error) {
            console.error('Failed to approve PO:', error);
        }
    };

    const handleDeliverPO = async () => {
        if (!selectedPO) return;
        
        try {
            const items = selectedPO.items?.map(item => ({
                item_id: item.id,
                quantity_delivered: item.quantity_requested
            })) || [];
            
            const res = await authFetch(`/api/purchase-orders/${selectedPO.id}/deliver`, {
                method: 'POST',
                body: JSON.stringify({
                    actual_delivery_date: deliveryDate,
                    items: items
                }),
            });
            
            if (res.ok) {
                const updated = await res.json();
                setPurchaseOrders(purchaseOrders.map(po => po.id === updated.id ? updated : po));
                setShowDeliverModal(false);
                setSelectedPO(null);
                await refreshAuditLogs();
            }
        } catch (error) {
            console.error('Failed to deliver PO:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'warning';
            case 'approved': return 'info';
            case 'delivered': return 'success';
            case 'cancelled': return 'error';
            default: return 'default';
        }
    };

    const handleRunAdversarialTest = async () => {
        setRunningTest(true);
        try {
            // Call backend endpoint to trigger adversarial testing
            const res = await authFetch('/adversarial/run-test', {
                method: 'POST',
            });
            
            if (res.ok) {
                const result = await res.json();
                setToast({
                    message: `${result.message}\n\nAdversarial testing completed successfully.`,
                    type: 'success',
                });
                
                // Refresh adversarial risk data after test
                const riskRes = await authFetch('/adversarial/');
                if (riskRes.ok) {
                    const data = await riskRes.json();
                    setAdversarialRisks(data);
                    await refreshAuditLogs();
                } else {
                    setToast({
                        message: 'Test completed, but failed to refresh adversarial risk data.',
                        type: 'warning',
                    });
                }
            } else {
                const error = await res.json();
                setToast({
                    message: `Adversarial test failed: ${error.detail || 'Unknown error'}`,
                    type: 'error',
                });
            }
        } catch (error) {
            console.error('Failed to run adversarial test:', error);
            setToast({
                message: 'Failed to trigger adversarial test. Check console for details.',
                type: 'error',
            });
        } finally {
            setRunningTest(false);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleUploadCSV = async () => {
        if (!selectedFile) {
            setToast({ message: 'Please select a CSV file first', type: 'warning' });
            return;
        }

        setUploadingCSV(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('uploaded_by', user?.email || 'admin@stocksense.com');

            const res = await authFetch('/csv-upload/upload', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const result = await res.json();
                setToast({ 
                    message: `Upload successful!\n\nFile: ${result.filename}\nRows: ${result.row_count}\nValid: ${result.valid_rows}\nInvalid: ${result.invalid_rows}`, 
                    type: 'success' 
                });
                
                // Refresh staging queue
                const stagingRes = await authFetch('/csv-upload/staging');
                if (stagingRes.ok) {
                    const data = await stagingRes.json();
                    setStagingUploads(data);
                }

                await refreshAuditLogs();
                
                setSelectedFile(null);
                // Reset file input
                const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            } else {
                const error = await res.json();
                setToast({ message: `Upload failed: ${error.detail}`, type: 'error' });
            }
        } catch (error) {
            console.error('Failed to upload CSV:', error);
            setToast({ message: 'Failed to upload CSV. Please try again.', type: 'error' });
        } finally {
            setUploadingCSV(false);
        }
    };

    const handleApproveUpload = async (uploadId: number) => {
        setConfirmDialog({
            title: 'Approve Upload',
            message: 'Are you sure you want to approve this upload and import to database?',
            type: 'info',
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    const res = await authFetch(`/csv-upload/staging/${uploadId}/approve`, {
                        method: 'POST',
                    });
                    
                    if (res.ok) {
                        const result = await res.json();
                        setToast({ 
                            message: `Import successful!\n\nRows imported: ${result.rows_imported}\nDaily demand updated: ${result.daily_demand_updated}`, 
                            type: 'success' 
                        });
                        
                        // Refresh staging queue
                        const stagingRes = await authFetch('/csv-upload/staging');
                        if (stagingRes.ok) {
                            const data = await stagingRes.json();
                            setStagingUploads(data);
                        }

                        await refreshAuditLogs();
                    } else {
                        const error = await res.json();
                        setToast({ message: `Approval failed: ${error.detail}`, type: 'error' });
                    }
                } catch (error) {
                    console.error('Failed to approve upload:', error);
                    setToast({ message: 'Failed to approve upload. Please try again.', type: 'error' });
                }
            }
        });
    };

    const handleRejectUpload = async (uploadId: number) => {
        setConfirmDialog({
            title: 'Reject Upload',
            message: 'Are you sure you want to reject and delete this upload? This action cannot be undone.',
            type: 'danger',
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    const res = await authFetch(`/csv-upload/staging/${uploadId}/reject`, {
                        method: 'POST',
                    });
                    
                    if (res.ok) {
                        setToast({ message: 'Upload rejected and deleted', type: 'success' });
                        
                        // Refresh staging queue
                        const stagingRes = await authFetch('/csv-upload/staging');
                        if (stagingRes.ok) {
                            const data = await stagingRes.json();
                            setStagingUploads(data);
                        }

                        await refreshAuditLogs();
                    } else {
                        const error = await res.json();
                        setToast({ message: `Rejection failed: ${error.detail}`, type: 'error' });
                    }
                } catch (error) {
                    console.error('Failed to reject upload:', error);
                    setToast({ message: 'Failed to reject upload. Please try again.', type: 'error' });
                }
            }
        });
    };

    const allRisks = adversarialRisks ?? [];

    // Policy v1 buckets:
    // High: stockout OR days_of_cover < 3 OR risk_score >= 0.60
    // Medium: not High AND (3 <= days_of_cover < 7 OR 0.30 <= risk_score < 0.60)
    // Low: everything else
    const highRiskScoreThreshold = 0.6;
    const mediumRiskScoreThreshold = 0.3;
    const highDaysOfCoverThreshold = 3;
    const mediumDaysOfCoverThreshold = 7;

    const isHighRisk = (item: HighRiskSKU) => (
        item.stockout ||
        item.days_of_cover < highDaysOfCoverThreshold ||
        item.risk_score >= highRiskScoreThreshold
    );

    const isMediumRisk = (item: HighRiskSKU) => (
        !isHighRisk(item) && (
            (item.days_of_cover >= highDaysOfCoverThreshold && item.days_of_cover < mediumDaysOfCoverThreshold) ||
            (item.risk_score >= mediumRiskScoreThreshold && item.risk_score < highRiskScoreThreshold)
        )
    );

    const highRiskItems = allRisks.filter(isHighRisk);
    const mediumRiskItems = allRisks.filter(isMediumRisk);
    const lowRiskItems = allRisks.filter((item) => !isHighRisk(item) && !isMediumRisk(item));

    const highRiskCount = highRiskItems.length;
    const mediumRiskCount = mediumRiskItems.length;
    const lowRiskCount = lowRiskItems.length;
    const highRiskSKUs = highRiskItems;

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
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            {['overview', 'purchase-orders', 'ai-scenarios', 'scenario-chat'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        if (tab === 'ai-scenarios') { router.push('/admin/ai-scenarios'); }
                                        else if (tab === 'scenario-chat') { router.push('/admin/scenario-chat'); }
                                        else { setActiveTab(tab); }
                                    }}
                                    style={{ padding:'6px 16px', borderRadius:8, fontSize:13, fontWeight:600, border:'none', cursor:'pointer', transition:'all 0.2s',
                                        background: activeTab === tab ? 'rgba(0,207,255,0.1)' : 'transparent',
                                        color: activeTab === tab ? '#00cfff' : 'rgba(255,255,255,0.45)',
                                        boxShadow: activeTab === tab ? '0 0 0 1px rgba(0,207,255,0.2)' : 'none',
                                    }}
                                >
                                    {tab === 'purchase-orders' ? 'Purchase Orders' : tab === 'ai-scenarios' ? 'AI Scenarios' : tab === 'scenario-chat' ? 'AI Chat' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <button style={{ position:'relative', padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8 }}>
                            <span style={{ color:'rgba(255,255,255,0.4)' }}><BellIcon size={18} /></span>
                            <span style={{ position:'absolute', top:8, right:8, width:6, height:6, background:'#ef4444', borderRadius:'50%' }}></span>
                        </button>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#00cfff,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', boxShadow:'0 0 12px rgba(0,207,255,0.25)' }}>
                                {user.name ? user.name[0] : user.email[0].toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{user.name || user.email}</div>
                                <div style={{ fontSize:11, color:'#00cfff', display:'flex', alignItems:'center', gap:4 }}>
                                    <ShieldIcon size={9} /> Admin
                                </div>
                            </div>
                        </div>
                        <button onClick={handleLogout} style={{ padding:8, background:'transparent', border:'none', cursor:'pointer', borderRadius:8, color:'rgba(255,255,255,0.35)', transition:'color 0.2s' }}
                            onMouseEnter={e=>(e.currentTarget.style.color='#ef4444')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.35)')}>
                            <LogoutIcon size={17} />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* System Status Bar */}
                <div style={{ background:'rgba(255,255,255,0.03)', backdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'12px 20px', marginBottom:28, display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:24 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ width:7, height:7, background:'#10b981', borderRadius:'50%', boxShadow:'0 0 8px #10b981', display:'inline-block', animation:'pulse 2s infinite' }}></span>
                            <span style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>Database: <span style={{ color:'#10b981', fontWeight:600 }}>Online</span></span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ width:7, height:7, background:'rgba(255,255,255,0.3)', borderRadius:'50%', display:'inline-block' }}></span>
                            <span style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>ML Pipeline: <span style={{ color:'rgba(255,255,255,0.75)', fontWeight:600 }}>Idle</span></span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <ClockIcon size={13} />
                            <span style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>Last Forecast: <span style={{ color:'rgba(255,255,255,0.75)', fontWeight:600 }}>2h ago</span></span>
                        </div>
                    </div>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.25)', fontWeight:500 }}>
                        {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
                    </span>
                </div>

                {/* Quick Stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28 }}>
                    {[
                        { label:'Total SKUs', value: totalSKUs || 240, icon:<DatabaseIcon size={20}/>, accent:'#00cfff' },
                        { label:'Stores', value:3, icon:<ChartIcon size={20}/>, accent:'#818cf8' },
                        { label:'High Risk SKUs', value: highRiskCount, icon:<AlertIcon size={20}/>, accent:'#ef4444', valueColor:'#ef4444' },
                        { label:'Active Users', value: users.length || 8, icon:<UserIcon size={20}/>, accent:'#34d399' },
                    ].map((s,i) => (
                        <div key={i} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'20px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', transition:'border-color 0.25s, box-shadow 0.25s', cursor:'default' }}
                            onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.borderColor=s.accent+'33'; (e.currentTarget as HTMLDivElement).style.boxShadow=`0 0 24px ${s.accent}12`; }}
                            onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.borderColor='rgba(255,255,255,0.06)'; (e.currentTarget as HTMLDivElement).style.boxShadow='none'; }}>
                            <div>
                                <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginBottom:6 }}>{s.label}</p>
                                <h3 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.03em', color: (s as any).valueColor || '#fff', lineHeight:1 }}>{s.value}</h3>
                            </div>
                            <div style={{ width:42, height:42, borderRadius:11, background:`${s.accent}14`, border:`1px solid ${s.accent}28`, display:'flex', alignItems:'center', justifyContent:'center', color:s.accent }}>
                                {s.icon}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Purchase Orders Section */}
                {activeTab === 'purchase-orders' && (
                    <div className="space-y-6">
                        <Card glass>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckIcon size={18} className="text-primary" />
                                    Purchase Order Management
                                </CardTitle>
                                <CardDescription>Approve and deliver pending purchase orders</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>PO Number</TableHead>
                                            <TableHead>Store</TableHead>
                                            <TableHead>Items</TableHead>
                                            <TableHead>Quantity</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {purchaseOrders.length > 0 ? (
                                            purchaseOrders.map((po) => (
                                                <TableRow key={po.id}>
                                                    <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="default">{po.store_id}</Badge>
                                                    </TableCell>
                                                    <TableCell>{po.total_items}</TableCell>
                                                    <TableCell>{po.total_quantity}</TableCell>
                                                    <TableCell>
                                                        {po.total_amount ? `$${Number(po.total_amount).toFixed(2)}` : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={getStatusColor(po.status)}>{po.status}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted">
                                                        {new Date(po.created_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex gap-2 justify-end">
                                                            {po.status === 'pending' && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm" 
                                                                    onClick={() => handleApprovePO(po.id)}
                                                                >
                                                                    Approve
                                                                </Button>
                                                            )}
                                                            {po.status === 'approved' && (
                                                                <Button 
                                                                    variant="primary" 
                                                                    size="sm"
                                                                    onClick={async () => {
                                                                        // Fetch full PO details with items
                                                                        const res = await authFetch(`/api/purchase-orders/${po.id}`);
                                                                        if (res.ok) {
                                                                            const fullPO = await res.json();
                                                                            setSelectedPO(fullPO);
                                                                            setShowDeliverModal(true);
                                                                        }
                                                                    }}
                                                                >
                                                                    Deliver
                                                                </Button>
                                                            )}
                                                            {po.status === 'delivered' && (
                                                                <span className="text-xs text-success">✓ Delivered</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-8 text-muted">
                                                    No purchase orders found
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Main Content Grid */}
                {activeTab === 'overview' && (
                    <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Data Management */}
                    <Card glass className={dashboardCardClass}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <UploadIcon size={18} className="text-primary" />
                                        Data Management
                                    </CardTitle>
                                    <CardDescription>Upload and manage transaction data</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        id="csv-file-input"
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <Button 
                                        variant="secondary" 
                                        size="sm"
                                        onClick={() => document.getElementById('csv-file-input')?.click()}
                                    >
                                        <DatabaseIcon size={14} />
                                        Choose File
                                    </Button>
                                    {selectedFile && (
                                        <Button 
                                            variant="primary" 
                                            size="sm"
                                            onClick={handleUploadCSV}
                                            disabled={uploadingCSV}
                                        >
                                            <UploadIcon size={14} />
                                            {uploadingCSV ? 'Uploading...' : `Upload ${selectedFile.name}`}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <p className="text-xs text-muted uppercase tracking-wider mb-2">Staging Queue</p>
                                {stagingUploads.length > 0 ? (
                                    stagingUploads.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-surface-elevated rounded flex items-center justify-center">
                                                    <DatabaseIcon size={14} className="text-muted" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium">{item.filename}</div>
                                                    <div className="text-xs text-muted">
                                                        {item.row_count.toLocaleString()} rows ({item.valid_rows} valid, {item.invalid_rows} invalid)
                                                    </div>
                                                    {item.date_range.min && (
                                                        <div className="text-xs text-muted mt-1">
                                                            Range: {item.date_range.min} to {item.date_range.max}
                                                        </div>
                                                    )}
                                                    {item.error_message && (
                                                        <div className="text-xs text-error mt-1">{item.error_message.split('\n')[0]}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(item.status)}
                                                {item.status === 'pending' && item.invalid_rows === 0 && (
                                                    <>
                                                        <Button 
                                                            variant="primary" 
                                                            size="sm"
                                                            onClick={() => handleApproveUpload(item.id)}
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm"
                                                            onClick={() => handleRejectUpload(item.id)}
                                                        >
                                                            Reject
                                                        </Button>
                                                    </>
                                                )}
                                                {item.status === 'error' && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => handleRejectUpload(item.id)}
                                                    >
                                                        Delete
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-muted text-sm">
                                        No uploads in staging queue
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ML Operations */}
                    <Card glass className={dashboardCardClass}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <ActivityIcon size={18} className="text-secondary" />
                                        ML Operations
                                    </CardTitle>
                                    <CardDescription>Manage forecasting models</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                                    <p className="text-xs text-muted uppercase tracking-wider mb-2">Active Model</p>
                                    <p className="text-lg font-bold text-primary">TFT+GNN v2.1</p>
                                    {modelMetrics && modelMetrics.mae != null && modelMetrics.mape != null && (
                                        <p className="text-xs text-muted mt-1">
                                            MAE: {modelMetrics.mae.toFixed(2)} | MAPE: {modelMetrics.mape.toFixed(1)}%
                                        </p>
                                    )}
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                                    <p className="text-xs text-muted uppercase tracking-wider mb-2">GNN Graph</p>
                                    <p className="text-lg font-bold">{graphStats?.num_nodes || 240} nodes</p>
                                    <p className="text-xs text-muted mt-1">{graphStats?.num_edges?.toLocaleString() || '14,578'} edges</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Adversarial Testing */}
                    <Card glass className={dashboardCardClass}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <ShieldIcon size={18} className="text-accent" />
                                        Adversarial Testing
                                    </CardTitle>
                                    <CardDescription>Stress test forecasts</CardDescription>
                                </div>
                                <Button 
                                    variant="secondary" 
                                    size="sm"
                                    onClick={handleRunAdversarialTest}
                                    disabled={runningTest}
                                >
                                    {runningTest ? 'Refreshing...' : 'Run Test'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="text-center p-3 bg-error/10 rounded-lg">
                                    <p className="text-2xl font-bold text-error">{highRiskCount}</p>
                                    <p className="text-xs text-muted">High Risk</p>
                                </div>
                                <div className="text-center p-3 bg-warning/10 rounded-lg">
                                    <p className="text-2xl font-bold text-warning">{mediumRiskCount}</p>
                                    <p className="text-xs text-muted">Medium</p>
                                </div>
                                <div className="text-center p-3 bg-success/10 rounded-lg">
                                    <p className="text-2xl font-bold text-success">{lowRiskCount}</p>
                                    <p className="text-xs text-muted">Low Risk</p>
                                </div>
                            </div>
                            <p className="text-xs text-muted uppercase tracking-wider mb-2">High Risk SKUs ({highRiskCount})</p>
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {highRiskSKUs.length > 0 ? (
                                    highRiskSKUs.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm">{item.sku}</span>
                                                <span className="text-xs text-muted">{item.store_id}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`text-sm font-bold ${getRiskColor(item.risk_score)}`}>
                                                    {(item.risk_score * 100).toFixed(0)}%
                                                </span>
                                                <span className="text-xs text-muted">{item.days_of_cover.toFixed(1)}d cover</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted text-center py-4">
                                        {adversarialRisks === null ? 'Loading risk data...' : 'No high-risk SKUs in current run.'}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* User Management */}
                    <Card glass className={dashboardCardClass}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <UserIcon size={18} className="text-info" />
                                        User Management
                                    </CardTitle>
                                    <CardDescription>Manage roles and permissions</CardDescription>
                                </div>
                                <Button 
                                    size="sm" 
                                    onClick={() => openUserModal()}
                                    style={{ 
                                        background: 'linear-gradient(135deg, #00cfff, #6366f1)', 
                                        border: 'none',
                                        boxShadow: '0 0 15px rgba(0,207,255,0.2)'
                                    }}
                                >
                                    Add User
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.length > 0 ? (
                                        users.map((u) => (
                                            <TableRow key={u.id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium text-sm">{u.name}</div>
                                                        <div className="text-xs text-muted">{u.email}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={u.role === 'admin' ? 'info' : u.role === 'manager' ? 'warning' : 'default'}>
                                                        {u.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="ghost" size="sm" onClick={() => openUserModal(u)}>Edit</Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(u.id!)}>Delete</Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-8 text-muted">
                                                {loading ? 'Loading users...' : 'No users found. Click "Add User" to create one.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* System Monitoring & Audit Logs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Pipeline Status */}
                    <Card glass className={dashboardCardClass}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <SettingsIcon size={18} className="text-primary" />
                                Pipeline Status
                            </CardTitle>
                            <CardDescription>Monitor running jobs</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {mockPipelineStatus.map((pipeline, idx) => (
                                    <div key={idx} className={`flex items-center justify-between ${panelRowClass}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${pipeline.status === 'completed' ? 'bg-success' :
                                                pipeline.status === 'running' ? 'bg-info animate-pulse' : 'bg-muted'
                                                }`}></div>
                                            <span className="font-medium text-sm">{pipeline.name}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-muted">
                                            <span>{pipeline.lastRun}</span>
                                            <span>{pipeline.duration}</span>
                                            {getStatusBadge(pipeline.status)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Audit Logs */}
                    <Card glass className={dashboardCardClass}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <ClockIcon size={18} className="text-secondary" />
                                        Recent Activity
                                    </CardTitle>
                                    <CardDescription>System audit logs</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={auditLogScope === 'latest5' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setAuditLogScope('latest5')}
                                    >
                                        Latest 5
                                    </Button>
                                    <Button
                                        variant={auditLogScope === 'all' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setAuditLogScope('all')}
                                    >
                                        All Logs
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleExportAuditLogs}>Export</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {auditLogs.length > 0 ? auditLogs.map((log) => (
                                    <div key={log.id} className={`flex items-start gap-3 ${panelRowClass}`}>
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getAuditStatusClasses(getAuditStatus(log.action)).iconWrap}`}
                                        >
                                            <CheckIcon size={12} className={getAuditStatusClasses(getAuditStatus(log.action)).iconColor} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm">{formatAuditAction(log)}</p>
                                                <Badge variant={getAuditStatus(log.action)}>{getAuditStatusLabel(getAuditStatus(log.action))}</Badge>
                                            </div>
                                            <p className="text-xs text-muted mt-1">
                                                <span className="font-medium">{formatAuditActor(log)}</span> • {formatAuditTime(log.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 text-sm text-muted">No recent activity yet</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                    </>
            )}
            </div>

            {/* User Modal */}
            {showUserModal && (
    <div
        onClick={closeUserModal}
        style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
        }}
    >
        <div
            onClick={e => e.stopPropagation()}
            style={{
                position: 'relative',
                width: '100%', maxWidth: 440,
                background: '#080811',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                padding: '32px 32px 28px',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
        >
            {/* Top glow line */}
            <div style={{
                position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(0,207,255,0.5), transparent)',
            }} />

            {/* Title */}
            <h3 style={{
                fontSize: 20, fontWeight: 800, color: '#fff',
                letterSpacing: '-0.02em', marginBottom: 24,
            }}>
                {editingUser ? 'Edit User' : 'Create New User'}
            </h3>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>Name</label>
                    <input
                        value={userForm.name}
                        onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                        placeholder="John Doe"
                        style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, color: '#e8e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                        onFocus={e => { e.target.style.borderColor = 'rgba(0,207,255,0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,207,255,0.08)'; }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>Email</label>
                    <input
                        type="email"
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        placeholder="john@company.com"
                        style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, color: '#e8e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                        onFocus={e => { e.target.style.borderColor = 'rgba(0,207,255,0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,207,255,0.08)'; }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
                        Password {editingUser && <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to keep current)</span>}
                    </label>
                    <input
                        type="password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder={editingUser ? 'Enter new password' : 'Password'}
                        style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, color: '#e8e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                        onFocus={e => { e.target.style.borderColor = 'rgba(0,207,255,0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,207,255,0.08)'; }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>Role</label>
                    <select
                        value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                        style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, color: '#e8e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s', cursor: 'pointer' }}
                        onFocus={e => e.target.style.borderColor = 'rgba(0,207,255,0.4)'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'}
                    >
                        <option value="analyst" style={{ background: '#080811' }}>Analyst</option>
                        <option value="manager" style={{ background: '#080811' }}>Manager</option>
                        <option value="admin" style={{ background: '#080811' }}>Admin</option>
                    </select>
                </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
                <button
                    onClick={closeUserModal}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSaveUser}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, #00cfff, #6366f1)', color: '#fff', cursor: 'pointer', boxShadow: '0 0 24px rgba(0,207,255,0.2)', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 32px rgba(0,207,255,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 24px rgba(0,207,255,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                    {editingUser ? 'Update' : 'Create'}
                </button>
            </div>
        </div>
    </div>
)}
            {/* Deliver PO Modal */}
            {showDeliverModal && selectedPO && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeliverModal(false)}>
                    <div className="bg-surface border border-white/10 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4">Deliver Purchase Order</h3>
                        
                        <div className="bg-white/5 rounded-lg p-4 mb-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted">PO Number:</span>
                                    <span className="ml-2 font-mono font-bold">{selectedPO.po_number}</span>
                                </div>
                                <div>
                                    <span className="text-muted">Store:</span>
                                    <Badge variant="default" className="ml-2">{selectedPO.store_id}</Badge>
                                </div>
                                <div>
                                    <span className="text-muted">Total Items:</span>
                                    <span className="ml-2 font-medium">{selectedPO.total_items}</span>
                                </div>
                                <div>
                                    <span className="text-muted">Total Quantity:</span>
                                    <span className="ml-2 font-medium">{selectedPO.total_quantity}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <label className="text-sm text-muted mb-2 block">Delivery Date</label>
                            <Input
                                type="date"
                                value={deliveryDate}
                                onChange={(e) => setDeliveryDate(e.target.value)}
                            />
                        </div>
                        
                        <div className="mb-4">
                            <p className="text-sm text-muted mb-2">Items to Deliver:</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {selectedPO.items?.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                        <div>
                                            <span className="font-mono text-sm font-medium">{item.sku}</span>
                                            {item.product_category && (
                                                <span className="ml-2 text-xs text-muted">({item.product_category})</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm">
                                                Qty: <span className="font-bold">{item.quantity_requested}</span>
                                            </span>
                                            {item.unit_price && (
                                                <span className="text-sm text-muted">
                                                    @ ${Number(item.unit_price).toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-4">
                            <p className="text-sm text-warning">
                                ⚠️ This will update inventory levels and create transaction records for all items.
                            </p>
                        </div>
                        
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setShowDeliverModal(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={handleDeliverPO} className="flex-1">
                                Confirm Delivery
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
            
            {/* Confirm Dialog */}
            {confirmDialog && (
                <ConfirmDialog
                    title={confirmDialog.title}
                    message={confirmDialog.message}
                    type={confirmDialog.type}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </div>
    );
}
