import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Layers,
  Layout,
  Plus,
  Route,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';

export type ActionType = 'create-feature' | 'create-ui' | 'create-test' | 'create-e2e' | 'create-system' | 'create-task';

const ACTION_ITEMS: { action: ActionType; label: string; icon: typeof Plus }[] = [
  { action: 'create-feature', label: 'Feature', icon: Zap },
  { action: 'create-system', label: 'System', icon: Layers },
  { action: 'create-ui', label: 'UI', icon: Layout },
  { action: 'create-test', label: 'Test', icon: FlaskConical },
  { action: 'create-e2e', label: 'E2E', icon: Route },
  { action: 'create-task', label: 'Task', icon: ClipboardList },
];

export function ActionsDropdown({ onAction, label = 'Actions' }: { onAction: (action: ActionType) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as unknown as globalThis.Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('mousedown', handlePointerDown); window.removeEventListener('keydown', handleKeyDown); };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition',
          open
            ? 'border-brand/30 bg-brand/10 text-brand'
            : 'border-border bg-card text-muted-foreground hover:bg-accent',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-xl">
          {ACTION_ITEMS.map(({ action, label: itemLabel, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => { setOpen(false); onAction(action); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
