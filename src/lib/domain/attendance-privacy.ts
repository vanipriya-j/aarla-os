/**
 * Retention note for attendance evidence (camera images).
 *
 * - Purpose: operational proof of check-in / check-out presence at a device.
 * - Not facial recognition / biometric matching.
 * - Access: authenticated admin / attendance-correct roles via
 *   /api/attendance/evidence/[id] only (private, no-store).
 * - Default retention: keep while the attendance_session exists; purge via
 *   future admin job or DELETE when policy changes (table supports cascade).
 * - Recommend reviewing every 90 days for office policy alignment.
 */
export const ATTENDANCE_EVIDENCE_RETENTION_DAYS = 90;
