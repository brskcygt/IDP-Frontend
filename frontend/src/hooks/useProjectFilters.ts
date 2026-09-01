import { useMemo, useState } from 'react';
import type { Project } from './useProjects';
import { statusWeight } from '@/lib/projectMeta';
import { normalizeProvider } from '@/lib/providers';

export type ProjectFilterState = {
  search: string;
  provider: string | null;
  failedOnly: boolean;
};

const INITIAL_STATE: ProjectFilterState = {
  search: '',
  provider: null,
  failedOnly: false,
};

const matchesSearch = (project: Project, term: string): boolean => {
  if (!term) return true;
  const needle = term.toLowerCase();
  return (
    project.name.toLowerCase().includes(needle) ||
    project.tenant.toLowerCase().includes(needle) ||
    project.provider.toLowerCase().includes(needle)
  );
};

/**
 * Owns the dashboard's filter state and derives the visible rows.
 *
 * Provider options are the canonical values (T-35/T-36) derived from
 * `normalizeProvider`, not the raw strings on each project — otherwise
 * legacy `SSH`/`WinRM` records (the same adapter family as `Server`, split
 * only by `config.targetOS`) would show up as separate, confusing chips, and
 * a `Server` filter would silently miss records still tagged `SSH`/`WinRM`.
 */
export const useProjectFilters = (projects: Project[] | undefined) => {
  const [filters, setFilters] = useState<ProjectFilterState>(INITIAL_STATE);

  const providers = useMemo(
    () => [...new Set((projects ?? []).map((project) => normalizeProvider(project.provider)))].sort(),
    [projects],
  );

  const visible = useMemo(() => {
    const rows = (projects ?? []).filter(
      (project) =>
        matchesSearch(project, filters.search) &&
        (!filters.provider || normalizeProvider(project.provider) === filters.provider) &&
        (!filters.failedOnly || project.status === 'Failed'),
    );

    return [...rows].sort((a, b) => {
      const byStatus = statusWeight(a.status) - statusWeight(b.status);
      if (byStatus !== 0) return byStatus;
      return new Date(b.lastDeploy).getTime() - new Date(a.lastDeploy).getTime();
    });
  }, [projects, filters]);

  const failed = useMemo(
    () => (projects ?? []).filter((project) => project.status === 'Failed'),
    [projects],
  );

  const setSearch = (search: string) => setFilters((prev) => ({ ...prev, search }));
  const setProvider = (provider: string | null) =>
    setFilters((prev) => ({ ...prev, provider: prev.provider === provider ? null : provider }));
  const toggleFailedOnly = () =>
    setFilters((prev) => ({ ...prev, failedOnly: !prev.failedOnly }));

  return {
    filters,
    providers,
    visible,
    failed,
    total: projects?.length ?? 0,
    setSearch,
    setProvider,
    toggleFailedOnly,
  };
};
