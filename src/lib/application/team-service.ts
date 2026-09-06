import "server-only";

import { createTeamRepository } from "@/lib/infra/repositories/postgres-team";
import {
  hashCredential,
  isValidPinOrPassword,
  verifyCredential,
} from "@/lib/auth/credential-hash";
import {
  workDateInTimezone,
  type AccessRoleCode,
  type AttendanceMethod,
  type AttendanceSession,
  type TeamRelationship,
} from "@/lib/domain/team-types";
import type { CreateTeamMemberInput } from "@/lib/repositories/team";

const repo = () => createTeamRepository();

export const TeamService = {
  listTeam: (activeOnly = true) => repo().listTeam(activeOnly),
  getTeamMember: (id: string) => repo().getTeamMember(id),
  createTeamMember: (input: CreateTeamMemberInput) => repo().createTeamMember(input),
  updateTeamMember: (
    id: string,
    patch: Parameters<ReturnType<typeof createTeamRepository>["updateTeamMember"]>[1],
  ) => repo().updateTeamMember(id, patch),
  searchPeople: (q: string) => repo().searchPeople(q),
  overview: (workDate?: string) =>
    repo().teamOverview(workDate ?? workDateInTimezone()),
};

export const LocationService = {
  list: (activeOnly = true) => repo().listWorkLocations(activeOnly),
  get: (id: string) => repo().getWorkLocation(id),
  upsert: (input: Parameters<ReturnType<typeof createTeamRepository>["upsertWorkLocation"]>[0]) =>
    repo().upsertWorkLocation(input),
};

export const RolePermissionService = {
  listRoles: () => repo().listAccessRoles(),
  setAccountRoles: (accountId: string, codes: AccessRoleCode[]) =>
    repo().setAccountRoles(accountId, codes),
};

export const AccountService = {
  getByUsername: (username: string) => repo().getAccountByUsername(username),
  getById: (id: string) => repo().getAccountById(id),
  disable: (accountId: string) => repo().setAccountStatus(accountId, "disabled"),
  enable: (accountId: string) => repo().setAccountStatus(accountId, "active"),
  changeCredential: async (accountId: string, newPin: string) => {
    if (!isValidPinOrPassword(newPin)) {
      throw new Error("PIN/password must be at least 4 characters");
    }
    return repo().changeCredential(accountId, hashCredential(newPin), true);
  },
  authenticateInternal: async (username: string, password: string) => {
    const account = await repo().getAccountByUsername(username);
    if (!account) return { ok: false as const, reason: "invalid" as const };
    if (account.status === "disabled") {
      return { ok: false as const, reason: "disabled" as const, account };
    }
    if (!verifyCredential(password, account.credentialHash)) {
      return { ok: false as const, reason: "invalid" as const };
    }
    return { ok: true as const, account };
  },
  touchLogin: (accountId: string) => repo().touchLogin(accountId),
  recordLoginEvent: (
    input: Parameters<ReturnType<typeof createTeamRepository>["recordLoginEvent"]>[0],
  ) => repo().recordLoginEvent(input),
};

export type AttendanceGate = {
  kind:
    | "ok"
    | "change_pin"
    | "check_in"
    | "missed_checkout"
    | "not_team";
  displayName?: string;
  session?: AttendanceSession | null;
  missedSession?: AttendanceSession | null;
  team?: TeamRelationship | null;
};

