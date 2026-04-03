import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Layers,
  Layout,
  Plus,
  Route,
  Server,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';

export type ActionType = 'create-feature' | 'create-ui' | 'create-test' | 'create-e2e' | 'create-system' | 'create-task' | 'create-environment';

const ACTION_ITEMS: { action: ActionType; label: string; icon: typeof Plus }[] = [
  { action: 'create-feature', label: 'Feature', icon: Zap },
  { action: 'create-system', label: 'System', icon: Layers },
  { action: 'create-ui', label: 'UI', icon: Layout },
  { action: 'create-test', label: 'Test', icon: FlaskConical },
  { action: 'create-e2e', label: 'E2E', icon: Route },
  { action: 'create-task', label: 'Task', icon: ClipboardList },
  { action: 'create-environment', label: 'Environment', icon: Server },
];

export function ActionsDropdown({ onAction, label = 'Actions', direction = 'down' }: { onAction: (action: ActionType) => void; label?: string; direction?: 'up' | 'down' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition',
            'border-border bg-card text-muted-foreground hover:bg-accent data-[state=open]:border-brand/30 data-[state=open]:bg-brand/10 data-[state=open]:text-brand',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3 w-3 opacity-60 transition-transform data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={direction === 'up' ? 'top' : 'bottom'}
          sideOffset={4}
          align="start"
          className="z-50 min-w-[10rem] rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {ACTION_ITEMS.map(({ action, label: itemLabel, icon: Icon }) => (
            <DropdownMenu.Item
              key={action}
              onSelect={() => onAction(action)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors outline-none cursor-default hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {itemLabel}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
