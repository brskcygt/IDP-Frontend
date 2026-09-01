import { useCallback, useEffect, useRef, useState } from 'react';

const LENGTH = 6;
const EMPTY = () => Array<string>(LENGTH).fill('');

/**
 * Six-digit code entry with auto-advance, backspace-retreat and support for a
 * code the OTP webhook intercepted on the operator's behalf.
 */
export const useTotpInputs = (interceptedCode?: string) => {
  const [digits, setDigits] = useState<string[]>(EMPTY);
  const [isIntercepted, setIsIntercepted] = useState(false);

  useEffect(() => {
    if (!interceptedCode) {
      setDigits(EMPTY());
      setIsIntercepted(false);
      return;
    }
    const filled = interceptedCode.split('').slice(0, LENGTH);
    while (filled.length < LENGTH) filled.push('');
    setDigits(filled);
    setIsIntercepted(true);
  }, [interceptedCode]);

  // Refs rather than getElementById: the MFA prompt now renders as a global
  // modal that can be mounted alongside the terminal panel, so a document-wide
  // id lookup could match an input from a different deployment's prompt.
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const registerInput = useCallback(
    (index: number) => (element: HTMLInputElement | null) => {
      inputRefs.current[index] = element;
    },
    [],
  );

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

  const setDigit = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setDigits((prev) => prev.map((digit, i) => (i === index ? value : digit)));
    if (value && index < LENGTH - 1) focusInput(index + 1);
  }, []);

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && !digits[index] && index > 0) focusInput(index - 1);
    },
    [digits],
  );

  const reset = useCallback(() => {
    setDigits(EMPTY());
    setIsIntercepted(false);
  }, []);

  const code = digits.join('');
  return {
    digits,
    code,
    isComplete: code.length === LENGTH,
    isIntercepted,
    setDigit,
    handleKeyDown,
    reset,
    registerInput,
  };
};
