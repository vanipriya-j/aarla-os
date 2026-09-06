import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type { AttendanceStatus } from "@/lib/domain/attendance-types";
import type {
  AttendanceRecordRow,
  AttendanceRepository,
  AttendanceStaffRow,
  InsertAttendanceStaffInput,
  UpsertAttendanceRecordInput,
} from "@/lib/repositories/attendance";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapStaff(row: {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number | string;
  created_at: unknown;
  updated_at: unknown;
}): AttendanceStaffRow {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapRecord(row: {
  id: string;
  staff_id: string;
  work_date: unknown;
  status: string;
  notes: string;
  marked_by: string;
  marked_at: unknown;
  updated_at: unknown;
}): AttendanceRecordRow {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    workDate: isoDate(row.work_date),
    status: row.status as AttendanceStatus,
    notes: String(row.notes ?? ""),
    markedBy: String(row.marked_by),
    markedAt: iso(row.marked_at),
    updatedAt: iso(row.updated_at),
  };
}

export function createAttendanceRepository(): AttendanceRepository {
  const q: Q = poolQuery;

  return {
    async listStaff(activeOnly = true) {
      const rows = await q<{
        id: string;
        code: string;
        name: string;
        is_active: boolean;
        sort_order: number | string;
        created_at: unknown;
        updated_at: unknown;
      }>(
        `select id, code, name, is_active, sort_order, created_at, updated_at
         from attendance_staff
         where organization_id = $1
           and ($2::boolean = false or is_active = true)
         order by sort_order asc, name asc`,
        [ORG_ID, activeOnly],
      );
      return rows.map(mapStaff);
    },

    async insertStaff(input: InsertAttendanceStaffInput) {
      const rows = await q<{
        id: string;
        code: string;
        name: string;
        is_active: boolean;
        sort_order: number | string;
        created_at: unknown;
        updated_at: unknown;
      }>(
        `insert into attendance_staff
           (organization_id, code, name, sort_order)
         values ($1, $2, $3, $4)
         returning id, code, name, is_active, sort_order, created_at, updated_at`,
        [ORG_ID, input.code, input.name, input.sortOrder],
      );
      return mapStaff(rows[0]!);
    },

    async setStaffActive(staffId, isActive) {
      const rows = await q<{
        id: string;
        code: string;
        name: string;
        is_active: boolean;
        sort_order: number | string;
        created_at: unknown;
        updated_at: unknown;
      }>(
        `update attendance_staff
         set is_active = $3
         where organization_id = $1 and id = $2
         returning id, code, name, is_active, sort_order, created_at, updated_at`,
        [ORG_ID, staffId, isActive],
      );
      return rows[0] ? mapStaff(rows[0]) : null;
    },

    async listRecordsForDate(workDate) {
      const rows = await q<{
        id: string;
        staff_id: string;
        work_date: unknown;
        status: string;
        notes: string;
        marked_by: string;
        marked_at: unknown;
        updated_at: unknown;
      }>(
        `select id, staff_id, work_date, status, notes, marked_by, marked_at, updated_at
         from attendance_records
         where organization_id = $1 and work_date = $2::date`,
        [ORG_ID, workDate],
      );
      return rows.map(mapRecord);
    },

    async upsertRecord(input: UpsertAttendanceRecordInput) {
      const rows = await q<{
        id: string;
        staff_id: string;
        work_date: unknown;
        status: string;
        notes: string;
        marked_by: string;
        marked_at: unknown;
        updated_at: unknown;
      }>(
        `insert into attendance_records
           (organization_id, staff_id, work_date, status, notes, marked_by, marked_at)
         values ($1, $2, $3::date, $4, $5, $6, now())
         on conflict (organization_id, staff_id, work_date)
         do update set
           status = excluded.status,
           notes = excluded.notes,
           marked_by = excluded.marked_by,
           marked_at = now()
         returning id, staff_id, work_date, status, notes, marked_by, marked_at, updated_at`,
        [ORG_ID, input.staffId, input.workDate, input.status, input.notes, input.markedBy],
      );
      return mapRecord(rows[0]!);
    },
  };
}
