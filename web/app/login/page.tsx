// Server Component login page (SPEC-M1: minimal login form page, server component + tiny
// client island). Already-signed-in visitors never render the form: the cookie check runs
// on the server before any HTML is produced.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/LoginForm";
import { reviewerFromCookieHeader } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  const { switch: switching } = await searchParams;
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!switching && reviewerFromCookieHeader(cookieHeader)) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-bold text-slate-900">Coverage Decision Reviewer</h1>
      <p className="text-sm text-slate-600">Dev-mode sign-in: pick any reviewer name.</p>
      <LoginForm />
    </main>
  );
}
