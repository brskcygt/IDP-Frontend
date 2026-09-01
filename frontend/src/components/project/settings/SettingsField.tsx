import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface SettingsFieldProps {
  icon: ReactNode;
  label: ReactNode;
  children: ReactNode;
}

/** Reusable settings field with icon + label. */
export const SettingsField = ({ icon, label, children }: SettingsFieldProps) => {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
};
