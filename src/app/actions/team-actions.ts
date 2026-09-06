"use server";

import { getRequestAuth } from "@/lib/auth/request-auth";
import {
  AccountService,
  AttendanceService,
  LocationService,
  RolePermissionService,
  TeamService,
} from "@/lib/application/team-service";
import type { AccessRoleCode } from "@/lib/domain/team-types";
import type { CreateTeamMemberInput } from "@/lib/repositories/team";
import { workDateInTimezone } from "@/lib/domain/team-types";

function requireAdmin() {
  return getRequestAuth().then((auth) => {
    if (auth.authEnabled && auth.role !== "admin" && !auth.accessRoleCodes.includes("ADMIN") && !auth.accessRoleCodes.includes("FOUNDER_ADMIN")) {
      throw new Error("Not allowed");
    }
    return auth;
  });
}

export async function listTeamOverviewAction(workDate?: string) {
  await requireAdmin();
  return TeamService.overview(workDate);
}

export async function listTeamMembersAction(activeOnly = true) {
  await requireAdmin();
  return TeamService.listTeam(activeOnly);
}

export async function getTeamMemberAction(id: string) {
  await requireAdmin();
  return TeamService.getTeamMember(id);
}

export async function searchPeopleForTeamAction(query: string) {
  await requireAdmin();
  return TeamService.searchPeople(query);
}

export async function createTeamMemberAction(input: CreateTeamMemberInput) {
  await requireAdmin();
  try {
    const member = await TeamService.createTeamMember(input);
    return { ok: true as const, member };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not create team member",
    };
  }
}

export async function updateTeamMemberAction(
  id: string,
  patch: Parameters<typeof TeamService.updateTeamMember>[1],
) {
  await requireAdmin();
  try {
    const member = await TeamService.updateTeamMember(id, patch);
    return { ok: true as const, member };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not update",
    };
  }
}

export async function setAccountStatusAction(
  accountUsername: string,
  status: "active" | "disabled",
) {
  await requireAdmin();
  const account = await AccountService.getByUsername(accountUsername);
  if (!account) return { ok: false as const, error: "Account not found" };
  if (status === "disabled") await AccountService.disable(account.id);
  else await AccountService.enable(account.id);
  return { ok: true as const };
}

export async function listWorkLocationsAction(activeOnly = false) {
  await requireAdmin();
  return LocationService.list(activeOnly);
}

export async function upsertWorkLocationAction(input: {
  id?: string;
  code: string;
  name: string;
  locationType: "office" | "studio" | "warehouse" | "franchise" | "partner" | "other";
  timezone?: string;
  active?: boolean;
}) {
  await requireAdmin();
  return LocationService.upsert(input);
}

export async function listAccessRolesAction() {
  await requireAdmin();
  return RolePermissionService.listRoles();
}

export async function listAttendanceBoardAction(workDate?: string) {
  await requireAdmin();
  const date = workDate || workDateInTimezone();
  const overview = await TeamService.overview(date);
  const sessions = await AttendanceService.listForDate(date);
  return { date, overview, sessions };
}

export async function listAttendanceWeekAction(anchorDate?: string) {
  await requireAdmin();
  return AttendanceService.listWeek(anchorDate);
}

export async function adminCorrectAttendanceAction(input: {
  sessionId: string;
  reason: string;
  checkOutAt?: string | null;
  checkInAt?: string | null;
}) {
  const auth = await requireAdmin();
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Reason is required" };
  }
  const session = await AttendanceService.correctSession({
    sessionId: input.sessionId,
    changedByUsername: auth.username,
    changedByAccountId: auth.accountId,
    reason: input.reason.trim(),
    checkOutAt: input.checkOutAt,
    checkInAt: input.checkInAt,
    status: "MANUAL_CORRECTION",
  });
  return session
    ? { ok: true as const, session }
    : { ok: false as const, error: "Session not found" };
}

