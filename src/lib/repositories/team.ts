import type {
  AccessRole,
  AccessRoleCode,
  AttendanceAdjustment,
  AttendanceBoardStatus,
  AttendanceMethod,
  AttendanceSession,
  AttendanceSessionStatus,
  InternalAccount,
  InternalAccountStatus,
  TeamFunction,
  TeamMemberCard,
  TeamOverviewMetrics,
  TeamRelationship,
  TeamRelationshipType,
  WorkLocation,
  WorkLocationType,
} from "@/lib/domain/team-types";

export type CreateTeamMemberInput = {
  /** Existing person code — if set, reuse Person (no duplicate). */
  existingPersonCode?: string | null;
  displayName: string;
  phone?: string;
  imageUrl?: string | null;
  relationshipType: TeamRelationshipType;
  roleTitle: string;
  teamFunction: TeamFunction;
  defaultLocationId: string | null;
  attendanceRequired: boolean;
  expectedStartTime?: string | null;
  expectedEndTime?: string | null;
  expectedDays?: number[];
  username: string;
  temporaryPin: string;
  accessRoleCodes: AccessRoleCode[];
};

export type TeamRepository = {
  listWorkLocations(activeOnly?: boolean): Promise<WorkLocation[]>;
  getWorkLocation(id: string): Promise<WorkLocation | null>;
  upsertWorkLocation(input: {
    id?: string;
    code: string;
    name: string;
    locationType: WorkLocationType;
    timezone?: string;
    active?: boolean;
  }): Promise<WorkLocation>;

  searchPeople(query: string, limit?: number): Promise<
    Array<{
      code: string;
      name: string;
      email: string;
      phone: string;
      roles: string[];
    }>
  >;

  listTeam(activeOnly?: boolean): Promise<TeamRelationship[]>;
  getTeamMember(teamRelationshipId: string): Promise<TeamRelationship | null>;
  createTeamMember(input: CreateTeamMemberInput): Promise<TeamRelationship>;
  updateTeamMember(
    teamRelationshipId: string,
    patch: Partial<{
      roleTitle: string;
      teamFunction: TeamFunction;
      relationshipType: TeamRelationshipType;
      defaultLocationId: string | null;
      attendanceRequired: boolean;
      expectedStartTime: string | null;
      expectedEndTime: string | null;
      expectedDays: number[];
      active: boolean;
    }>,
  ): Promise<TeamRelationship | null>;

  listAccessRoles(): Promise<AccessRole[]>;
  getAccountByUsername(username: string): Promise<
    | (InternalAccount & {
        credentialHash: string;
        displayName: string;
        teamRelationshipId: string | null;
        attendanceRequired: boolean;
        defaultLocationId: string | null;
      })
    | null
  >;
  getAccountById(accountId: string): Promise<InternalAccount | null>;
  setAccountStatus(
    accountId: string,
    status: InternalAccountStatus,
  ): Promise<boolean>;
  changeCredential(
    accountId: string,
    newHash: string,
    clearMustChange: boolean,
  ): Promise<boolean>;
  touchLogin(accountId: string): Promise<void>;
  setAccountRoles(
    accountId: string,
    roleCodes: AccessRoleCode[],
  ): Promise<void>;

  getSessionForDate(
    personId: string,
    workDate: string,
  ): Promise<AttendanceSession | null>;
  listSessionsForDate(workDate: string): Promise<AttendanceSession[]>;
  listSessionsInRange(
    fromDate: string,
    toDate: string,
  ): Promise<AttendanceSession[]>;
  ensureCheckIn(input: {
    personId: string;
    teamRelationshipId: string;
    workDate: string;
    locationId: string | null;
    method: AttendanceMethod;
    checkInAt?: Date;
  }): Promise<{ session: AttendanceSession; created: boolean }>;
  checkOut(input: {
    sessionId: string;
    method: AttendanceMethod;
    checkOutAt?: Date;
  }): Promise<AttendanceSession | null>;
  saveEvidence(input: {
    sessionId: string;
    evidenceType: "CHECK_IN" | "CHECK_OUT";
    filename: string;
    mimeType: string;
    content: Buffer;
    deviceMeta?: Record<string, unknown>;
  }): Promise<string>;
  attachEvidence(
    sessionId: string,
    side: "check_in" | "check_out",
    evidenceId: string,
  ): Promise<void>;
  getEvidenceContent(
    evidenceId: string,
  ): Promise<{ mimeType: string; content: Buffer; filename: string } | null>;
  correctSession(input: {
    sessionId: string;
    changedByUsername: string;
    changedByAccountId?: string | null;
    reason: string;
    checkOutAt?: string | null;
    checkInAt?: string | null;
    status?: AttendanceSessionStatus;
  }): Promise<AttendanceSession | null>;
  listAdjustments(sessionId: string): Promise<AttendanceAdjustment[]>;
  markMissedCheckouts(beforeWorkDate: string): Promise<number>;

  teamOverview(workDate: string): Promise<{
    metrics: TeamOverviewMetrics;
    cards: TeamMemberCard[];
  }>;

  recordLoginEvent(input: {
    username: string;
    outcome: "success" | "failure" | "disabled";
    role?: string | null;
    accountId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void>;
};

export type { AttendanceBoardStatus };
