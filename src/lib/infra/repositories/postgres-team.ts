import "server-only";

import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/infra/db/pool";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import {
  hashCredential,
  isValidPinOrPassword,
  isValidUsername,
  normalizeUsername,
} from "@/lib/auth/credential-hash";
import type {
  AccessRole,
  AccessRoleCode,
  AttendanceAdjustment,
  AttendanceMethod,
  AttendanceSession,
  AttendanceSessionStatus,
  InternalAccount,
  InternalAccountStatus,
  TeamFunction,
  TeamGender,
  TeamIdDocumentType,
  TeamMemberCard,
  TeamOverviewMetrics,
  TeamPersonalProfile,
  TeamRelationship,
  TeamRelationshipType,
  WorkLocation,
  WorkLocationType,
} from "@/lib/domain/team-types";
import {
  boardStatusForMember,
  expectedWindowLabel,
} from "@/lib/domain/team-types";
import type { CreateTeamMemberInput, TeamRepository } from "@/lib/repositories/team";

type Q = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function poolQ(): Q {
  return async (text, params) => {
    const r = await getPool().query(text, params);
    return r.rows as never;
  };
}

function timeStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.slice(0, 5);
  return String(v).slice(0, 5);
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
}

function dateOnly(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function emptyPersonal(): TeamPersonalProfile {
  return {
    legalName: "",
    dateOfBirth: null,
    gender: "",
    bloodGroup: "",
    personalEmail: "",
    alternatePhone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    idDocumentType: "",
    idDocumentNumber: "",
    startDate: null,
    notes: "",
  };
}

function mapPersonal(r: {
  legal_name: string;
  date_of_birth: Date | string | null;
  gender: TeamGender;
  blood_group: string;
  personal_email: string;
  alternate_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  id_document_type: TeamIdDocumentType;
  id_document_number: string;
  start_date: Date | string | null;
  notes: string;
}): TeamPersonalProfile {
  return {
    legalName: r.legal_name ?? "",
    dateOfBirth: dateOnly(r.date_of_birth),
    gender: r.gender ?? "",
    bloodGroup: r.blood_group ?? "",
    personalEmail: r.personal_email ?? "",
    alternatePhone: r.alternate_phone ?? "",
    addressLine1: r.address_line1 ?? "",
    addressLine2: r.address_line2 ?? "",
    city: r.city ?? "",
    state: r.state ?? "",
    pincode: r.pincode ?? "",
    emergencyContactName: r.emergency_contact_name ?? "",
    emergencyContactPhone: r.emergency_contact_phone ?? "",
    emergencyContactRelation: r.emergency_contact_relation ?? "",
    idDocumentType: r.id_document_type ?? "",
    idDocumentNumber: r.id_document_number ?? "",
    startDate: dateOnly(r.start_date),
    notes: r.notes ?? "",
  };
}

async function loadPersonal(q: Q, personId: string): Promise<TeamPersonalProfile | null> {
  try {
    const rows = await q<Parameters<typeof mapPersonal>[0]>(
      `select legal_name, date_of_birth, gender, blood_group, personal_email,
              alternate_phone, address_line1, address_line2, city, state, pincode,
              emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
              id_document_type, id_document_number, start_date, notes
       from team_personal_profiles
       where organization_id = $1 and person_id = $2`,
      [ORG_ID, personId],
    );
    return rows[0] ? mapPersonal(rows[0]) : null;
  } catch {
    return null;
  }
}

async function upsertPersonal(
  q: Q,
  input: {
    personId: string;
    teamRelationshipId: string;
    personal: Partial<TeamPersonalProfile> | null | undefined;
    displayName: string;
  },
) {
  const p = { ...emptyPersonal(), ...(input.personal ?? {}) };
  if (!p.legalName.trim()) p.legalName = input.displayName.trim();
  await q(
    `insert into team_personal_profiles (
       organization_id, person_id, team_relationship_id,
       legal_name, date_of_birth, gender, blood_group,
       personal_email, alternate_phone,
       address_line1, address_line2, city, state, pincode,
       emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
       id_document_type, id_document_number, start_date, notes
     ) values (
       $1, $2, $3::uuid,
       $4, $5::date, $6, $7,
       $8, $9,
       $10, $11, $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20::date, $21
     )
     on conflict (organization_id, person_id) do update set
       team_relationship_id = excluded.team_relationship_id,
       legal_name = excluded.legal_name,
       date_of_birth = excluded.date_of_birth,
       gender = excluded.gender,
       blood_group = excluded.blood_group,
       personal_email = excluded.personal_email,
       alternate_phone = excluded.alternate_phone,
       address_line1 = excluded.address_line1,
       address_line2 = excluded.address_line2,
       city = excluded.city,
       state = excluded.state,
       pincode = excluded.pincode,
       emergency_contact_name = excluded.emergency_contact_name,
       emergency_contact_phone = excluded.emergency_contact_phone,
       emergency_contact_relation = excluded.emergency_contact_relation,
       id_document_type = excluded.id_document_type,
       id_document_number = excluded.id_document_number,
       start_date = excluded.start_date,
       notes = excluded.notes,
       updated_at = now()`,
    [
      ORG_ID,
      input.personId,
      input.teamRelationshipId,
      p.legalName.trim(),
      p.dateOfBirth || null,
      p.gender || "",
      p.bloodGroup.trim(),
      p.personalEmail.trim(),
      p.alternatePhone.trim(),
      p.addressLine1.trim(),
      p.addressLine2.trim(),
      p.city.trim(),
      p.state.trim(),
      p.pincode.trim(),
      p.emergencyContactName.trim(),
      p.emergencyContactPhone.trim(),
      p.emergencyContactRelation.trim(),
      p.idDocumentType || "",
      p.idDocumentNumber.trim(),
      p.startDate || null,
      p.notes.trim(),
    ],
  );
  if (p.city.trim()) {
    await q(
      `update people set city = case when city = '' then $3 else city end, updated_at = now()
       where id = $1 and organization_id = $2`,
      [input.personId, ORG_ID, p.city.trim()],
    );
  }
}

function mapLocation(r: {
  id: string;
  code: string;
  name: string;
  location_type: WorkLocationType;
  timezone: string;
  active: boolean;
}): WorkLocation {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    locationType: r.location_type,
    timezone: r.timezone,
    active: r.active,
  };
}

