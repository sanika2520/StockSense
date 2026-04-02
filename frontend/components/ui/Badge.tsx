import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
    className?: string;
    style?: React.CSSProperties;
}

export default function Badge({
    children,
    variant = 'default',
    className = '',
    style
}: BadgeProps) {
    const variants = {
        default: 'bg-surface-elevated text-muted border-white/10',
        success: 'bg-success/20 text-success border-success/20',
        warning: 'bg-warning/20 text-warning border-warning/20',
        error: 'bg-error/20 text-error border-error/20',
        info: 'bg-info/20 text-info border-info/20',
    };

    return (
        <span 
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style ? 'text-white border-white/20' : variants[variant]} ${className}`}
            style={style}
        >
            {children}
        </span>
    );
}
