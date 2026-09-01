import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SUGGESTED_NAMES = ["Dev", "Stage", "Prod"];

interface EnvironmentAddControlProps {
  existingNames: string[];
  onAdd: (name: string) => void;
}

/** Quick-add buttons for the common names, plus a free-form name field. */
export const EnvironmentAddControl = ({ existingNames, onAdd }: EnvironmentAddControlProps) => {
  const [customName, setCustomName] = useState("");
  const suggestions = SUGGESTED_NAMES.filter((name) => !existingNames.includes(name));
  const trimmedCustomName = customName.trim();
  const canAddCustom = trimmedCustomName !== "" && !existingNames.includes(trimmedCustomName);

  const handleAddCustom = () => {
    if (!canAddCustom) return;
    onAdd(trimmedCustomName);
    setCustomName("");
  };

  return (
    <div className="space-y-2.5">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onAdd(name)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-accent/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddCustom();
            }
          }}
          placeholder="Özel ortam adı"
          className="bg-accent/50 border-border/50"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleAddCustom} disabled={!canAddCustom}>
          <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Ekle
        </Button>
      </div>
    </div>
  );
};