async function mapTeamRow(
  q: Q,
  r: {
    id: string;
    person_id: string;
    person_code: string;
    display_name: string;
    phone: string;
    image_url: string | null;
    relationship_type: TeamRelationshipType;
    role_title: string;
    team_function: TeamFunction;
    default_location_id: string | null;
    default_location_name: string | null;
    attendance_required: boolean;
    expected_start_time: unknown;
    expected_end_time: unknown;
    expected_days: number[] | null;
    active: boolean;
    username: string | null;
    account_status: InternalAccountStatus | null;
  },
): Promise<TeamRelationship> {
  const roles = await q<{ code: AccessRoleCode }>(
    `select ar.code
     from internal_accounts ia
     join internal_account_roles iar on iar.account_id = ia.id
     join access_roles ar on ar.id = iar.role_id
     where ia.person_id = $1 and ia.organization_id = $2`,
    [r.person_id, ORG_ID],
  );
  const personal = await loadPersonal(q, r.person_id);
  return {
    id: r.id,
    personId: r.person_id,
    personCode: r.person_code,
    displayName: r.display_name,
    phone: r.phone ?? "",
    imageUrl: r.image_url,
    relationshipType: r.relationship_type,
    roleTitle: r.role_title,
    teamFunction: r.team_function,
    defaultLocationId: r.default_location_id,
    defaultLocationName: r.default_location_name,
    attendanceRequired: r.attendance_required,
    expectedStartTime: timeStr(r.expected_start_time),
    expectedEndTime: timeStr(r.expected_end_time),
    expectedDays: r.expected_days ?? [1, 2, 3, 4, 5],
    active: r.active,
    username: r.username,
    accountStatus: r.account_status,
    accessRoleCodes: roles.map((x) => x.code),
    personal,
  };
}

const TEAM_SELECT = `
  tr.id, tr.person_id, p.code as person_code, p.name as display_name,
  p.phone, p.image_url, tr.relationship_type, tr.role_title, tr.team_function,
  tr.default_location_id, wl.name as default_location_name,
  tr.attendance_required, tr.expected_start_time, tr.expected_end_time,
  tr.expected_days, tr.active,
  ia.username, ia.status as account_status
`;