/** Self-service gate for the signed-in team member. */
export async function getMyAttendanceGateAction() {
  const auth = await getRequestAuth();
  if (!auth.accountId) {
    return { kind: "not_team" as const };
  }
  return AttendanceService.gateForAccount(auth.accountId);
}

export async function changeMyPinAction(newPin: string) {
  const auth = await getRequestAuth();
  if (!auth.accountId) return { ok: false as const, error: "Not a team account" };
  try {
    await AccountService.changeCredential(auth.accountId, newPin);
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not change PIN",
    };
  }
}

export async function checkInAction(input: {
  method: "camera" | "manual_admin" | "manual_self";
  imageBase64?: string | null;
  mimeType?: string;
  deviceMeta?: Record<string, unknown>;
  locationId?: string | null;
}) {
  const auth = await getRequestAuth();
  if (!auth.accountId || !auth.personId) {
    return { ok: false as const, error: "Not a team account" };
  }
  const account = await AccountService.getByUsername(auth.username);
  if (!account?.teamRelationshipId) {
    return { ok: false as const, error: "No active team relationship" };
  }
  if (input.method === "camera" && !input.imageBase64) {
    return {
      ok: false as const,
      error: "Camera capture required — or ask an admin for a manual check-in",
    };
  }
  try {
    const session = await AttendanceService.checkIn({
      personId: auth.personId,
      teamRelationshipId: account.teamRelationshipId,
      locationId: input.locationId ?? account.defaultLocationId,
      method: input.method,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      deviceMeta: input.deviceMeta,
    });
    return { ok: true as const, session };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Check-in failed",
    };
  }
}

export async function checkOutAction(input: {
  method: "camera" | "manual_admin" | "manual_self";
  imageBase64?: string | null;
  mimeType?: string;
  deviceMeta?: Record<string, unknown>;
}) {
  const auth = await getRequestAuth();
  if (!auth.personId) {
    return { ok: false as const, error: "Not a team account" };
  }
  const session = await AttendanceService.getTodaySession(auth.personId);
  if (!session || session.checkOutAt) {
    return { ok: false as const, error: "No open check-in to finish" };
  }
  if (input.method === "camera" && !input.imageBase64) {
    return {
      ok: false as const,
      error: "Camera capture required — or ask an admin for a manual check-out",
    };
  }
  try {
    const updated = await AttendanceService.checkOut({
      sessionId: session.id,
      method: input.method,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      deviceMeta: input.deviceMeta,
    });
    return { ok: true as const, session: updated };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Check-out failed",
    };
  }
}

export async function resolveMissedCheckoutAction(input: {
  sessionId: string;
  checkOutAtLocal: string; // datetime-local value
  reason: string;
}) {
  const auth = await getRequestAuth();
  if (!auth.accountId && auth.role !== "admin") {
    return { ok: false as const, error: "Not allowed" };
  }
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Please add a short reason" };
  }
  // Interpret local Asia/Kolkata-ish as ISO by appending offset if needed
  let checkOutAt = input.checkOutAtLocal.trim();
  if (checkOutAt && !checkOutAt.includes("Z") && !checkOutAt.includes("+")) {
    checkOutAt = `${checkOutAt}:00+05:30`;
  }
  const session = await AttendanceService.correctSession({
    sessionId: input.sessionId,
    changedByUsername: auth.username,
    changedByAccountId: auth.accountId,
    reason: input.reason.trim(),
    checkOutAt: new Date(checkOutAt).toISOString(),
    status: "MANUAL_CORRECTION",
  });
  return session
    ? { ok: true as const, session }
    : { ok: false as const, error: "Could not save correction" };
}

export async function assignAccessRolesAction(
  username: string,
  roleCodes: AccessRoleCode[],
) {
  await requireAdmin();
  const account = await AccountService.getByUsername(username);
  if (!account) return { ok: false as const, error: "Account not found" };
  await RolePermissionService.setAccountRoles(account.id, roleCodes);
  return { ok: true as const };
}