export const AttendanceService = {
  workDate: () => workDateInTimezone(),

  async getTodaySession(personId: string) {
    return repo().getSessionForDate(personId, workDateInTimezone());
  },

  listForDate: (workDate: string) => repo().listSessionsForDate(workDate),

  listWeek: async (anchorDate?: string) => {
    const date = anchorDate ?? workDateInTimezone();
    const d = new Date(`${date}T12:00:00+05:30`);
    const day = d.getUTCDay(); // rough; use Kolkata via formatting
    // Build Mon–Sun around anchor using local parts from date string
    const [y, m, dd] = date.split("-").map(Number);
    const base = new Date(Date.UTC(y!, m! - 1, dd!));
    const isoDay = base.getUTCDay() || 7; // 1 Mon … 7 Sun
    const monday = new Date(base);
    monday.setUTCDate(base.getUTCDate() - (isoDay - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = (x: Date) => x.toISOString().slice(0, 10);
    void day;
    return repo().listSessionsInRange(fmt(monday), fmt(sunday));
  },

  async gateForAccount(accountId: string): Promise<AttendanceGate> {
    const account = await repo().getAccountById(accountId);
    if (!account) return { kind: "not_team" };
    if (account.mustChangeCredential) {
      return { kind: "change_pin", displayName: account.username };
    }
    const teamList = await repo().listTeam(true);
    const team = teamList.find((t) => t.personId === account.personId) ?? null;
    if (!team) return { kind: "not_team" };

    const today = workDateInTimezone();
    await repo().markMissedCheckouts(today);

    const missed = await repo().listSessionsInRange("2000-01-01", today);
    const openMissed = missed.find(
      (s) =>
        s.personId === account.personId &&
        s.workDate < today &&
        s.status === "MISSED_CHECKOUT",
    );
    if (openMissed) {
      return {
        kind: "missed_checkout",
        displayName: team.displayName,
        missedSession: openMissed,
        team,
      };
    }

    if (!team.attendanceRequired) {
      return { kind: "ok", displayName: team.displayName, team };
    }

    const session = await repo().getSessionForDate(account.personId, today);
    if (!session || !session.checkInAt) {
      return { kind: "check_in", displayName: team.displayName, team, session };
    }
    return { kind: "ok", displayName: team.displayName, team, session };
  },

  async checkIn(input: {
    personId: string;
    teamRelationshipId: string;
    locationId: string | null;
    method: AttendanceMethod;
    imageBase64?: string | null;
    mimeType?: string;
    deviceMeta?: Record<string, unknown>;
  }) {
    const workDate = workDateInTimezone();
    const { session, created } = await repo().ensureCheckIn({
      personId: input.personId,
      teamRelationshipId: input.teamRelationshipId,
      workDate,
      locationId: input.locationId,
      method: input.method,
    });

    if (created && input.imageBase64) {
      const content = Buffer.from(input.imageBase64, "base64");
      const evidenceId = await repo().saveEvidence({
        sessionId: session.id,
        evidenceType: "CHECK_IN",
        filename: "check-in.jpg",
        mimeType: input.mimeType || "image/jpeg",
        content,
        deviceMeta: input.deviceMeta,
      });
      await repo().attachEvidence(session.id, "check_in", evidenceId);
      return repo().getSessionForDate(input.personId, workDate);
    }
    return session;
  },

  async checkOut(input: {
    sessionId: string;
    method: AttendanceMethod;
    imageBase64?: string | null;
    mimeType?: string;
    deviceMeta?: Record<string, unknown>;
  }) {
    const session = await repo().checkOut({
      sessionId: input.sessionId,
      method: input.method,
    });
    if (!session) throw new Error("No active attendance session to check out");
    if (input.imageBase64) {
      const content = Buffer.from(input.imageBase64, "base64");
      const evidenceId = await repo().saveEvidence({
        sessionId: session.id,
        evidenceType: "CHECK_OUT",
        filename: "check-out.jpg",
        mimeType: input.mimeType || "image/jpeg",
        content,
        deviceMeta: input.deviceMeta,
      });
      await repo().attachEvidence(session.id, "check_out", evidenceId);
    }
    return session;
  },

  correctSession: (
    input: Parameters<ReturnType<typeof createTeamRepository>["correctSession"]>[0],
  ) => repo().correctSession(input),

  getEvidence: (id: string) => repo().getEvidenceContent(id),

  listAdjustments: (sessionId: string) => repo().listAdjustments(sessionId),
};
