import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export type Snippet = { label: string; value: string };

/** Labelled, copyable command/code block shared by the deployment guide and troubleshooting sheets. */
export const CodeBlock = ({ snippet }: { snippet: Snippet }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(snippet.value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return <div className="overflow-hidden rounded-lg border border-line bg-zinc-950">
    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
      <span>{snippet.label}</span>
      <button type="button" onClick={() => void copy()} className="flex items-center gap-1.5 text-zinc-400 hover:text-white">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </button>
    </div>
    <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-zinc-200">{snippet.value}</pre>
  </div>;
};