const TEAM_FROM = `
  from team_relationships tr
  join people p on p.id = tr.person_id
  left join work_locations wl on wl.id = tr.default_location_id
  left join internal_accounts ia on ia.person_id = tr.person_id
    and ia.organization_id = tr.organization_id
  where tr.organization_id = $1
`;

function mapSession(r: {
  id: string;
  person_id: string;
  person_code: string;
  display_name: string;
  team_relationship_id: string;
  work_date: string | Date;
  location_id: string | null;
  location_name: string | null;
  check_in_at: Date | string | null;
  check_out_at: Date | string | null;
  status: AttendanceSessionStatus;
  check_in_method: AttendanceMethod | null;
  check_out_method: AttendanceMethod | null;
  check_in_evidence_id: string | null;
  check_out_evidence_id: string | null;
  manual_correction: boolean;
  expected_start_time: unknown;
  expected_end_time: unknown;
  team_function: TeamFunction;
}): AttendanceSession {
  const workDate =
    typeof r.work_date === "string"
      ? r.work_date.slice(0, 10)
      : r.work_date.toISOString().slice(0, 10);
  return {
    id: r.id,
    personId: r.person_id,
    personCode: r.person_code,
    displayName: r.display_name,
    teamRelationshipId: r.team_relationship_id,
    workDate,
    locationId: r.location_id,
    locationName: r.location_name,
    checkInAt: iso(r.check_in_at),
    checkOutAt: iso(r.check_out_at),
    status: r.status,
    checkInMethod: r.check_in_method,
    checkOutMethod: r.check_out_method,
    checkInEvidenceId: r.check_in_evidence_id,
    checkOutEvidenceId: r.check_out_evidence_id,
    manualCorrection: r.manual_correction,
    expectedStartTime: timeStr(r.expected_start_time),
    expectedEndTime: timeStr(r.expected_end_time),
    teamFunction: r.team_function,
  };
}

const SESSION_SELECT = `
  s.id, s.person_id, p.code as person_code, p.name as display_name,
  s.team_relationship_id, s.work_date, s.location_id, wl.name as location_name,
  s.check_in_at, s.check_out_at, s.status,
  s.check_in_method, s.check_out_method,
  s.check_in_evidence_id, s.check_out_evidence_id, s.manual_correction,
  tr.expected_start_time, tr.expected_end_time, tr.team_function
`;

