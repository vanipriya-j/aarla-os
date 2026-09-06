import type { AttendanceStatus } from "@/lib/domain/attendance-types";

export type AttendanceStaffRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceRecordRow = {
  id: string;
  staffId: string;
  workDate: string;
  status: AttendanceStatus;
  notes: string;
  markedBy: string;
  markedAt: string;
  updatedAt: string;
};

export type UpsertAttendanceRecordInput = {
  staffId: string;
  workDate: string;
  status: AttendanceStatus;
  notes: string;
  markedBy: string;
};

export type InsertAttendanceStaffInput = {
  code: string;
  name: string;
  sortOrder: number;
};

export interface AttendanceRepository {
  listStaff(activeOnly?: boolean): Promise<AttendanceStaffRow[]>;
  insertStaff(input: InsertAttendanceStaffInput): Promise<AttendanceStaffRow>;
  setStaffActive(staffId: string, isActive: boolean): Promise<AttendanceStaffRow | null>;
  listRecordsForDate(workDate: string): Promise<AttendanceRecordRow[]>;
  upsertRecord(input: UpsertAttendanceRecordInput): Promise<AttendanceRecordRow>;
}
