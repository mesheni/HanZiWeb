import { type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface CardProps {
  children: ReactNode;
  elevation?: 'none' | 'low' | 'high';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

const elevationStyles = {
  none: '',
  low: 'shadow-sm',
  high: 'shadow-lg',
};

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export default function Card({
  children,
  elevation = 'low',
  padding = 'md',
  className,
  onClick,
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-bg-card border border-border-default rounded-xl',
        elevationStyles[elevation],
        paddingStyles[padding],
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
