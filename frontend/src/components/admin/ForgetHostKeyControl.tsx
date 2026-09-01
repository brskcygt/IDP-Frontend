import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useForgetHostKey } from "@/hooks/useHostKeys";

type ForgetHostKeyControlProps = {
  host: string;
  port: number;
};

/** Two-click inline "forget" confirmation for one row of KnownHostKeysSheet. */
export const ForgetHostKeyControl = ({ host, port }: ForgetHostKeyControlProps) => {
  const { toast } = useToast();
  const forgetHostKey = useForgetHostKey();
  const [isConfirming, setIsConfirming] = useState(false);

  const handleForget = () => {
    forgetHostKey.mutate(
      { host, port },
      {
        onSuccess: () => toast({ title: 'Host key forgotten', description: `${host}:${port} was removed.` }),
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
        onSettled: () => setIsConfirming(false),
      },
    );
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-status-fail">Forget this key?</span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={forgetHostKey.isPending}
          onClick={handleForget}
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setIsConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-status-fail hover:bg-status-fail/10 hover:text-status-fail"
      onClick={() => setIsConfirming(true)}
    >
      <Trash2 className="h-3 w-3" aria-hidden="true" />
      Unut
    </Button>
  );
};
