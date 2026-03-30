import * as React from 'react';
import { cn } from '../../lib/utils';

export function Tooltip({
  children,
  label,
  side = 'bottom',
  className,
}: {
  children: React.ReactNode;
  label: string;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <div className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/50 bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground shadow-md',
          'opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100',
          side === 'bottom' && 'top-full mt-1.5',
          side === 'top' && 'bottom-full mb-1.5',
        )}
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}
