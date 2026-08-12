import type { CSSProperties } from 'react';
import { cn } from '@/utils/cn';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
  variant?: 'text' | 'circular' | 'rectangular';
}

export default function Skeleton({
  width,
  height,
  className,
  style,
  variant = 'text',
}: SkeletonProps) {
  const baseStyles: CSSProperties = {
    width,
    height,
    ...style,
  };

  const variantClass = variant === 'circular' ? 'skeleton-circle' : '';

  return (
    <div
      className={cn('skeleton', variantClass, className)}
      style={baseStyles}
      aria-hidden="true"
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="skeleton-line"
          width={i === lines - 1 ? '60%' : '100%'}
          height={14}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'bg-bg-card border border-border-default rounded-xl p-4',
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <Skeleton width={40} height={40} variant="circular" />
        <div className="flex-1">
          <Skeleton className="skeleton-line" width="70%" height={16} />
          <Skeleton className="skeleton-line" width="50%" height={12} />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}
