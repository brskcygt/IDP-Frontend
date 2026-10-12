import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, Lock, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTransport } from "@/services/transport";
import type { SessionUser } from "@/services/transport/types";
import { errorMessage } from "@/lib/errors";

type LoginFormProps = {
  onLogin: (user: SessionUser) => void;
};

const LABEL_CLASS = "mb-2 block text-xs font-medium text-muted-foreground";
const FIELD_CLASS = "h-10 rounded-md border-line-strong bg-surface pl-9 font-mono text-[13px] md:text-[13px]";

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await getTransport().auth.login(username, password);
      onLogin(user);
    } catch (caught) {
      setError(errorMessage(caught, "Oturum açılamadı. Sunucuya ulaşılamıyor olabilir; bağlantıyı kontrol edip tekrar deneyin."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[372px]">
      <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Oturum aç</h2>
      <p className="mb-8 text-[13px] text-muted-foreground">
        IDP kullanıcı adınız ve parolanızla devam edin.
      </p>

      <div className="mb-[18px]">
        <Label htmlFor="username" className={LABEL_CLASS}>
          Kullanıcı adı
        </Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-dim" aria-hidden="true" />
          <Input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            autoFocus
            autoComplete="username"
            disabled={isSubmitting}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="mb-3">
        <Label htmlFor="password" className={LABEL_CLASS}>
          Parola
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-dim" aria-hidden="true" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-md border-l-2 border-destructive bg-destructive/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-[42px] w-full items-center justify-center gap-2.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Lock className="h-[15px] w-[15px]" aria-hidden="true" />
        )}
        {isSubmitting ? "Oturum açılıyor…" : "Oturum aç"}
      </button>
    </form>
  );
};
