"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  TeamGender,
  TeamIdDocumentType,
  TeamRelationshipType,
  WorkLocation,
} from "@/lib/domain/team-types";

export default function NewTeamMemberPage() {
  const [submitting, setSubmitting] = useState(false);
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
  const [legalName, setLegalName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<TeamGender>("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [idType, setIdType] = useState<TeamIdDocumentType>("");
  const [idNumber, setIdNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
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
        personal: {
          legalName: legalName || displayName,
          dateOfBirth: dateOfBirth || null,
          gender,
          bloodGroup,
          personalEmail,
          alternatePhone,
          addressLine1,
          addressLine2,
          city,
          state,
          pincode,
          emergencyContactName: emergencyName,
          emergencyContactPhone: emergencyPhone,
          emergencyContactRelation: emergencyRelation,
          idDocumentType: idType,
          idDocumentNumber: idNumber,
          startDate: startDate || null,
          notes: personalNotes,
        },
      });
      if (!res.ok) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      // Hard navigate — soft router.push inside useTransition left "Creating…" stuck
      // even after the member was saved (as with Vanipriya).
      window.location.assign(`/team/${res.member.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Create stalled — check /setup was run, then retry with a username that isn’t admin/crm.",
      );
      setSubmitting(false);
    }
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

          <FormSection
            title="Personal details"
            description="Office onboarding — kept for Team admins only. Not shown on CRM People."
          >
            <Field label="Legal / full name">
              <input
                className={inputClass}
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="As on ID document"
                data-testid="team-legal-name"
              />
            </Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Date of birth">
                <input
                  type="date"
                  className={inputClass}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  data-testid="team-dob"
                />
              </Field>
              <Field label="Gender">
                <select
                  className={inputClass}
                  value={gender}
                  onChange={(e) => setGender(e.target.value as TeamGender)}
                >
                  <option value="">—</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Blood group">
                <input
                  className={inputClass}
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  placeholder="e.g. B+"
                />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Personal email (optional)">
                <input
                  type="email"
                  className={inputClass}
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  placeholder="Not required for login"
                />
              </Field>
              <Field label="Alternate phone">
                <input
                  className={inputClass}
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Address">
              <input
                className={inputClass}
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Flat / street"
                data-testid="team-address"
              />
            </Field>
            <Field label="Address line 2">
              <input
                className={inputClass}
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Area / landmark"
              />
            </Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="City">
                <input
                  className={inputClass}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </Field>
              <Field label="State">
                <input
                  className={inputClass}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </Field>
              <Field label="PIN code">
                <input
                  className={inputClass}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Emergency contact">
                <input
                  className={inputClass}
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  data-testid="team-emergency-name"
                />
              </Field>
              <Field label="Emergency phone">
                <input
                  className={inputClass}
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  data-testid="team-emergency-phone"
                />
              </Field>
              <Field label="Relation">
                <input
                  className={inputClass}
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  placeholder="Parent / spouse / …"
                />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="ID document">
                <select
                  className={inputClass}
                  value={idType}
                  onChange={(e) => setIdType(e.target.value as TeamIdDocumentType)}
                  data-testid="team-id-type"
                >
                  <option value="">—</option>
                  <option value="aadhaar">Aadhaar</option>
                  <option value="pan">PAN</option>
                  <option value="driving_licence">Driving licence</option>
                  <option value="passport">Passport</option>
                  <option value="voter_id">Voter ID</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="ID number">
                <input
                  className={inputClass}
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  data-testid="team-id-number"
                />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Start / joining date">
                <input
                  type="date"
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Notes">
                <input
                  className={inputClass}
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="Anything the office should know"
                />
              </Field>
            </div>
            <p className="text-xs text-charcoal/45">
              ID and contact details are for office records only — not used for login or face
              recognition.
            </p>
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
            <p className="text-xs text-charcoal/50 -mt-2">
              Use their name (e.g. shreen) — not <code>admin</code> or <code>crm</code>, those are
              the founder logins.
            </p>
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

          <Button type="submit" disabled={submitting} data-testid="team-add-submit">
            {submitting ? "Creating…" : "Create team member"}
          </Button>
        </form>
      </main>
    </>
  );
}
