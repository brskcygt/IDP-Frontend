import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateProject } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { providers } from "@/lib/providers";

type CreateProjectModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CreateProjectModal = ({ isOpen, onOpenChange }: CreateProjectModalProps) => {
  const [name, setName] = useState('');
  const [tenant, setTenant] = useState('');
  const [environment, setEnvironment] = useState('Dev');
  const [provider, setProvider] = useState('Jenkins');

  const { mutate, isPending } = useCreateProject();
  const { toast } = useToast();

  const handleCreate = () => {
    if (!name || !tenant) {
      toast({ title: 'Validation Error', description: 'Name and Tenant are required.', variant: 'destructive' });
      return;
    }
    mutate({ name, tenant, environment, provider }, {
      onSuccess: () => {
        toast({ title: 'Project Created', description: `${name} was successfully added.` });
        onOpenChange(false);
        setName('');
        setTenant('');
        setEnvironment('Dev');
        setProvider('Jenkins');
      },
      onError: (err) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Create New Project</DialogTitle>
          <DialogDescription>
            Add a new project to your deployment pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payment Service"
              className="bg-accent/50 border-border/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tenant / Team</Label>
            <Input
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="e.g. Team Alpha"
              className="bg-accent/50 border-border/50"
            />
          </div>
          <div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="bg-accent/50 border-border/50">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
