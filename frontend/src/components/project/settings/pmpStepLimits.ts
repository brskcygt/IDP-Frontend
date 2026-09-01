/**
 * Mirrors backend/src/adapters/pmp/stepSchema.js's MAX_STEPS. Kept as a
 * plain constant (not imported across the frontend/backend boundary) so the
 * step editor can disable "add step" before hitting the server-side limit.
 */
export const MAX_PMP_STEPS = 100;
