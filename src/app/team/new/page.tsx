"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import { Button } from "@/components/ui/Button";
import {
  createTeamMemberAction,
  listAccessRolesAction,
  listWorkLocationsAction,
  searchPeopleForTeamAction,
} from "@/app/actions/team-actions";
import type {
  AccessRole,
  AccessRoleCode,
  TeamFunction,
  TeamRelationshipType,
  WorkLocation,
} from "@/lib/domain/team-types";

export default function NewTeamMemberPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [matches, setMatches] = useState<
    Array<{ code: string; name: string; email: string; phone: string; roles: string[] }>
  >([]);
  const [existingPersonCode, setExistingPersonCode] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [teamFunction, setTeamFunction] = useState<TeamFunction>("Operations");
  const [relationshipType, setRelationshipType] =
    useState<TeamRelationshipType>("TEAM_MEMBER");
  const [locationId, setLocationId] = useState("");
  const [attendanceRequired, setAttendanceRequired] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [username, setUsername] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [accessRole, setAccessRole] = useState<AccessRoleCode>("OPERATIONS");

  useEffect(() => {
    (async () => {
      const [locs, access] = await Promise.all([
        listWorkLocationsAction(true),
        listAccessRolesAction(),
      ]);
      setLocations(locs);
      setRoles(access);
      const ashok = locs.find((l) => l.code === "ashok-nagar");
      if (ashok) setLocationId(ashok.id);
    })().catch(() => setError("Could not load locations — run /setup first."));
  }, []);

  useEffect(() => {
    if (personQuery.trim().length < 2) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      searchPeopleForTeamAction(personQuery)
        .then(setMatches)
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [personQuery]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createTeamMemberAction({
        existingPersonCode,
        displayName,
        phone,
        relationshipType,
        roleTitle,
        teamFunction,
        defaultLocationId: locationId || null,
        attendanceRequired,
        expectedStartTime: startTime || null,
        expectedEndTime: endTime || null,
        username,
        temporaryPin: tempPin,
        accessRoleCodes: [accessRole],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/team/${res.member.id}`);
      router.refresh();
    });
  };

  return (
    <>
      <Header
        title="Add Team Member"
        subtitle="Link an existing Person when you can — never duplicate a human."
        actions={
          <Link href="/team">
            <Button size="sm" variant="outline">
              Back
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 max-w-3xl">
        <form onSubmit={submit} className="space-y-6" data-testid="team-add-form">
          <FormSection title="Identity">
            <Field label="Look up existing Person">
              <input
                className={inputClass}
                value={personQuery}
                onChange={(e) => {
                  setPersonQuery(e.target.value);
                  setExistingPersonCode(null);
                }}
                placeholder="Search name, phone, email…"
                data-testid="team-person-search"
              />
            </Field>
            {matches.length ? (
              <ul className="rounded-xl border border-border bg-white divide-y divide-border">
                {matches.map((m) => (
                  <li key={m.code}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-pale-cream"
                      onClick={() => {
                        setExistingPersonCode(m.code);
                        setDisplayName(m.name);
                        setPhone(m.phone || "");
                        setPersonQuery(m.name);
                        setMatches([]);
                      }}
                    >
                      <span className="font-medium text-deep-navy">{m.name}</span>
                      <span className="text-charcoal/50">
                        {" "}
                        · {m.roles.join(", ") || "no CRM roles"}
                        {m.email ? ` · ${m.email}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {existingPersonCode ? (
              <p className="text-xs text-muted-green">
                Linking existing Person <code>{existingPersonCode}</code> — CRM history stays intact.
              </p>
            ) : (
              <p className="text-xs text-charcoal/50">
                No match? We will create a new Person (no email required).
              </p>
            )}
            <Field label="Display name">
              <input
                className={inputClass}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                data-testid="team-display-name"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Team relationship">
            <Field label="Role / title">
              <input
                className={inputClass}
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Operations associate"
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Function">
                <select
                  className={inputClass}
                  value={teamFunction}
                  onChange={(e) => setTeamFunction(e.target.value as TeamFunction)}
                >
                  {["Operations", "Creative", "Admin", "Founder", "Other"].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Relationship">
                <select
                  className={inputClass}
                  value={relationshipType}
                  onChange={(e) =>
                    setRelationshipType(e.target.value as TeamRelationshipType)
                  }
                >
                  {[
                    "TEAM_MEMBER",
                    "COLLABORATOR",
                    "INTERN",
                    "FOUNDER",
                    "CONTRACTOR",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Work settings">
            <Field label="Default location">
              <select
                className={inputClass}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                data-testid="team-location"
              >
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-deep-navy">
              <input
                type="checkbox"
                checked={attendanceRequired}
                onChange={(e) => setAttendanceRequired(e.target.checked)}
              />
              Attendance required
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Expected start">
                <input
                  type="time"
                  className={inputClass}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field label="Expected end">
                <input
                  type="time"
                  className={inputClass}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Account (no email)">
            <Field label="Username">
              <input
                className={inputClass}
                required
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="shreen"
                data-testid="team-username"
              />
            </Field>
            <Field label="Temporary PIN / password">
              <input
                className={inputClass}
                required
                type="password"
                autoComplete="new-password"
                value={tempPin}
                onChange={(e) => setTempPin(e.target.value)}
                data-testid="team-temp-pin"
              />
            </Field>
            <p className="text-xs text-charcoal/50">
              They must change this PIN on first login.
            </p>
            <Field label="Access role">
              <select
                className={inputClass}
                value={accessRole}
                onChange={(e) => setAccessRole(e.target.value as AccessRoleCode)}
                data-testid="team-access-role"
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </FormSection>

          {error ? (
            <p className="text-sm text-aarla-red" data-testid="team-add-error">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} data-testid="team-add-submit">
            {pending ? "Creating…" : "Create team member"}
          </Button>
        </form>
      </main>
    </>
  );
}
