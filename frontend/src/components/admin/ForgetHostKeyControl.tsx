import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useForgetHostKey } from "@/hooks/useHostKeys";
import { ConfirmActionDialog } from "@/components/artifacts/ConfirmActionDialog";
import { errorMessage } from "@/lib/errors";

type ForgetHostKeyControlProps = {
  host: string;
  port: number;
};

/** "Unut" for one row of KnownHostKeysSheet, confirmed in the shared dialog. */
export const ForgetHostKeyControl = ({ host, port }: ForgetHostKeyControlProps) => {
  const { toast } = useToast();
  const forgetHostKey = useForgetHostKey();
  const [isConfirming, setIsConfirming] = useState(false);
  const address = `${host}:${port}`;

  const handleForget = () => {
    forgetHostKey.mutate(
      { host, port },
      {
        onSuccess: () => {
          toast({ title: 'Host anahtarı unutuldu', description: `${address} bir sonraki bağlantıda yeniden öğrenilecek.` });
          setIsConfirming(false);
        },
        onError: (err) => toast({ title: 'Host anahtarı unutulamadı', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`${address} anahtarını unut`}
        className="h-7 gap-1.5 px-2 text-xs text-status-fail hover:bg-status-fail/10 hover:text-status-fail"
        onClick={() => setIsConfirming(true)}
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        Unut
      </Button>
      <ConfirmActionDialog
        open={isConfirming}
        onOpenChange={setIsConfirming}
        title={`${address} anahtarı unutulsun mu?`}
        description="Kayıtlı anahtar silinir. Politika TOFU ise bir sonraki bağlantıda sunucunun sunduğu anahtar yeniden öğrenilir; Katı ise bağlantı reddedilir."
        confirmLabel="Unut"
        destructive
        pending={forgetHostKey.isPending}
        onConfirm={handleForget}
      />
    </>
  );
};
