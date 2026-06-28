import { cn } from '@/utils/cn';

type BadgeStatus = 'new' | 'learning' | 'review' | 'graduated';

interface BadgeProps {
  status: BadgeStatus;
  className?: string;
}

const statusStyles: Record<BadgeStatus, string> = {
  new: 'bg-tone-0-bg text-tone-0',
  learning: 'bg-tone-1-bg text-tone-1',
  review: 'bg-tone-3-bg text-tone-3',
  graduated: 'bg-tone-2-bg text-tone-2',
};

const statusLabels: Record<BadgeStatus, string> = {
  new: 'новое',
  learning: 'учу',
  review: 'повтор',
  graduated: 'выучено',
};

export default function Badge({ status, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        statusStyles[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