export function createTeamRepository(q: Q = poolQ()): TeamRepository {
  return {
    async listWorkLocations(activeOnly = true) {
      const rows = await q<Parameters<typeof mapLocation>[0]>(
        `select id, code, name, location_type, timezone, active
         from work_locations
         where organization_id = $1
           ${activeOnly ? "and active = true" : ""}
         order by name`,
        [ORG_ID],
      );
      return rows.map(mapLocation);
    },

    async getWorkLocation(id) {
      const rows = await q<Parameters<typeof mapLocation>[0]>(
        `select id, code, name, location_type, timezone, active
         from work_locations where organization_id = $1 and id = $2::uuid`,
        [ORG_ID, id],
      );
      return rows[0] ? mapLocation(rows[0]) : null;
    },

    async upsertWorkLocation(input) {
      const id = input.id ?? randomUUID();
      const rows = await q<Parameters<typeof mapLocation>[0]>(
        `insert into work_locations (
           id, organization_id, code, name, location_type, timezone, active
         ) values ($1::uuid, $2, $3, $4, $5, $6, $7)
         on conflict (organization_id, code) do update set
           name = excluded.name,
           location_type = excluded.location_type,
           timezone = excluded.timezone,
           active = excluded.active,
           updated_at = now()
         returning id, code, name, location_type, timezone, active`,
        [
          id,
          ORG_ID,
          input.code,
          input.name,
          input.locationType,
          input.timezone ?? "Asia/Kolkata",
          input.active ?? true,
        ],
      );
      return mapLocation(rows[0]!);
    },

    async searchPeople(query, limit = 20) {
      const qstr = query.trim();
      if (!qstr) return [];
      const rows = await q<{
        code: string;
        name: string;
        email: string;
        phone: string;
        roles: string[];
      }>(
        `select code, name, coalesce(email, '') as email, phone, roles
         from people
         where organization_id = $1
           and (
             name ilike $2 or phone ilike $2 or coalesce(email, '') ilike $2
             or code ilike $2
           )
         order by name
         limit $3`,
        [ORG_ID, `%${qstr}%`, limit],
      );
      return rows;
    },

    async listTeam(activeOnly = true) {
      const rows = await q<Parameters<typeof mapTeamRow>[1]>(
        `select ${TEAM_SELECT}
         ${TEAM_FROM}
           ${activeOnly ? "and tr.active = true" : ""}
         order by p.name`,
        [ORG_ID],
      );
      return Promise.all(rows.map((r) => mapTeamRow(q, r)));
    },

    async getTeamMember(teamRelationshipId) {
      const rows = await q<Parameters<typeof mapTeamRow>[1]>(
        `select ${TEAM_SELECT}
         ${TEAM_FROM}
           and tr.id = $2::uuid`,
        [ORG_ID, teamRelationshipId],
      );
      return rows[0] ? mapTeamRow(q, rows[0]) : null;
    },

    async createTeamMember(input: CreateTeamMemberInput) {
      if (!isValidUsername(input.username)) {
        throw new Error("Username must be 2–32 chars: letters, numbers, . _ -");
      }
      if (!isValidPinOrPassword(input.temporaryPin)) {
        throw new Error("Temporary PIN/password must be at least 4 characters");
      }
      const username = normalizeUsername(input.username);
      const existingUser = await q<{ id: string }>(
        `select id from internal_accounts
         where organization_id = $1 and lower(username) = $2`,
        [ORG_ID, username],
      );
      if (existingUser.length) throw new Error("Username is already taken");

      let personId: string;
      let personCode: string;

      if (input.existingPersonCode?.trim()) {
        const found = await q<{ id: string; code: string }>(
          `select id, code from people
           where organization_id = $1 and code = $2`,
          [ORG_ID, input.existingPersonCode.trim()],
        );
        if (!found[0]) throw new Error("Person not found");
        personId = found[0].id;
        personCode = found[0].code;
        if (input.phone?.trim() || input.imageUrl) {
          await q(
            `update people set
               phone = case when $3 <> '' then $3 else phone end,
               image_url = coalesce($4, image_url),
               name = case when $5 <> '' then $5 else name end,
               updated_at = now()
             where id = $1 and organization_id = $2`,
            [
              personId,
              ORG_ID,
              input.phone?.trim() ?? "",
              input.imageUrl ?? null,
              input.displayName.trim(),
            ],
          );
        }
      } else {
        personCode = `team-${username}`;
        personId = stableId(personCode);
        const clash = await q<{ id: string }>(
          `select id from people where organization_id = $1 and code = $2`,
          [ORG_ID, personCode],
        );
        if (clash.length) {
          personCode = `team-${username}-${randomUUID().slice(0, 8)}`;
          personId = stableId(personCode);
        }
        await q(
          `insert into people (
             id, organization_id, code, name, email, phone, city, roles,
             interests, purchased_orders, owned_products, registered_products,
             timeline, person_created_on, image_url
           ) values (
             $1, $2, $3, $4, '', $5, '', '{}', '{}', '{}', '{}', '{}',
             '[]'::jsonb, current_date, $6
           )`,
          [
            personId,
            ORG_ID,
            personCode,
            input.displayName.trim(),
            input.phone?.trim() ?? "",
            input.imageUrl ?? null,
          ],
        );
      }

      const activeTeam = await q<{ id: string }>(
        `select id from team_relationships
         where organization_id = $1 and person_id = $2 and active = true`,
        [ORG_ID, personId],
      );
      if (activeTeam.length) {
        throw new Error("This person already has an active team relationship");
      }

      const teamId = randomUUID();
      await q(
        `insert into team_relationships (
           id, organization_id, person_id, relationship_type, role_title,
           team_function, default_location_id, attendance_required,
           expected_start_time, expected_end_time, expected_days, active
         ) values (
           $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8,
           $9::time, $10::time, $11::int[], true
         )`,
        [
          teamId,
          ORG_ID,
          personId,
          input.relationshipType,
          input.roleTitle.trim(),
          input.teamFunction,
          input.defaultLocationId,
          input.attendanceRequired,
          input.expectedStartTime || null,
          input.expectedEndTime || null,
          input.expectedDays ?? [1, 2, 3, 4, 5],
        ],
      );

      const accountId = randomUUID();
      await q(
        `insert into internal_accounts (
           id, organization_id, person_id, username, credential_hash,
           must_change_credential, status
         ) values ($1::uuid, $2, $3, $4, $5, true, 'active')`,
        [accountId, ORG_ID, personId, username, hashCredential(input.temporaryPin)],
      );

      await this.setAccountRoles(accountId, input.accessRoleCodes);

      await upsertPersonal(q, {
        personId,
        teamRelationshipId: teamId,
        personal: input.personal,
        displayName: input.displayName,
      });

      const member = await this.getTeamMember(teamId);
      if (!member) throw new Error("Failed to load created team member");
      return member;
    },

    async updateTeamMember(teamRelationshipId, patch) {
      await q(
        `update team_relationships set
           role_title = coalesce($3, role_title),
           team_function = coalesce($4, team_function),
           relationship_type = coalesce($5, relationship_type),
           default_location_id = coalesce($6::uuid, default_location_id),
           attendance_required = coalesce($7, attendance_required),
           expected_start_time = coalesce($8::time, expected_start_time),
           expected_end_time = coalesce($9::time, expected_end_time),
           expected_days = coalesce($10::int[], expected_days),
           active = coalesce($11, active),
           updated_at = now()
         where organization_id = $1 and id = $2::uuid`,
        [
          ORG_ID,
          teamRelationshipId,
          patch.roleTitle ?? null,
          patch.teamFunction ?? null,
          patch.relationshipType ?? null,
          patch.defaultLocationId === undefined ? null : patch.defaultLocationId,
          patch.attendanceRequired ?? null,
          patch.expectedStartTime === undefined ? null : patch.expectedStartTime,
          patch.expectedEndTime === undefined ? null : patch.expectedEndTime,
          patch.expectedDays ?? null,
          patch.active ?? null,
        ],
      );
      // Allow clearing location when explicitly null — handle separately
      if (patch.defaultLocationId === null) {
        await q(
          `update team_relationships set default_location_id = null
           where organization_id = $1 and id = $2::uuid`,
          [ORG_ID, teamRelationshipId],
        );
      }
      return this.getTeamMember(teamRelationshipId);
    },

    async listAccessRoles() {
      const roles = await q<{
        id: string;
        code: AccessRoleCode;
        label: string;
        description: string;
      }>(
        `select id, code, label, description from access_roles
         where organization_id = $1 order by label`,
        [ORG_ID],
      );
      const out: AccessRole[] = [];
      for (const role of roles) {
        const perms = await q<{ code: string }>(
          `select ap.code from access_role_permissions arp
           join access_permissions ap on ap.id = arp.permission_id
           where arp.role_id = $1::uuid order by ap.code`,
          [role.id],
        );
        out.push({
          id: role.id,
          code: role.code,
          label: role.label,
          description: role.description,
          permissionCodes: perms.map((p) => p.code),
        });
      }
      return out;
    },

    async getAccountByUsername(username) {
      const u = normalizeUsername(username);
      const rows = await q<{
        id: string;
        person_id: string;
        username: string;
        credential_hash: string;
        must_change_credential: boolean;
        status: InternalAccountStatus;
        last_login_at: Date | null;
        display_name: string;
        team_relationship_id: string | null;
        attendance_required: boolean;
        default_location_id: string | null;
      }>(
        `select ia.id, ia.person_id, ia.username, ia.credential_hash,
                ia.must_change_credential, ia.status, ia.last_login_at,
                p.name as display_name,
                tr.id as team_relationship_id,
                coalesce(tr.attendance_required, false) as attendance_required,
                tr.default_location_id
         from internal_accounts ia
         join people p on p.id = ia.person_id
         left join team_relationships tr
           on tr.person_id = ia.person_id and tr.organization_id = ia.organization_id
           and tr.active = true
         where ia.organization_id = $1 and lower(ia.username) = $2`,
        [ORG_ID, u],
      );
      const r = rows[0];
      if (!r) return null;
      const roles = await q<{ code: AccessRoleCode }>(
        `select ar.code from internal_account_roles iar
         join access_roles ar on ar.id = iar.role_id
         where iar.account_id = $1::uuid`,
        [r.id],
      );
      return {
        id: r.id,
        personId: r.person_id,
        username: r.username,
        mustChangeCredential: r.must_change_credential,
        status: r.status,
        lastLoginAt: iso(r.last_login_at),
        accessRoleCodes: roles.map((x) => x.code),
        credentialHash: r.credential_hash,
        displayName: r.display_name,
        teamRelationshipId: r.team_relationship_id,
        attendanceRequired: r.attendance_required,
        defaultLocationId: r.default_location_id,
      };
    },

    async getAccountById(accountId) {
      const rows = await q<{
        id: string;
        person_id: string;
        username: string;
        must_change_credential: boolean;
        status: InternalAccountStatus;
        last_login_at: Date | null;
      }>(
        `select id, person_id, username, must_change_credential, status, last_login_at
         from internal_accounts where organization_id = $1 and id = $2::uuid`,
        [ORG_ID, accountId],
      );
      const r = rows[0];
      if (!r) return null;
      const roles = await q<{ code: AccessRoleCode }>(
        `select ar.code from internal_account_roles iar
         join access_roles ar on ar.id = iar.role_id
         where iar.account_id = $1::uuid`,
        [r.id],
      );
      return {
        id: r.id,
        personId: r.person_id,
        username: r.username,
        mustChangeCredential: r.must_change_credential,
        status: r.status,
        lastLoginAt: iso(r.last_login_at),
        accessRoleCodes: roles.map((x) => x.code),
      };
    },

    async setAccountStatus(accountId, status) {
      const rows = await q<{ id: string }>(
        `update internal_accounts set status = $3, updated_at = now()
         where organization_id = $1 and id = $2::uuid returning id`,
        [ORG_ID, accountId, status],
      );
      return rows.length > 0;
    },

    async changeCredential(accountId, newHash, clearMustChange) {
      const rows = await q<{ id: string }>(
        `update internal_accounts set
           credential_hash = $3,
           must_change_credential = case when $4 then false else must_change_credential end,
           updated_at = now()
         where organization_id = $1 and id = $2::uuid
         returning id`,
        [ORG_ID, accountId, newHash, clearMustChange],
      );
      return rows.length > 0;
    },

    async touchLogin(accountId) {
      await q(
        `update internal_accounts set last_login_at = now(), updated_at = now()
         where id = $1::uuid`,
        [accountId],
      );
    },

    async setAccountRoles(accountId, roleCodes) {
      await q(`delete from internal_account_roles where account_id = $1::uuid`, [
        accountId,
      ]);
      for (const code of roleCodes) {
        const roles = await q<{ id: string }>(
          `select id from access_roles where organization_id = $1 and code = $2`,
          [ORG_ID, code],
        );
        if (!roles[0]) continue;
        await q(
          `insert into internal_account_roles (account_id, role_id)
           values ($1::uuid, $2::uuid) on conflict do nothing`,
          [accountId, roles[0].id],
        );
      }
    },

    async getSessionForDate(personId, workDate) {
      const rows = await q<Parameters<typeof mapSession>[0]>(
        `select ${SESSION_SELECT}
         from attendance_sessions s
         join people p on p.id = s.person_id
         join team_relationships tr on tr.id = s.team_relationship_id
         left join work_locations wl on wl.id = s.location_id
         where s.organization_id = $1 and s.person_id = $2 and s.work_date = $3::date`,
        [ORG_ID, personId, workDate],
      );
      return rows[0] ? mapSession(rows[0]) : null;
    },

    async listSessionsForDate(workDate) {
      const rows = await q<Parameters<typeof mapSession>[0]>(
        `select ${SESSION_SELECT}
         from attendance_sessions s
         join people p on p.id = s.person_id
         join team_relationships tr on tr.id = s.team_relationship_id
         left join work_locations wl on wl.id = s.location_id
         where s.organization_id = $1 and s.work_date = $2::date
         order by p.name`,
        [ORG_ID, workDate],
      );
      return rows.map(mapSession);
    },

    async listSessionsInRange(fromDate, toDate) {
      const rows = await q<Parameters<typeof mapSession>[0]>(
        `select ${SESSION_SELECT}
         from attendance_sessions s
         join people p on p.id = s.person_id
         join team_relationships tr on tr.id = s.team_relationship_id
         left join work_locations wl on wl.id = s.location_id
         where s.organization_id = $1
           and s.work_date >= $2::date and s.work_date <= $3::date
         order by s.work_date desc, p.name`,
        [ORG_ID, fromDate, toDate],
      );
      return rows.map(mapSession);
    },

    async ensureCheckIn(input) {
      const existing = await this.getSessionForDate(input.personId, input.workDate);
      if (existing) {
        return { session: existing, created: false };
      }
      const id = randomUUID();
      const checkInAt = input.checkInAt ?? new Date();
      try {
        await q(
          `insert into attendance_sessions (
             id, organization_id, person_id, team_relationship_id, work_date,
             location_id, check_in_at, status, check_in_method
           ) values (
             $1::uuid, $2, $3, $4::uuid, $5::date, $6::uuid, $7, 'PRESENT', $8
           )`,
          [
            id,
            ORG_ID,
            input.personId,
            input.teamRelationshipId,
            input.workDate,
            input.locationId,
            checkInAt.toISOString(),
            input.method,
          ],
        );
      } catch (err) {
        // Unique race — return existing
        const again = await this.getSessionForDate(input.personId, input.workDate);
        if (again) return { session: again, created: false };
        throw err;
      }
      const session = await this.getSessionForDate(input.personId, input.workDate);
      if (!session) throw new Error("Check-in failed");
      return { session, created: true };
    },

    async checkOut(input) {
      const checkOutAt = input.checkOutAt ?? new Date();
      const rows = await q<{ id: string }>(
        `update attendance_sessions set
           check_out_at = $3,
           check_out_method = $4,
           status = 'CHECKED_OUT',
           updated_at = now()
         where organization_id = $1 and id = $2::uuid
           and check_in_at is not null
           and check_out_at is null
         returning id`,
        [ORG_ID, input.sessionId, checkOutAt.toISOString(), input.method],
      );
      if (!rows[0]) return null;
      const full = await q<Parameters<typeof mapSession>[0]>(
        `select ${SESSION_SELECT}
         from attendance_sessions s
         join people p on p.id = s.person_id
         join team_relationships tr on tr.id = s.team_relationship_id
         left join work_locations wl on wl.id = s.location_id
         where s.id = $1::uuid`,
        [input.sessionId],
      );
      return full[0] ? mapSession(full[0]) : null;
    },

    async saveEvidence(input) {
      const id = randomUUID();
      await q(
        `insert into attendance_evidence (
           id, organization_id, attendance_session_id, evidence_type,
           filename, mime_type, byte_size, content, device_meta
         ) values (
           $1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb
         )`,
        [
          id,
          ORG_ID,
          input.sessionId,
          input.evidenceType,
          input.filename,
          input.mimeType,
          input.content.length,
          input.content,
          JSON.stringify(input.deviceMeta ?? {}),
        ],
      );
      return id;
    },

    async attachEvidence(sessionId, side, evidenceId) {
      if (side === "check_in") {
        await q(
          `update attendance_sessions set check_in_evidence_id = $2::uuid
           where id = $1::uuid and organization_id = $3`,
          [sessionId, evidenceId, ORG_ID],
        );
      } else {
        await q(
          `update attendance_sessions set check_out_evidence_id = $2::uuid
           where id = $1::uuid and organization_id = $3`,
          [sessionId, evidenceId, ORG_ID],
        );
      }
    },

    async getEvidenceContent(evidenceId) {
      const rows = await q<{
        mime_type: string;
        content: Buffer;
        filename: string;
      }>(
        `select mime_type, content, filename from attendance_evidence
         where id = $1::uuid and organization_id = $2`,
        [evidenceId, ORG_ID],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        mimeType: r.mime_type,
        content: Buffer.isBuffer(r.content) ? r.content : Buffer.from(r.content),
        filename: r.filename,
      };
    },

    async correctSession(input) {
      const currentRows = await q<{
        check_in_at: Date | null;
        check_out_at: Date | null;
        status: AttendanceSessionStatus;
      }>(
        `select check_in_at, check_out_at, status from attendance_sessions
         where id = $1::uuid and organization_id = $2`,
        [input.sessionId, ORG_ID],
      );
      const cur = currentRows[0];
      if (!cur) return null;
      const original = {
        checkInAt: iso(cur.check_in_at),
        checkOutAt: iso(cur.check_out_at),
        status: cur.status,
      };
      const corrected = {
        checkInAt: input.checkInAt ?? original.checkInAt,
        checkOutAt: input.checkOutAt ?? original.checkOutAt,
        status: input.status ?? "MANUAL_CORRECTION",
      };
      await q(
        `update attendance_sessions set
           check_in_at = coalesce($3::timestamptz, check_in_at),
           check_out_at = coalesce($4::timestamptz, check_out_at),
           status = $5,
           manual_correction = true,
           updated_at = now()
         where id = $1::uuid and organization_id = $2`,
        [
          input.sessionId,
          ORG_ID,
          input.checkInAt ?? null,
          input.checkOutAt ?? null,
          corrected.status,
        ],
      );
      await q(
        `insert into attendance_adjustments (
           organization_id, attendance_session_id, changed_by_username,
           changed_by_account_id, reason, original_values, corrected_values
         ) values ($1, $2::uuid, $3, $4::uuid, $5, $6::jsonb, $7::jsonb)`,
        [
          ORG_ID,
          input.sessionId,
          input.changedByUsername,
          input.changedByAccountId ?? null,
          input.reason,
          JSON.stringify(original),
          JSON.stringify(corrected),
        ],
      );
      const full = await q<Parameters<typeof mapSession>[0]>(
        `select ${SESSION_SELECT}
         from attendance_sessions s
         join people p on p.id = s.person_id
         join team_relationships tr on tr.id = s.team_relationship_id
         left join work_locations wl on wl.id = s.location_id
         where s.id = $1::uuid`,
        [input.sessionId],
      );
      return full[0] ? mapSession(full[0]) : null;
    },

    async listAdjustments(sessionId) {
      const rows = await q<{
        id: string;
        attendance_session_id: string;
        changed_by_username: string;
        reason: string;
        original_values: Record<string, unknown>;
        corrected_values: Record<string, unknown>;
        created_at: Date;
      }>(
        `select id, attendance_session_id, changed_by_username, reason,
                original_values, corrected_values, created_at
         from attendance_adjustments
         where attendance_session_id = $1::uuid and organization_id = $2
         order by created_at desc`,
        [sessionId, ORG_ID],
      );
      return rows.map(
        (r): AttendanceAdjustment => ({
          id: r.id,
          attendanceSessionId: r.attendance_session_id,
          changedByUsername: r.changed_by_username,
          reason: r.reason,
          originalValues: r.original_values,
          correctedValues: r.corrected_values,
          createdAt: r.created_at.toISOString(),
        }),
      );
    },

    async markMissedCheckouts(beforeWorkDate) {
      const rows = await q<{ id: string }>(
        `update attendance_sessions set
           status = 'MISSED_CHECKOUT', updated_at = now()
         where organization_id = $1
           and work_date < $2::date
           and check_in_at is not null
           and check_out_at is null
           and status = 'PRESENT'
         returning id`,
        [ORG_ID, beforeWorkDate],
      );
      return rows.length;
    },

    async teamOverview(workDate) {
      const team = await this.listTeam(true);
      const sessions = await this.listSessionsForDate(workDate);
      const byPerson = new Map(sessions.map((s) => [s.personId, s]));
      const cards: TeamMemberCard[] = team.map((t) => {
        const s = byPerson.get(t.personId) ?? null;
        return {
          team: t,
          today: boardStatusForMember(t.attendanceRequired, s),
          checkInAt: s?.checkInAt ?? null,
          checkOutAt: s?.checkOutAt ?? null,
          expectedLabel: expectedWindowLabel(
            t.expectedStartTime,
            t.expectedEndTime,
          ),
        };
      });
      const metrics: TeamOverviewMetrics = {
        activeMembers: team.length,
        checkedIn: cards.filter((c) => c.today === "PRESENT").length,
        notCheckedIn: cards.filter((c) => c.today === "NOT_YET_IN").length,
        missedCheckout: cards.filter((c) => c.today === "MISSED_CHECKOUT").length,
        exceptions: cards.filter((c) =>
          ["MISSED_CHECKOUT", "MANUAL_CORRECTION", "ABSENT"].includes(c.today),
        ).length,
      };
      return { metrics, cards };
    },

    async recordLoginEvent(input) {
      await q(
        `insert into auth_login_events (
           organization_id, username, outcome, role, account_id, ip, user_agent
         ) values ($1, $2, $3, $4, $5::uuid, $6, $7)`,
        [
          ORG_ID,
          input.username,
          input.outcome,
          input.role ?? null,
          input.accountId ?? null,
          input.ip ?? null,
          input.userAgent ?? null,
        ],
      );
    },
  };
}
