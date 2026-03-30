import { useEffect, useRef, useState } from 'react';
import { getArtifactStatusColorClass, useTemplateEnumOptions } from '@nuucognition/plate-sdk';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const MAP_STATUS_META: Record<string, { label: string; dotClass: string }> = {
  // Tier 1 — Feature, UI
  draft: { label: 'Draft', dotClass: 'bg-muted-foreground' },
  untested: { label: 'Untested', dotClass: 'bg-sun' },
  implementing: { label: 'Implementing', dotClass: 'bg-sun' },
  testing: { label: 'Testing', dotClass: 'bg-sun' },
  stale: { label: 'Stale', dotClass: 'bg-fire' },
  verified: { label: 'Verified', dotClass: 'bg-earth' },
  // Tier 2 — structural
  active: { label: 'Active', dotClass: 'bg-earth' },
  deprecated: { label: 'Deprecated', dotClass: 'bg-muted-foreground' },
  // Tier 3 — test
  pass: { label: 'Pass', dotClass: 'bg-earth' },
  fail: { label: 'Fail', dotClass: 'bg-fire' },
};

function getStatusMeta(status: string): { label: string; dotClass: string } {
  const known = MAP_STATUS_META[status];
  if (known) return known;
  return {
    label: status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    dotClass: 'bg-muted-foreground/50',
  };
}

function StatusBadge({ status, loading = false }: { status: string; loading?: boolean }) {
  const meta = getStatusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium', getArtifactStatusColorClass(status))}>
      <span className={cn('h-2 w-2 rounded-full', meta.dotClass)} />
      <span>{meta.label}</span>
      {loading && <LoaderCircle className="h-3 w-3 animate-spin" />}
    </span>
  );
}

export function MapPreviewStatusField({
  frontmatter,
  disabled,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  disabled: boolean;
  onChange: (nextStatus: string) => void;
}) {
  const currentStatus = typeof frontmatter.status === 'string' ? frontmatter.status : null;
  const { options, loading, templateRef } = useTemplateEnumOptions(frontmatter, 'status');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!currentStatus) {
    return <span className="text-muted-foreground/40 italic">empty</span>;
  }

  if (!templateRef || options.length === 0) {
    return <StatusBadge status={currentStatus} loading={loading} />;
  }

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 rounded-full pr-1 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <StatusBadge status={currentStatus} loading={loading} />
        <ChevronDown className={cn('mr-1 h-3 w-3 opacity-70 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] rounded-md border border-border/70 bg-popover p-1 text-popover-foreground shadow-xl"
        >
          {options.map((status) => {
            const meta = getStatusMeta(status);
            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={status === currentStatus}
                onClick={() => {
                  setOpen(false);
                  if (status !== currentStatus) onChange(status);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  status === currentStatus && 'bg-accent/70 text-accent-foreground',
                )}
              >
                <span className="inline-flex items-center gap-2 flex-1">
                  <span className={cn('h-2 w-2 rounded-full', meta.dotClass)} />
                  <span>{meta.label}</span>
                </span>
                {status === currentStatus && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
