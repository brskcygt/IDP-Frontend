import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Braces, Check, Play, Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectConfig } from "@/types/project";

interface ScriptEditorProps { config: ProjectConfig; onChange: (nextConfig: ProjectConfig) => void; isWindows: boolean; }
type QuickTemplate = { id: string; name: string; script: string; platform: "windows" | "linux" };

const STORAGE_KEY = "idp.quick-script-templates.v1";
const BUILT_INS: Record<QuickTemplate["platform"], QuickTemplate[]> = {
  windows: [
    { id: "win-git-build", name: "Git Pull + NPM Build", platform: "windows", script: "git pull origin main\nnpm install\nnpm run build" },
    { id: "win-service", name: "Windows Service Restart", platform: "windows", script: 'Restart-Service -Name "W3SVC" -Force' },
    { id: "win-iis", name: "IIS AppPool Restart", platform: "windows", script: 'Stop-WebAppPool -Name "DefaultAppPool"\nStart-WebAppPool -Name "DefaultAppPool"' },
  ],
  linux: [
    { id: "linux-node", name: "Git Pull + NPM Build", platform: "linux", script: "git pull origin main\nnpm install\nnpm run build" },
    { id: "linux-pm2", name: "PM2 Node Deploy", platform: "linux", script: "git pull origin main\nnpm install\nnpm run build\npm2 restart all" },
    { id: "linux-docker", name: "Docker Compose Deploy", platform: "linux", script: "docker compose pull\ndocker compose up -d" },
    { id: "linux-systemd", name: "Systemd Restart", platform: "linux", script: "sudo systemctl restart app\nsudo systemctl status app --no-pager" },
  ],
};

const loadTemplates = (): QuickTemplate[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name && item?.script) : [];
  } catch { return []; }
};

/** Code-like remote deploy editor with reusable user-defined quick templates. */
export const ScriptEditor = ({ config, onChange, isWindows }: ScriptEditorProps) => {
  const script = config.scriptContent || "";
  const platform: QuickTemplate["platform"] = isWindows ? "windows" : "linux";
  const [customTemplates, setCustomTemplates] = useState<QuickTemplate[]>(loadTemplates);
  const [isNaming, setIsNaming] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saved, setSaved] = useState(false);
  const gutterRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates)); }, [customTemplates]);
  const visibleCustom = useMemo(() => customTemplates.filter((item) => item.platform === platform), [customTemplates, platform]);
  const allTemplates = [...BUILT_INS[platform], ...visibleCustom];
  const lineCount = Math.max(1, script.split("\n").length);
  const updateScript = (next: string) => onChange({ ...config, scriptContent: next });

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name || !script.trim()) return;
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setCustomTemplates((current) => [...current, { id, name, script, platform }]);
    setTemplateName(""); setIsNaming(false); setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return <div className="space-y-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><Braces className="h-3.5 w-3.5 text-primary" />Deployment script</Label>
      <div className="flex items-center gap-2">
        <Select onValueChange={(id) => { const template = allTemplates.find((item) => item.id === id); if (template) updateScript(template.script); }}>
          <SelectTrigger className="h-8 w-[210px] border-border/60 bg-accent/40 font-mono text-[10px]"><SelectValue placeholder="Quick Template uygula" /></SelectTrigger>
          <SelectContent>
            {BUILT_INS[platform].map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            {visibleCustom.map((item) => <SelectItem key={item.id} value={item.id}>★ {item.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <button type="button" disabled={!script.trim()} onClick={() => setIsNaming((current) => !current)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/35 bg-primary/[0.06] px-3 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-35">
          {saved ? <Check className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}{saved ? "Kaydedildi" : "Quick Template olarak kaydet"}
        </button>
      </div>
    </div>

    {isNaming && <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/[0.035] p-2">
      <Input autoFocus value={templateName} onChange={(event) => setTemplateName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveTemplate(); } }} placeholder="Şablon adı — örn. Turtly Build" className="h-8 border-border/60 bg-background text-xs" />
      <button type="button" onClick={saveTemplate} disabled={!templateName.trim()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[10px] font-bold text-primary-foreground disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Ekle</button>
    </div>}

    {visibleCustom.length > 0 && <div className="flex flex-wrap gap-1.5">{visibleCustom.map((template) => <div key={template.id} className="group inline-flex h-7 items-center overflow-hidden rounded-md border border-border/55 bg-accent/25">
      <button type="button" onClick={() => updateScript(template.script)} className="inline-flex h-full items-center gap-1.5 px-2.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"><Play className="h-3 w-3 text-primary" />{template.name}</button>
      <button type="button" aria-label={`${template.name} şablonunu sil`} onClick={() => setCustomTemplates((current) => current.filter((item) => item.id !== template.id))} className="grid h-full w-7 place-items-center border-l border-border/50 text-dim opacity-50 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
    </div>)}</div>}

    <div className="overflow-hidden rounded-lg border border-zinc-700/80 bg-[#090b0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_12px_30px_rgba(0,0,0,0.18)] focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/20">
      <div className="flex h-9 items-center justify-between border-b border-zinc-800 bg-[#101316] px-3.5">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />{isWindows ? "PowerShell" : "Bash"}<span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400">{isWindows ? "PS1" : "SH"}</span></div>
        <span className="font-mono text-[9px] text-zinc-600">{lineCount} lines · {script.length} chars</span>
      </div>
      <div className="flex min-h-[230px] max-h-[420px] overflow-hidden">
        <div ref={gutterRef} aria-hidden="true" className="w-12 shrink-0 overflow-hidden border-r border-zinc-800/90 bg-[#0c0e10] py-3 text-right font-mono text-[12px] leading-5 text-zinc-700 select-none">{Array.from({ length: lineCount }, (_, index) => <div key={index} className="pr-3">{index + 1}</div>)}</div>
        <Textarea value={script} onChange={(event) => updateScript(event.target.value)} onScroll={(event) => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; }} onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          event.preventDefault(); const target = event.currentTarget;
          const next = `${script.slice(0, target.selectionStart)}  ${script.slice(target.selectionEnd)}`; const caret = target.selectionStart + 2;
          updateScript(next); window.requestAnimationFrame(() => target.setSelectionRange(caret, caret));
        }} spellCheck={false} wrap="off" placeholder="git pull origin main\nnpm install\nnpm run build" className="min-h-[230px] flex-1 resize-y rounded-none border-0 bg-transparent px-4 py-3 font-mono text-[12px] leading-5 text-zinc-200 caret-amber-400 shadow-none outline-none placeholder:text-zinc-700 focus-visible:ring-0" />
      </div>
      <div className="flex h-8 items-center justify-between border-t border-zinc-800 bg-[#0d1012] px-3.5 font-mono text-[9px] text-zinc-600"><span>UTF-8 · LF · Tab = 2 spaces</span><span>Her satır sırayla çalıştırılır</span></div>
    </div>
    <p className="text-[10px] leading-relaxed text-muted-foreground">Şablonlar yalnızca bu IDP uygulamasında saklanır. Parola veya token içeren scriptleri Quick Template olarak kaydetmeyin.</p>
  </div>;
};
