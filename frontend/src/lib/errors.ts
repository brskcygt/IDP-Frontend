/** What the UI says when a call failed without a message of its own (network down, server gone). */
export const NO_RESPONSE_MESSAGE = 'Sunucudan yanıt alınamadı. Bağlantıyı kontrol edip tekrar deneyin.';

/** The failure's own message when it has one, else a Turkish sentence a person can act on. */
export const errorMessage = (cause: unknown, fallback: string = NO_RESPONSE_MESSAGE): string =>
  cause instanceof Error && cause.message.trim() ? cause.message : fallback;
