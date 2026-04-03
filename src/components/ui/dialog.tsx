import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-3xl border border-white/50 bg-card p-6 shadow-2xl dark:border-white/10',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200',
          className,
        )}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <DialogPrimitive.Close
      onClick={onClose}
      className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <DialogPrimitive.Title asChild><h2 className={cn('text-xl font-semibold', className)} {...props} /></DialogPrimitive.Title>;
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <DialogPrimitive.Description asChild><p className={cn('text-sm text-muted-foreground', className)} {...props} /></DialogPrimitive.Description>;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
