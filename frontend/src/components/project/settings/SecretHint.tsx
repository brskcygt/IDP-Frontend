interface SecretHintProps {
  /** Show the hint only when a secret is already saved and not yet overwritten. */
  show: boolean;
}

/**
 * Small helper text shown under a secret input when the backend already has
 * a value stored for it (see `has*` flags on ProjectConfig). Backend
 * responses never include saved secret values, so this is the only signal
 * the user gets that something is already configured.
 */
export const SecretHint = ({ show }: SecretHintProps) => {
  if (!show) return null;
  return (
    <p className="text-[10px] text-muted-foreground/80 mt-1">
      Değiştirmek için yeni bir değer girin, boş bırakırsanız mevcut değer korunur
    </p>
  );
};

export const SAVED_SECRET_PLACEHOLDER = "•••••••• (kayıtlı)";
