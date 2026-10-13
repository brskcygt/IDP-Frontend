import { useRef } from 'react';
import { FolderOpen, Package, Plus, Trash2 } from 'lucide-react';
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
  const building = Boolean(artifact) && artifact?.build?.provider !== 'none';
  // A project that only imports from its repository still needs to see it.
  const usesRepository = building || Boolean(artifact?.source?.owner || artifact?.source?.repo);

  // Component cards need a key that survives typing. Keying on component.name
  // changed the key on every keystroke in the Name field, so React rebuilt the card
  // and the input lost focus. These ids live only here — the saved config is untouched.
  const cardIds = useRef<string[]>([]);
  const nextCardId = useRef(0);
  const componentKeys = (artifact?.components ?? []).map((_, index) => {
    cardIds.current[index] ??= `component-${nextCardId.current++}`;
    return cardIds.current[index];
  });

  const setEnabled = (enabled: boolean) => {
    if (enabled) {
      onChange({
        ...config,
        artifactDeploy: {
          source: { platform: 'bitbucket', authType: 'basic' },
          // Start without IDP builds: the repository settings appear once a
          // provider is picked, and a folder-only project never needs them.
          build: { provider: 'none' },
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
          <p className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" />Artifact dağıtımı</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">CI çıktısını sürüm olarak kaydeder ve IDP agent üzerinden müşteri sunucularına kurar. Açıkken proje satırındaki "Aç" ile Müşteriler, Sürümler ve Kaynak kod ekranı kullanılır.</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <input type="checkbox" checked={Boolean(artifact)} onChange={(event) => setEnabled(event.target.checked)} />
          Etkin
        </label>
      </div>

      {artifact && <>
        <section className="space-y-4 rounded-lg border border-border/60 p-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-primary" />Sunucudaki derleme klasörü</h3>
            <p className="text-xs text-muted-foreground">Jenkins ya da başka bir CI'ın hazır .tar.gz dosyalarını kopyaladığı klasör. Sürümler'de "Klasörden al" bu klasörü listeler; seçtiğin dosyalar sürüm olur. Depo bilgisi gerekmez.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2"><Label>Klasör yolu (IDP sunucusunda)</Label><Input className={fieldClass} value={artifact.localFolder ?? ''} onChange={(event) => update({ localFolder: event.target.value })} placeholder="C:\builds\jetsrm" spellCheck={false} /></div>
            <div><Label>Artifact adı</Label><Input className={fieldClass} value={artifact.artifactName ?? ''} onChange={(event) => update({ artifactName: event.target.value })} placeholder="jetsrm" /></div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border/60 p-4">
          <div>
            <h3 className="text-sm font-semibold">IDP üzerinden derleme</h3>
            <p className="text-xs text-muted-foreground">IDP'nin derlemeyi kendisinin başlatması, Kaynak kod sekmesi (branch, birleştirme, tag) ve depodan içe aktarma için. Yalnız klasörden sürüm alıyorsan kapalı bırak.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Derleme sağlayıcısı</Label><Select value={artifact.build?.provider ?? 'none'} onValueChange={(provider: 'pipeline' | 'jenkins' | 'none') => update({ build: { ...artifact.build, provider } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Kapalı</SelectItem><SelectItem value="jenkins">Jenkins</SelectItem><SelectItem value="pipeline">CI pipeline (Bitbucket/GitHub)</SelectItem></SelectContent></Select></div>
            {building && <div><Label>Sürüm değişkeni</Label><Input className={fieldClass} value={artifact.versionVariable ?? ''} onChange={(event) => update({ versionVariable: event.target.value })} placeholder="VERSION" /></div>}
          </div>

          {usesRepository && (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <div><Label>Kaynak depo</Label><p className="mt-1 text-xs text-muted-foreground">Manifest ve paketler bu depodan okunur. Kaynak kod sekmesindeki branch ve tag'ler de buradan gelir; önizleme branch'leri ve tag'ler bu depoda oluşturulur (yalnız Bitbucket).</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Platform</Label><Select value={artifact.source?.platform ?? 'bitbucket'} onValueChange={(platform: 'bitbucket' | 'github') => update({ source: { ...artifact.source, platform } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bitbucket">Bitbucket</SelectItem><SelectItem value="github">GitHub</SelectItem></SelectContent></Select></div>
                <div><Label>Kimlik doğrulama</Label><Select value={artifact.source?.authType ?? 'bearer'} onValueChange={(authType: 'bearer' | 'basic') => update({ source: { ...artifact.source, authType } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bearer">Bearer token</SelectItem><SelectItem value="basic">Basic auth</SelectItem></SelectContent></Select></div>
                <div><Label>Sahip / workspace</Label><Input className={fieldClass} value={artifact.source?.owner ?? ''} onChange={(event) => update({ source: { ...artifact.source, owner: event.target.value } })} placeholder="mdp-group" /></div>
                <div><Label>Depo</Label><Input className={fieldClass} value={artifact.source?.repo ?? ''} onChange={(event) => update({ source: { ...artifact.source, repo: event.target.value } })} placeholder="payment-api" /></div>
                {artifact.source?.authType === 'basic' && <div><Label>Kullanıcı adı / e-posta</Label><Input className={fieldClass} value={artifact.source?.username ?? ''} onChange={(event) => update({ source: { ...artifact.source, username: event.target.value } })} autoComplete="username" /></div>}
                <div><Label>Depo token'ı</Label><Input className={fieldClass} type="password" value={artifact.source?.token ?? ''} onChange={(event) => update({ source: { ...artifact.source, token: event.target.value } })} placeholder={tokenRequired ? 'Kaynak değişti, gerekli' : artifact.source?.hasToken ? 'Kayıtlı — korumak için boş bırakın' : 'Gerekli'} autoComplete="new-password" />{tokenRequired && <p className="mt-1 text-[11px] text-destructive">Kaynak değişti. Yeni kaynağın token'ını girin.</p>}</div>
                <div className="sm:col-span-2"><Label>API adresi (isteğe bağlı)</Label><Input className={fieldClass} value={artifact.source?.baseUrl ?? ''} onChange={(event) => update({ source: { ...artifact.source, baseUrl: event.target.value } })} placeholder={artifact.source?.platform === 'github' ? 'https://api.github.com' : 'https://api.bitbucket.org/2.0'} /></div>
              </div>
            </div>
          )}
          {building && (
            <div className="border-t border-border/60 pt-4">
              <Label>Derleme parametreleri</Label>
              <p className="mb-2.5 mt-1 text-xs text-muted-foreground">
                Sürümle birlikte derlemeye gönderilir. Buradaki değerler Sunucu ayarları'ndaki varsayılanları
                ezer; declarative Jenkins pipeline'ı kendi varsayılanlarını her çalışmada sıfırladığı için
                job'da değil burada tutulur.
              </p>
              <KeyValueEditor
                value={artifact.build?.parameters}
                onChange={(parameters) => update({ build: { ...artifact.build, parameters } })}
                noun="Parametre"
                emptyHint="Henüz parametre yok; örn. IDP_PROJECT_ID ya da TENANT_SLUG."
                footnote={
                  'Parametreler gizli değildir: CI aracına job parametresi olarak gider ve derleme logunda ' +
                  'görünür. Kimlik bilgisi için id\'sini verin, CI aracı çözsün.'
                }
              />
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Bileşenler</h3><p className="text-xs text-muted-foreground">Her paket kendi klasörüne kurulur.</p></div><Button type="button" size="sm" variant="outline" onClick={() => update({ components: [...(artifact.components ?? []), { ...EMPTY_COMPONENT, runtime: { ...EMPTY_COMPONENT.runtime } }] })}><Plus className="mr-1.5 h-3.5 w-3.5" />Ekle</Button></div>
          {(artifact.components ?? []).length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Bileşen tanımlı değil.</p>}
          {(artifact.components ?? []).map((component, index) => <div key={componentKeys[index]} className="space-y-3 rounded-md border border-border/60 bg-accent/10 p-3">
            <div className="flex justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bileşen {index + 1}</p><Button type="button" size="sm" variant="ghost" onClick={() => { cardIds.current.splice(index, 1); update({ components: (artifact.components ?? []).filter((_, itemIndex) => itemIndex !== index) }); }}><Trash2 className="h-3.5 w-3.5" /></Button></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Ad</Label><Input className={fieldClass} value={component.name} onChange={(event) => updateComponent(index, { name: event.target.value })} placeholder="backend" /></div>
              <div><Label>Alt dizin</Label><Input className={fieldClass} value={component.subdir} onChange={(event) => updateComponent(index, { subdir: event.target.value })} placeholder="backend" /></div>
              <div><Label>Artifact işletim sistemi</Label><Select value={component.os ?? 'any'} onValueChange={(os: 'any' | 'win-x64' | 'linux-x64') => updateComponent(index, { os })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Hepsi</SelectItem><SelectItem value="win-x64">Windows x64</SelectItem><SelectItem value="linux-x64">Linux x64</SelectItem></SelectContent></Select></div>
              <div><Label>Çalışma şekli</Label><Select value={component.runtime.type} onValueChange={(type: ArtifactComponentConfig['runtime']['type']) => updateComponent(index, { runtime: { type } })}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nssm">NSSM</SelectItem><SelectItem value="windows-service">Windows servisi</SelectItem><SelectItem value="iis-static">IIS static</SelectItem><SelectItem value="systemd">systemd</SelectItem><SelectItem value="none">Yok</SelectItem></SelectContent></Select></div>
              {['nssm', 'windows-service', 'systemd'].includes(component.runtime.type) && <div><Label>Servis adı</Label><Input className={fieldClass} value={component.runtime.serviceName ?? ''} onChange={(event) => updateComponent(index, { runtime: { ...component.runtime, serviceName: event.target.value } })} /></div>}
              {component.runtime.type === 'iis-static' && <div><Label>App pool (isteğe bağlı)</Label><Input className={fieldClass} value={component.runtime.appPool ?? ''} onChange={(event) => updateComponent(index, { runtime: { ...component.runtime, appPool: event.target.value } })} /></div>}
              <div className="sm:col-span-3"><Label>Korunacak yollar (virgülle)</Label><Input className={fieldClass} value={(component.preserve ?? []).join(', ')} onChange={(event) => updateComponent(index, { preserve: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder=".env, uploads/**" /></div>
              <div className="sm:col-span-2"><Label>Sağlık URL'si (isteğe bağlı)</Label><Input className={fieldClass} value={component.health?.url ?? ''} onChange={(event) => updateComponent(index, { health: event.target.value ? { ...(component.health ?? { timeoutSec: 90 }), url: event.target.value } : null })} placeholder="http://127.0.0.1:3001/health" /></div>
              <div><Label>Sağlık zaman aşımı (saniye)</Label><Input className={fieldClass} type="number" min={5} max={600} disabled={!component.health} value={component.health?.timeoutSec ?? 90} onChange={(event) => updateComponent(index, { health: component.health ? { ...component.health, timeoutSec: Number(event.target.value) } : null })} /></div>
              {component.health && <div className="sm:col-span-2"><Label>Yanıttaki sürüm alanı (isteğe bağlı)</Label><Input className={fieldClass} value={component.health.expectVersionPath ?? ''} onChange={(event) => updateComponent(index, { health: { url: component.health?.url ?? '', timeoutSec: component.health?.timeoutSec, expectVersionPath: event.target.value || null } })} placeholder="version" /></div>}
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium"><input type="checkbox" checked={component.writeRuntimeConfig === true} onChange={(event) => updateComponent(index, { writeRuntimeConfig: event.target.checked })} />Müşteri çalışma ayarlarını config.js'e yaz</label>
            </div>
          </div>)}
        </section>
      </>}
    </div>
  );
};
