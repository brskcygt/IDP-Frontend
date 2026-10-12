import { useEffect, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateProject } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";
import { providers } from "@/lib/providers";
import { errorMessage } from "@/lib/errors";

type CreateProjectModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/** New projects start in Geliştirme; the environment and everything else is set in Ayarlar afterwards. */
const DEFAULT_ENVIRONMENT = 'Dev';
const DEFAULT_PROVIDER = 'Jenkins';

export const CreateProjectModal = ({ isOpen, onOpenChange }: CreateProjectModalProps) => {
  const [name, setName] = useState('');
  const [tenant, setTenant] = useState('');
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [submitted, setSubmitted] = useState(false);

  const { mutate, isPending } = useCreateProject();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) return;
    setName('');
    setTenant('');
    setProvider(DEFAULT_PROVIDER);
    setSubmitted(false);
  }, [isOpen]);

  const nameMissing = !name.trim();
  const tenantMissing = !tenant.trim();

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameMissing || tenantMissing) return;
    mutate({ name: name.trim(), tenant: tenant.trim(), environment: DEFAULT_ENVIRONMENT, provider }, {
      onSuccess: () => {
        toast({ title: 'Proje oluşturuldu', description: `${name.trim()} listeye eklendi. Bağlantı ve derleme ayarlarını Ayarlar'dan yapın.` });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: 'Proje oluşturulamadı', description: errorMessage(err), variant: 'destructive' });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleCreate} noValidate>
          <DialogHeader>
            <DialogTitle>Yeni proje</DialogTitle>
            <DialogDescription>
              Ad, tenant ve dağıtım yöntemi yeterli; gerisini proje ayarlarından tamamlarsınız.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="create-project-name">Proje adı</Label>
              <Input
                id="create-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ör. Ödeme servisi"
                aria-invalid={submitted && nameMissing}
                autoFocus
              />
              {submitted && nameMissing && <p className="text-[11px] text-destructive">Proje adı gerekli.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-project-tenant">Tenant / ekip</Label>
              <Input
                id="create-project-tenant"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                placeholder="ör. Finans ekibi"
                aria-invalid={submitted && tenantMissing}
              />
              {submitted && tenantMissing && <p className="text-[11px] text-destructive">Tenant gerekli.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-project-provider">Dağıtım yöntemi</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="create-project-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        {opt.icon}
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Oluştur
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
