"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AdminSection = "details" | "recipients" | "prices";
const adminApiUrl = "/api/admin";

const sections: { href: string; key: AdminSection; label: string }[] = [
  { href: "/admin", key: "details", label: "Event details" },
  { href: "/admin/tickets", key: "recipients", label: "Recipients" },
  { href: "/admin/prices", key: "prices", label: "Prices" },
];

export default function AdminNavigation({
  active,
}: {
  active: AdminSection;
}) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${adminApiUrl}/events/christmas`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((response) => {
        if (!active) return;
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Could not check the admin session.");
        setAuthenticated(true);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Could not check the admin session.",
          );
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch(`${adminApiUrl}/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not sign out. Please retry.");
      setAuthenticated(false);
      router.push("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="mb-7">
      <nav
        aria-label="Admin sections"
        className="flex flex-wrap items-center gap-2"
      >
        {sections.map((section) => (
          <Link
            aria-current={section.key === active ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15294b] ${
              section.key === active
                ? "border-[#15294b] bg-[#15294b] text-[#f5efe3]"
                : "border-[#15294b]/20 text-[#15294b] hover:bg-[#e8dfd0]"
            }`}
            href={section.href}
            key={section.key}
          >
            {section.label}
          </Link>
        ))}
        {!checkingSession && authenticated && (
          <button
            className="ml-auto rounded-full border border-[#923a35]/30 px-4 py-2 text-xs font-semibold text-[#923a35] transition hover:bg-[#f0ded6]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#923a35] disabled:opacity-50"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            type="button"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        )}
      </nav>
      {error && (
        <p aria-live="polite" className="mt-2 text-xs text-[#923a35]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
