import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { LoginForm } from "@/components/auth/LoginForm";
import { useAppVersion } from "@/hooks/useAppVersion";

import type { SessionUser } from '@/services/transport/types';

export function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const version = useAppVersion();

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <LoginBrandPanel />
      <div className="relative flex flex-grow items-center justify-center px-6 pb-16">
        <LoginForm onLogin={onLogin} />
        <div className="absolute inset-x-6 bottom-6 flex items-center justify-between border-t border-line pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          <span>© 2026 MDP Group</span>
          <span className="rounded border border-line-strong bg-bar px-2 py-1 text-muted-foreground">
            IDP {version ? `v${version}` : "version —"}
          </span>
        </div>
      </div>
    </main>
  );
}
