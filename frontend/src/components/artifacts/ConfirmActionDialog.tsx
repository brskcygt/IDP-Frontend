import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Body between the description and the confirmation field: what will change. */
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /**
   * When set, the button stays disabled until this exact text is typed -- the
   * Canlı guard. The typed value is handed to onConfirm, because the backend
   * checks it again.
   */
  typedConfirmation?: string | null;
  /** Reason the action cannot run right now (agent offline, nothing to roll back…). */
  blockedReason?: string | null;
  pending?: boolean;
  onConfirm: (confirmation: string | undefined) => void;
};

/** The confirm step of every action that changes a customer or deletes something. */
export const ConfirmActionDialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  destructive = false,
  typedConfirmation,
  blockedReason,
  pending = false,
  onConfirm,
}: Props) => {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const confirmed = !typedConfirmation || typed.trim() === typedConfirmation;
  const disabled = pending || !confirmed || Boolean(blockedReason);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
      {typedConfirmation && <div>
        <Label htmlFor="confirm-action-name" className="text-xs">
          Canlı müşteri: onaylamak için <span className="font-mono text-foreground">{typedConfirmation}</span> yazın
        </Label>
        <Input id="confirm-action-name" className="mt-1.5" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
      </div>}
      {blockedReason && <p className="text-xs text-destructive">{blockedReason}</p>}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          disabled={disabled}
          onClick={() => onConfirm(typedConfirmation ? typed.trim() : undefined)}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};
