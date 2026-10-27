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
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* M4 hero left panel: navy chrome. Teal underline block is decorative-on-dark only
          (contrast law); sentence below is original plain description, not copied copy. */}
      <section className="flex flex-col justify-center bg-navy p-12 text-white">
        <h1 className="text-3xl font-normal tracking-tight">Coverage Decision Reviewer</h1>
        <div aria-hidden="true" className="mt-3 h-[3px] w-10 bg-accent" />
        <p className="mt-6 max-w-md text-sm leading-6 text-white/80">
          Submit a prior-authorization request and the agent checks it rule by rule against
          the policy library, writing down every step so a reviewer can sign off with
          confidence.
        </p>
      </section>
      <section className="flex flex-col items-center justify-center gap-4 bg-background p-6">
        <p className="w-full max-w-sm text-sm text-slate-600">
          Dev-mode sign-in: pick any reviewer name.
        </p>
        <div className="w-full max-w-sm rounded-lg border border-slate-300 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
