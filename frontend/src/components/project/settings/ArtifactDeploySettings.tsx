import { Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ArtifactComponentConfig, ArtifactDeployConfig, ProjectConfig } from '@/types/project';
import { KeyValueEditor } from '@/components/settings/KeyValueEditor';
import { needsNewArtifactToken } from './artifactDeployValidation';

type Props = {
  config: ProjectConfig;
  original?: ArtifactDeployConfig;
  onChange: (next: ProjectConfig) => void;
};

const EMPTY_COMPONENT: ArtifactComponentConfig = {
  name: '',
  subdir: '',
  os: 'any',
  runtime: { type: 'none' },
  preserve: [],
  health: null,
  writeRuntimeConfig: false,
  hooks: null,
};

const fieldClass = 'mt-1.5 bg-accent/50 border-border/50';

export const ArtifactDeploySettings = ({ config, original, onChange }: Props) => {
  const artifact = config.artifactDeploy;
  const tokenRequired = needsNewArtifactToken(original, artifact);

  const setEnabled = (enabled: boolean) => {
    if (enabled) {
      onChange({
        ...config,
        artifactDeploy: {
          source: { platform: 'bitbucket', authType: 'basic' },
          build: { provider: 'pipeline' },
          versionVariable: 'VERSION',
          artifactName: '',
          components: [],
        },
      });
      return;
    }
    const { artifactDeploy: _removed, ...rest } = config;
    onChange(rest);
  };

  const update = (patch: Partial<ArtifactDeployConfig>) => {
    if (!artifact) return;
    onChange({ ...config, artifactDeploy: { ...artifact, ...patch } });
  };

  const updateComponent = (index: number, patch: Partial<ArtifactComponentConfig>) => {
    if (!artifact) return;
    const components = [...(artifact.components ?? [])];
    components[index] = { ...components[index], ...patch };
    update({ components });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-accent/20 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" />Artifact deployment</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">CI çıktısını sürüm olarak kaydedip IDP agent üzerinden hedef sunuculara kurar.</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <input type="checkbox" checked={Boolean(artifact)} onChange={(event) => setEnabled(event.target.checked)} />
          Enabled
        </label>
      </div>

      {artifact && <>
        <section className="space-y-4 rounded-lg border border-border/60 p-4">
          <div><h3 className="text-sm font-semibold">Artifact source</h3><p className="text-xs text-muted-foreground">Manifest and archives are read from this repository.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Platform</Label><Select value={artifact.source?.platform ?? 'bitbucket'} onValueChange={(platform: 'bitbucket' | 'github') => update({ source: { ...artifact.source, platform } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bitbucket">Bitbucket</SelectItem><SelectItem value="github">GitHub</SelectItem></SelectContent></Select></div>
            <div><Label>Authentication</Label><Select value={artifact.source?.authType ?? 'bearer'} onValueChange={(authType: 'bearer' | 'basic') => update({ source: { ...artifact.source, authType } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bearer">Bearer token</SelectItem><SelectItem value="basic">Basic auth</SelectItem></SelectContent></Select></div>
            <div><Label>Owner / workspace</Label><Input className={fieldClass} value={artifact.source?.owner ?? ''} onChange={(event) => update({ source: { ...artifact.source, owner: event.target.value } })} placeholder="mdp-group" /></div>
            <div><Label>Repository</Label><Input className={fieldClass} value={artifact.source?.repo ?? ''} onChange={(event) => update({ source: { ...artifact.source, repo: event.target.value } })} placeholder="payment-api" /></div>
            {artifact.source?.authType === 'basic' && <div><Label>Username / email</Label><Input className={fieldClass} value={artifact.source?.username ?? ''} onChange={(event) => update({ source: { ...artifact.source, username: event.target.value } })} autoComplete="username" /></div>}
            <div><Label>Repository token</Label><Input className={fieldClass} type="password" value={artifact.source?.token ?? ''} onChange={(event) => update({ source: { ...artifact.source, token: event.target.value } })} placeholder={tokenRequired ? 'Required after source change' : artifact.source?.hasToken ? 'Saved — leave blank to keep' : 'Required'} autoComplete="new-password" />{tokenRequired && <p className="mt-1 text-[11px] text-destructive">Source identity changed. Enter the token for the new source.</p>}</div>
            <div className="sm:col-span-2"><Label>API base URL (optional)</Label><Input className={fieldClass} value={artifact.source?.baseUrl ?? ''} onChange={(event) => update({ source: { ...artifact.source, baseUrl: event.target.value } })} placeholder={artifact.source?.platform === 'github' ? 'https://api.github.com' : 'https://api.bitbucket.org/2.0'} /></div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border/60 p-4">
          <h3 className="text-sm font-semibold">Build and manifest</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label>Build provider</Label><Select value={artifact.build?.provider ?? 'none'} onValueChange={(provider: 'pipeline' | 'jenkins' | 'none') => update({ build: { provider } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pipeline">CI pipeline</SelectItem><SelectItem value="jenkins">Jenkins</SelectItem><SelectItem value="none">Import only</SelectItem></SelectContent></Select></div>
            <div><Label>Artifact name</Label><Input className={fieldClass} value={artifact.artifactName ?? ''} onChange={(event) => update({ artifactName: event.target.value })} placeholder="payment-api" /></div>
            <div><Label>Version variable</Label><Input className={fieldClass} value={artifact.versionVariable ?? ''} onChange={(event) => update({ versionVariable: event.target.value })} placeholder="VERSION" /></div>
          </div>

          {artifact.build?.provider !== 'none' && (
            <div className="border-t border-border/60 pt-4">
              <Label>Build parameters</Label>
              <p className="mb-2.5 mt-1 text-xs text-muted-foreground">
                Sent to the build with the version. Values set here beat the server-wide defaults in
                Settings, and a declarative Jenkins pipeline resets its own defaults on every run —
                which is why they belong here rather than in the job.
              </p>
              <KeyValueEditor
                value={artifact.build?.parameters}
                onChange={(parameters) => update({ build: { ...artifact.build, parameters } })}
                noun="Parameter"
                emptyHint="No parameters yet, e.g. IDP_PROJECT_ID or TENANT_SLUG."
                footnote={
                  'Parameters are not secret: they reach the CI tool as job parameters and appear in its ' +
                  'build log. For a credential, pass its id and let the CI tool resolve it.'
                }
              />
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Components</h3><p className="text-xs text-muted-foreground">Each archive installs into its own folder.</p></div><Button type="button" size="sm" variant="outline" onClick={() => update({ components: [...(artifact.components ?? []), { ...EMPTY_COMPONENT, runtime: { ...EMPTY_COMPONENT.runtime } }] })}><Plus className="mr-1.5 h-3.5 w-3.5" />Add</Button></div>
          {(artifact.components ?? []).length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No components configured.</p>}
          {(artifact.components ?? []).map((component, index) => <div key={`${index}-${component.name}`} className="space-y-3 rounded-md border border-border/60 bg-accent/10 p-3">
            <div className="flex justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Component {index + 1}</p><Button type="button" size="sm" variant="ghost" onClick={() => update({ components: (artifact.components ?? []).filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-3.5 w-3.5" /></Button></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Name</Label><Input className={fieldClass} value={component.name} onChange={(event) => updateComponent(index, { name: event.target.value })} placeholder="backend" /></div>
              <div><Label>Subdirectory</Label><Input className={fieldClass} value={component.subdir} onChange={(event) => updateComponent(index, { subdir: event.target.value })} placeholder="backend" /></div>
              <div><Label>Artifact OS</Label><Select value={component.os ?? 'any'} onValueChange={(os: 'any' | 'win-x64' | 'linux-x64') => updateComponent(index, { os })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="win-x64">Windows x64</SelectItem><SelectItem value="linux-x64">Linux x64</SelectItem></SelectContent></Select></div>
              <div><Label>Runtime</Label><Select value={component.runtime.type} onValueChange={(type: ArtifactComponentConfig['runtime']['type']) => updateComponent(index, { runtime: { type } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nssm">NSSM</SelectItem><SelectItem value="windows-service">Windows service</SelectItem><SelectItem value="iis-static">IIS static</SelectItem><SelectItem value="systemd">systemd</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></div>
              {['nssm', 'windows-service', 'systemd'].includes(component.runtime.type) && <div><Label>Service name</Label><Input className={fieldClass} value={component.runtime.serviceName ?? ''} onChange={(event) => updateComponent(index, { runtime: { ...component.runtime, serviceName: event.target.value } })} /></div>}
              {component.runtime.type === 'iis-static' && <div><Label>App pool (optional)</Label><Input className={fieldClass} value={component.runtime.appPool ?? ''} onChange={(event) => updateComponent(index, { runtime: { ...component.runtime, appPool: event.target.value } })} /></div>}
              <div className="sm:col-span-3"><Label>Preserve paths (comma separated)</Label><Input className={fieldClass} value={(component.preserve ?? []).join(', ')} onChange={(event) => updateComponent(index, { preserve: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder=".env, uploads/**" /></div>
              <div className="sm:col-span-2"><Label>Health URL (optional)</Label><Input className={fieldClass} value={component.health?.url ?? ''} onChange={(event) => updateComponent(index, { health: event.target.value ? { ...(component.health ?? { timeoutSec: 90 }), url: event.target.value } : null })} placeholder="http://127.0.0.1:3001/health" /></div>
              <div><Label>Health timeout (seconds)</Label><Input className={fieldClass} type="number" min={5} max={600} disabled={!component.health} value={component.health?.timeoutSec ?? 90} onChange={(event) => updateComponent(index, { health: component.health ? { ...component.health, timeoutSec: Number(event.target.value) } : null })} /></div>
              {component.health && <div className="sm:col-span-2"><Label>Version response path (optional)</Label><Input className={fieldClass} value={component.health.expectVersionPath ?? ''} onChange={(event) => updateComponent(index, { health: { url: component.health?.url ?? '', timeoutSec: component.health?.timeoutSec, expectVersionPath: event.target.value || null } })} placeholder="version" /></div>}
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium"><input type="checkbox" checked={component.writeRuntimeConfig === true} onChange={(event) => updateComponent(index, { writeRuntimeConfig: event.target.checked })} />Write target runtime config to config.js</label>
            </div>
          </div>)}
        </section>
      </>}
    </div>
  );
};
