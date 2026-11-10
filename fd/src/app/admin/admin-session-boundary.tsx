"use client";

import { useEffect, useState, type ReactNode } from "react";

const adminApiUrl = "/api/admin";

export default function AdminSessionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${adminApiUrl}/logout`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not start a fresh admin session.");
        if (active) setReady(true);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not start a fresh admin session.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <section
          className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 text-[#923a35] shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="mt-4 rounded-full border border-[#923a35]/30 px-4 py-2 text-xs font-semibold"
            onClick={() => window.location.reload()}
            type="button"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <section className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 text-[#62645f] shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9">
          <p aria-live="polite" className="text-center text-sm" role="status">
            Preparing secure admin access…
          </p>
        </section>
      </main>
    );
  }

  return children;
}
