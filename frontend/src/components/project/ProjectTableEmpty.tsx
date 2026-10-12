import { FolderOpen, Plus } from "lucide-react";

type ProjectTableEmptyProps = {
  hasFilters: boolean;
  onClearFilters: () => void;
  /** Omitted when the operator lacks permission to create projects. */
  onCreateProject?: () => void;
};

export const ProjectTableEmpty = ({
  hasFilters,
  onClearFilters,
  onCreateProject,
}: ProjectTableEmptyProps) => (
  <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-line-strong bg-surface">
      <FolderOpen className="h-5 w-5 text-dim" aria-hidden="true" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {hasFilters ? "Filtrelere uyan proje yok" : "Henüz proje yok"}
      </p>
      <p className="text-xs text-muted-foreground">
        {hasFilters
          ? "Aramayı ya da sağlayıcı filtresini değiştirerek listeyi genişletin."
          : "Bir proje oluşturun; dağıtımı buradan yönetirsiniz."}
      </p>
    </div>
    {hasFilters ? (
      <button
        type="button"
        onClick={onClearFilters}
        className="text-xs font-medium text-primary hover:underline"
      >
        Filtreleri temizle
      </button>
    ) : (
      // A first-time operator lands here with nothing to look at; without this
      // the screen states the problem and offers no way out of it.
      onCreateProject && (
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Yeni proje
        </button>
      )
    )}
  </div>
);
