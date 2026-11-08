"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const adminApiUrl = "/api/admin";

type SentTicketRecipient = {
  name: string;
  email: string;
  ticketTier: "earlyBird" | "regular" | "late" | null;
  emailSentAt: string;
};

const ticketTierLabels = {
  earlyBird: "Early Bird",
  regular: "Regular",
  late: "Late",
} as const;

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<SentTicketRecipient[] | null>(null);
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`${adminApiUrl}/tickets`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          error?: string;
          sentTickets?: SentTicketRecipient[];
        };

        if (response.status === 401) {
          if (active) setRequiresLogin(true);
          return;
        }
        if (!response.ok || !Array.isArray(result.sentTickets)) {
          throw new Error(result.error ?? "Could not load ticket recipients.");
        }
        if (active) setTickets(result.sentTickets);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load ticket recipients.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-[760px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 text-[#15294b] shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9">
        <Link
          className="inline-flex rounded-full border border-[#15294b]/20 px-4 py-2 text-xs font-semibold transition hover:bg-[#e8dfd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15294b]"
          href="/admin"
        >
          ← Back to admin
        </Link>
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
          MSAI · Admin
        </p>
        <h1 className="mt-2 font-serif text-3xl">Ticket recipients</h1>
        <p className="mt-2 text-sm text-[#62645f]">
          Each recipient is listed once, with the most recent successful email date.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-[#dce5d6] px-3 py-1 text-[#24523c]">
            Green · Early Bird
          </span>
          <span className="rounded-full bg-[#ebe1cd] px-3 py-1 text-[#71572e]">
            Yellow · Regular
          </span>
          <span className="rounded-full bg-[#f0ded6] px-3 py-1 text-[#923a35]">
            Red · Late
          </span>
        </div>

        <div aria-live="polite" className="mt-7">
          {requiresLogin ? (
            <p className="rounded-xl bg-[#f0ded6] px-4 py-3 text-sm text-[#923a35]">
              Please <Link className="font-semibold underline" href="/admin">sign in</Link>{" "}
              to view ticket recipients.
            </p>
          ) : error ? (
            <p className="rounded-xl bg-[#f0ded6] px-4 py-3 text-sm text-[#923a35]" role="alert">
              {error}
            </p>
          ) : tickets === null ? (
            <p className="py-8 text-center text-sm text-[#62645f]" role="status">
              Loading ticket recipients…
            </p>
          ) : tickets.length ? (
            <div className="overflow-x-auto rounded-2xl border border-[#c7b995]/80">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#e8dfcf] text-[10px] uppercase tracking-[.12em] text-[#80643a]">
                  <tr>
                    <th className="px-4 py-3 font-bold">Name</th>
                    <th className="px-4 py-3 font-bold">Email</th>
                    <th className="px-4 py-3 font-bold">Ticket type</th>
                    <th className="px-4 py-3 font-bold">Last emailed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c7b995]/60">
                  {tickets.map((ticket) => (
                    <tr className="bg-[#fffdf8]/70" key={ticket.email}>
                      <td className="px-4 py-3 font-semibold">{ticket.name}</td>
                      <td className="break-all px-4 py-3">{ticket.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            ticket.ticketTier === "earlyBird"
                              ? "bg-[#dce5d6] text-[#24523c]"
                              : ticket.ticketTier === "regular"
                                ? "bg-[#ebe1cd] text-[#71572e]"
                                : ticket.ticketTier === "late"
                                  ? "bg-[#f0ded6] text-[#923a35]"
                                  : "bg-[#e8dfcf] text-[#62645f]"
                          }`}
                        >
                          {ticket.ticketTier
                            ? ticketTierLabels[ticket.ticketTier]
                            : "Older ticket"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#62645f]">
                        <time dateTime={ticket.emailSentAt}>
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(ticket.emailSentAt))}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl bg-[#dce5d6] px-4 py-3 text-sm text-[#24523c]">
              No tickets have been emailed yet.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
