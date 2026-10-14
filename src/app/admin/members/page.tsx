"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, UserPlus } from "lucide-react";
import { memberService, type Member } from "@/services/admin/memberService";
import { validateMemberForm, todayIso, type MemberFormErrors, type MemberFormValues } from "@/modules/admin/memberForm";
import { ACCOUNT_ROLES, DEFAULT_ACCOUNT_ROLE, roleLabel } from "@/modules/admin/accountRole";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMPTY_FORM: MemberFormValues = { role: DEFAULT_ACCOUNT_ROLE, name: "", birthDate: "", email: "", password: "" };

function formatBirthDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Admin-only: register players. The database and the Edge Function enforce it; hiding the page is only courtesy. */
export default function AdminMembersPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [values, setValues] = useState<MemberFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const loadMembers = useCallback(async () => {
    const result = await memberService.list();
    setMembers(result.members);
    setListError(result.error);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadMembers();
  }, [isAdmin, loadMembers]);

  function setField(field: keyof MemberFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setCreated(null);

    const found = validateMemberForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const { error } = await memberService.create(values);
    setSubmitting(false);
    if (error) {
      setFormError(error);
      return;
    }
    setCreated(values.name.trim());
    setValues({ ...EMPTY_FORM, role: values.role });
    void loadMembers();
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground">Only admins can register players.</p>
        <Button className="mt-4" render={<Link href="/library" />} nativeButton={false}>
          Back to library
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="font-display text-2xl font-semibold">Players</h1>
        <p className="mt-1 text-muted-foreground">Register a player. They log in with the email and password you set here.</p>
      </div>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display">New player</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Account type</legend>
              <div className="mt-1.5 grid gap-2">
                {ACCOUNT_ROLES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      values.role === option.value ? "border-primary bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <input
                      type="radio"
                      name="member-role"
                      value={option.value}
                      checked={values.role === option.value}
                      onChange={() => setField("role", option.value)}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.role && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.role}
                </p>
              )}
            </fieldset>

            <Field id="member-name" label="Name" error={errors.name}>
              <Input
                id="member-name"
                autoComplete="off"
                maxLength={60}
                className="h-10"
                value={values.name}
                onChange={(e) => setField("name", e.target.value)}
                aria-invalid={Boolean(errors.name)}
              />
            </Field>

            <Field id="member-birth" label="Birth date" error={errors.birthDate}>
              <Input
                id="member-birth"
                type="date"
                min="1900-01-01"
                max={todayIso()}
                className="h-10"
                value={values.birthDate}
                onChange={(e) => setField("birthDate", e.target.value)}
                aria-invalid={Boolean(errors.birthDate)}
              />
            </Field>

            <Field id="member-email" label="Email" hint="Used to log in." error={errors.email}>
              <Input
                id="member-email"
                type="email"
                autoComplete="off"
                className="h-10"
                value={values.email}
                onChange={(e) => setField("email", e.target.value)}
                aria-invalid={Boolean(errors.email)}
              />
            </Field>

            <Field id="member-password" label="Password" hint="At least 6 characters." error={errors.password}>
              <Input
                id="member-password"
                type="password"
                autoComplete="new-password"
                className="h-10"
                value={values.password}
                onChange={(e) => setField("password", e.target.value)}
                aria-invalid={Boolean(errors.password)}
              />
            </Field>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            {created && (
              <p role="status" className="text-sm text-primary">
                {created} was registered.
              </p>
            )}

            <Button type="submit" className="h-10 gap-2" disabled={submitting}>
              {submitting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <UserPlus aria-hidden className="size-4" />}
              Register player
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display">Registered by admins</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <Loader2 aria-label="Loading" className="size-5 animate-spin text-muted-foreground" />
          ) : listError ? (
            <p role="alert" className="text-sm text-destructive">
              {listError}
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li key={member.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">· {roleLabel(member.role)}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBirthDate(member.birthDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
