import { describe, expect, it } from "vitest";
import {
  boardStatusForMember,
  expectedWindowLabel,
  workDateInTimezone,
} from "@/lib/domain/team-types";
import {
  hashCredential,
  isReservedUsername,
  isValidUsername,
  normalizeUsername,
  verifyCredential,
} from "@/lib/auth/credential-hash";
import { teamCanAccessPath } from "@/lib/auth/team-access";
import { canAccessPath, homePathForRole } from "@/lib/auth/roles";
import { navForRole } from "@/lib/auth/nav";

describe("team credential hash", () => {
  it("hashes and verifies PIN without storing plaintext", () => {
    const hash = hashCredential("4821");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.includes("4821")).toBe(false);
    expect(verifyCredential("4821", hash)).toBe(true);
    expect(verifyCredential("0000", hash)).toBe(false);
  });

  it("normalizes usernames", () => {
    expect(normalizeUsername(" Shreen ")).toBe("shreen");
    expect(isValidUsername("dhilip")).toBe(true);
    expect(isValidUsername("a")).toBe(false);
    expect(isReservedUsername("admin")).toBe(true);
    expect(isReservedUsername("shreen")).toBe(false);
  });
});

describe("attendance board helpers", () => {
  it("maps board statuses", () => {
    expect(boardStatusForMember(false, null)).toBe("ATTENDANCE_NOT_REQUIRED");
    expect(boardStatusForMember(true, null)).toBe("NOT_YET_IN");
    expect(
      boardStatusForMember(true, {
        status: "PRESENT",
        checkInAt: "2026-09-06T03:30:00.000Z",
        checkOutAt: null,
      }),
    ).toBe("PRESENT");
  });

  it("formats expected windows", () => {
    expect(expectedWindowLabel("09:00", "13:00")).toMatch(/Expected/);
  });

  it("returns Kolkata work date shape", () => {
    expect(workDateInTimezone(new Date("2026-09-06T10:00:00+05:30"))).toBe(
      "2026-09-06",
    );
  });
});

describe("team path access", () => {
  it("lets operations reach fulfil but not finance", () => {
    expect(teamCanAccessPath(["OPERATIONS"], "/fulfil")).toBe(true);
    expect(teamCanAccessPath(["OPERATIONS"], "/finance/gst")).toBe(false);
    expect(teamCanAccessPath(["OPERATIONS"], "/team")).toBe(false);
    expect(teamCanAccessPath(["FOUNDER_ADMIN"], "/team")).toBe(true);
  });

  it("wires AppRole team into canAccessPath", () => {
    expect(canAccessPath("team", "/fulfil", ["OPERATIONS"])).toBe(true);
    expect(canAccessPath("team", "/diagnostics", ["OPERATIONS"])).toBe(false);
    expect(homePathForRole("team", ["CREATIVE"])).toBe("/content");
  });

  it("filters nav for team operations", () => {
    const nav = navForRole("team", ["OPERATIONS"]);
    expect(nav.operate.some((i) => i.href === "/fulfil")).toBe(true);
    expect(nav.admin.some((i) => i.href === "/team")).toBe(false);
    expect(navForRole("admin").admin.some((i) => i.href === "/team")).toBe(true);
  });
});
