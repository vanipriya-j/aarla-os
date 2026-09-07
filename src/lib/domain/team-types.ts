/**
 * Team + Attendance + Internal Access — domain types.
 * Person remains the CRM `people` record; team is a relationship on top.
 */

export type TeamRelationshipType =
  | "TEAM_MEMBER"
  | "COLLABORATOR"
  | "INTERN"
  | "FOUNDER"
  | "CONTRACTOR";

export type TeamFunction =
  | "Operations"
  | "Creative"
  | "Admin"
  | "Founder"
  | "Other";

export type WorkLocationType =
  | "office"
  | "studio"
  | "warehouse"
  | "franchise"
  | "partner"
  | "other";

export type InternalAccountStatus = "active" | "disabled";

export type AccessRoleCode =
  | "FOUNDER_ADMIN"
  | "OPERATIONS"
  | "CREATIVE"
  | "ADMIN"
  | "COLLABORATOR";

export type AttendanceSessionStatus =
  | "PRESENT"
  | "CHECKED_OUT"
  | "MISSED_CHECKOUT"
  | "MANUAL_CORRECTION"
  | "ABSENT"
  | "ATTENDANCE_NOT_REQUIRED";

export type AttendanceBoardStatus =
  | "NOT_YET_IN"
  | AttendanceSessionStatus;

export type AttendanceMethod = "camera" | "manual_admin" | "manual_self";

export type AttendanceEvidenceType = "CHECK_IN" | "CHECK_OUT";

export type WorkLocation = {
  id: string;
  code: string;
  name: string;
  locationType: WorkLocationType;
  timezone: string;
  active: boolean;
};

/** Office onboarding / personal details — not CRM People fields. */
export type TeamIdDocumentType =
  | ""
  | "aadhaar"
  | "pan"
  | "driving_licence"
  | "passport"
  | "voter_id"
  | "other";

export type TeamGender =
  | ""
  | "female"
  | "male"
  | "non_binary"
  | "prefer_not_to_say"
  | "other";

export type TeamPersonalProfile = {
  legalName: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  gender: TeamGender;
  bloodGroup: string;
  personalEmail: string;
  alternatePhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  idDocumentType: TeamIdDocumentType;
  idDocumentNumber: string;
  startDate: string | null;
  notes: string;
};

export type TeamRelationship = {
  id: string;
  personId: string;
  personCode: string;
  displayName: string;
  phone: string;
  imageUrl: string | null;
  relationshipType: TeamRelationshipType;
  roleTitle: string;
  teamFunction: TeamFunction;
  defaultLocationId: string | null;
  defaultLocationName: string | null;
  attendanceRequired: boolean;
  expectedStartTime: string | null; // HH:MM
  expectedEndTime: string | null;
  expectedDays: number[];
  active: boolean;
  username: string | null;
  accountStatus: InternalAccountStatus | null;
  accessRoleCodes: AccessRoleCode[];
  personal: TeamPersonalProfile | null;
};

export type InternalAccount = {
  id: string;
  personId: string;
  username: string;
  mustChangeCredential: boolean;
  status: InternalAccountStatus;
  lastLoginAt: string | null;
  accessRoleCodes: AccessRoleCode[];
};

export type AccessPermission = {
  code: string;
  label: string;
  description: string;
};

export type AccessRole = {
  id: string;
  code: AccessRoleCode;
  label: string;
  description: string;
  permissionCodes: string[];
};

export type AttendanceSession = {
  id: string;
  personId: string;
  personCode: string;
  displayName: string;
  teamRelationshipId: string;
  workDate: string; // YYYY-MM-DD Asia/Kolkata
  locationId: string | null;
  locationName: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceSessionStatus;
  checkInMethod: AttendanceMethod | null;
  checkOutMethod: AttendanceMethod | null;
  checkInEvidenceId: string | null;
  checkOutEvidenceId: string | null;
  manualCorrection: boolean;
  expectedStartTime: string | null;
  expectedEndTime: string | null;
  teamFunction: TeamFunction;
};

export type AttendanceAdjustment = {
  id: string;
  attendanceSessionId: string;
  changedByUsername: string;
  reason: string;
  originalValues: Record<string, unknown>;
  correctedValues: Record<string, unknown>;
  createdAt: string;
};

export type TeamOverviewMetrics = {
  activeMembers: number;
  checkedIn: number;
  notCheckedIn: number;
  missedCheckout: number;
  exceptions: number;
};

export type TeamMemberCard = {
  team: TeamRelationship;
  today: AttendanceBoardStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  expectedLabel: string | null;
};

/** Asia/Kolkata calendar date YYYY-MM-DD */
export function workDateInTimezone(
  when: Date = new Date(),
  timeZone = "Asia/Kolkata",
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

export function formatAttendanceClock(
  iso: string | null,
  timeZone = "Asia/Kolkata",
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function expectedWindowLabel(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  };
  if (start && end) return `Expected ${fmt(start)}–${fmt(end)}`;
  if (start) return `Expected from ${fmt(start)}`;
  return `Expected until ${fmt(end!)}`;
}

export function boardStatusForMember(
  attendanceRequired: boolean,
  session: Pick<AttendanceSession, "status" | "checkInAt" | "checkOutAt"> | null,
): AttendanceBoardStatus {
  if (!attendanceRequired) return "ATTENDANCE_NOT_REQUIRED";
  if (!session) return "NOT_YET_IN";
  return session.status;
}
