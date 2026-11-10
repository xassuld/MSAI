"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminNavigation from "../../admin-navigation";

const adminApiUrl = "/api/admin";

type SentTicketRecipient = {
  name: string;
  email?: string | null;
  ticketNumber: number;
  ticketTier: "earlyBird" | "regular" | "late" | "atGate" | "lateLate" | null;
  isComplimentary: boolean;
  isSandbox: boolean;
  isGateSale?: boolean;
  emailSentAt: string | null;
};

const ticketTierLabels = {
  earlyBird: "Early Bird",
  regular: "Regular",
  late: "Late",
  atGate: "At-gate · Cash",
  lateLate: "At-gate · Cash",
} as const;

export default function AdminTicketListPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SentTicketRecipient[] | null>(null);
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [deletingTicketNumber, setDeletingTicketNumber] = useState<number | null>(
    null,
  );
  const [resendingTicketNumber, setResendingTicketNumber] = useState<number | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState("");

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

  useEffect(() => {
    if (requiresLogin) router.replace("/admin");
  }, [requiresLogin, router]);

  async function resendComplimentaryTicket(ticket: SentTicketRecipient) {
    setResendingTicketNumber(ticket.ticketNumber);
    setActionMessage("");
    try {
      const response = await fetch(
        `${adminApiUrl}/tickets/${ticket.ticketNumber}/resend`,
        { method: "POST", credentials: "include" },
      );
      const result = (await response.json()) as {
        error?: string;
        emailSentAt?: string;
      };
      if (!response.ok || !result.emailSentAt) {
        throw new Error(result.error ?? "Could not resend complimentary ticket.");
      }
      setTickets((current) =>
        current?.map((item) =>
          item.ticketNumber === ticket.ticketNumber
            ? { ...item, emailSentAt: result.emailSentAt ?? null }
            : item,
        ) ?? null,
      );
      setActionMessage(`Ticket #${ticket.ticketNumber} was emailed to ${ticket.email}.`);
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not resend complimentary ticket.",
      );
    } finally {
      setResendingTicketNumber(null);
    }
  }

  async function deleteTicket(ticket: SentTicketRecipient) {
    const ticketKind = ticket.isComplimentary
      ? "complimentary"
      : ticket.isGateSale
        ? "cash gate"
        : ticket.isSandbox
          ? "Sandbox test"
          : "paid live";
    const capacityWarning = ticket.isComplimentary
      ? ""
      : ticket.isGateSale
        ? " This invalidates the ticket; no cash refund will be issued."
        : " Its ticket will be invalidated and the paid capacity spot reopened. No refund will be issued.";
    const confirmed = window.confirm(
      `Delete ${ticketKind} ticket #${ticket.ticketNumber} for ${ticket.email ?? ticket.name}? This invalidates its ticket code.${capacityWarning}`,
    );
    if (!confirmed) return;

    setDeletingTicketNumber(ticket.ticketNumber);
    setActionMessage("");
    try {
      const response = await fetch(
        `${adminApiUrl}/tickets/${ticket.ticketNumber}`,
        { method: "DELETE", credentials: "include" },
      );
      const result = (await response.json()) as {
        error?: string;
        deleted?: boolean;
      };
      if (!response.ok || result.deleted !== true) {
        throw new Error(result.error ?? "Could not delete the ticket.");
      }
      setTickets(
        (current) =>
          current?.filter((item) => item.ticketNumber !== ticket.ticketNumber) ?? [],
      );
      setActionMessage(
        `${ticketKind} ticket #${ticket.ticketNumber} was deleted.${
          ticket.isComplimentary
            ? ""
            : ticket.isGateSale
              ? " No cash refund was issued."
              : " Its paid capacity spot was reopened; no refund was issued."
        }`,
      );
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : `Could not delete the ${ticketKind} ticket.`,
      );
    } finally {
      setDeletingTicketNumber(null);
    }
  }

  if (requiresLogin) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <section className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 text-[#923a35] shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9">
          <p aria-live="polite" role="status">
            Redirecting to admin sign-in…
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 text-[#15294b] sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[1600px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-5 shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-8 lg:p-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
              MSAI · Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl text-[#15294b] sm:text-4xl">
              Ticket list
            </h1>
            <p className="mt-2 text-sm text-[#62645f]">
              Attendee and ticket details in a full-width table.
            </p>
          </div>
          <Link
            className="inline-flex items-center rounded-full border border-[#15294b]/30 px-4 py-2.5 text-sm font-semibold transition hover:bg-[#e8dfcf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15294b]"
            href="/admin/tickets"
          >
            Back to ticket tools
          </Link>
        </div>
        <AdminNavigation active="recipients" />
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl">All ticket holders</h2>
            <p className="mt-1 text-xs text-[#62645f]">
              List numbers stay sequential after deletions; ticket IDs remain
              permanent for QR codes and records.
            </p>
          </div>
          {tickets && (
            <p className="rounded-full bg-[#e8dfcf] px-4 py-2 text-sm font-semibold tabular-nums">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </p>
          )}
        </div>
        <div
          aria-label="Ticket type color key"
          className="mb-5 flex flex-wrap gap-2 text-xs font-semibold"
        >
          <span className="rounded-full border border-[#dce5d6] bg-[#dce5d6] px-3 py-1 text-[#15294b]">
            Green · Early Bird
          </span>
          <span className="rounded-full border border-[#ebe1cd] bg-[#ebe1cd] px-3 py-1 text-[#15294b]">
            Yellow · Regular
          </span>
          <span className="rounded-full border border-[#f0ded6] bg-[#f0ded6] px-3 py-1 text-[#15294b]">
            Red · Late
          </span>
          <span className="rounded-full border border-[#e4c77e] bg-[#e4c77e] px-3 py-1 text-[#15294b]">
            Golden yellow · VIP
          </span>
          <span className="rounded-full border border-[#bfdbfe] bg-[#bfdbfe] px-3 py-1 text-[#15294b]">
            Light blue · At-gate
          </span>
        </div>
        {actionMessage && (
          <p
            aria-live="polite"
            className="mb-4 rounded-xl bg-[#e8dfcf] px-4 py-3 text-sm text-[#15294b]"
            role="status"
          >
            {actionMessage}
          </p>
        )}
        {error ? (
          <p
            className="rounded-xl bg-[#f0ded6] px-4 py-3 text-sm text-[#923a35]"
            role="alert"
          >
            {error}
          </p>
        ) : tickets === null ? (
          <p className="rounded-xl bg-[#fffdf8]/70 px-4 py-10 text-center text-sm text-[#62645f]" role="status">
            Loading ticket recipients…
          </p>
        ) : tickets.length === 0 ? (
          <p className="rounded-xl bg-[#dce5d6] px-4 py-5 text-sm text-[#24523c]">
            No tickets have been issued yet.
          </p>
        ) : (
          <div className="max-h-[72vh] overflow-auto rounded-2xl border border-[#c7b995] bg-[#fffdf8]/70">
            <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#e8dfcf] text-[10px] uppercase tracking-[.12em] text-[#80643a] shadow-[0_1px_0_#c7b995]">
                <tr>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">List #</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Ticket ID</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Name</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Email</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Ticket type</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Delivery</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Last emailed</th>
                  <th className="border border-[#c7b995]/70 px-4 py-3 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, index) => (
                  <tr
                    className="bg-[#fffdf8]/70 transition-colors hover:bg-[#e8dfcf]/60"
                    key={ticket.ticketNumber}
                  >
                    <td className="whitespace-nowrap border border-[#c7b995]/60 px-4 py-3 font-mono text-xs font-semibold">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap border border-[#c7b995]/60 px-4 py-3 font-mono text-xs text-[#62645f]">
                      {ticket.ticketNumber}
                    </td>
                    <td className="min-w-40 border border-[#c7b995]/60 px-4 py-3 font-semibold">
                      {ticket.name}
                    </td>
                    <td className="min-w-64 border border-[#c7b995]/60 px-4 py-3">
                      {ticket.email ?? (ticket.isGateSale ? "Cash at gate" : "—")}
                    </td>
                    <td className="border border-[#c7b995]/60 px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${
                          ticket.isComplimentary
                            ? "border-[#e4c77e] bg-[#e4c77e] text-[#15294b]"
                            : ticket.ticketTier === "earlyBird"
                              ? "border-[#dce5d6] bg-[#dce5d6] text-[#15294b]"
                              : ticket.ticketTier === "regular"
                                ? "border-[#ebe1cd] bg-[#ebe1cd] text-[#15294b]"
                                : ticket.ticketTier === "late"
                                  ? "border-[#f0ded6] bg-[#f0ded6] text-[#15294b]"
                                  : ticket.ticketTier === "atGate" ||
                                      ticket.ticketTier === "lateLate"
                                    ? "border-[#bfdbfe] bg-[#bfdbfe] text-[#15294b]"
                                    : "border-[#c7b995] bg-[#e8dfcf] text-[#15294b]"
                        }`}
                      >
                        {ticket.isComplimentary
                          ? "VIP"
                          : ticket.ticketTier
                            ? ticketTierLabels[ticket.ticketTier]
                            : "Older ticket"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border border-[#c7b995]/60 px-4 py-3 text-[#62645f]">
                      {ticket.isGateSale
                        ? "Cash · admitted"
                        : ticket.emailSentAt
                          ? "Email sent"
                          : "Email not sent"}
                      {ticket.isSandbox && (
                        <span className="ml-2 rounded-full bg-[#e8dfcf] px-2 py-1 text-[10px] font-semibold">
                          Sandbox
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border border-[#c7b995]/60 px-4 py-3 text-[#62645f]">
                      {ticket.isGateSale ? (
                        "—"
                      ) : ticket.emailSentAt ? (
                        <time dateTime={ticket.emailSentAt}>
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(ticket.emailSentAt))}
                        </time>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border border-[#c7b995]/60 px-4 py-3">
                      <div className="flex flex-nowrap gap-2">
                        {ticket.isComplimentary && !ticket.emailSentAt && (
                          <button
                            className="whitespace-nowrap rounded-full border border-[#15294b]/30 px-3 py-1.5 text-xs font-semibold hover:bg-[#e8dfcf] disabled:opacity-50"
                            disabled={resendingTicketNumber !== null}
                            onClick={() => void resendComplimentaryTicket(ticket)}
                            type="button"
                          >
                            {resendingTicketNumber === ticket.ticketNumber
                              ? "Sending…"
                              : "Retry email"}
                          </button>
                        )}
                        <button
                          className="whitespace-nowrap rounded-full border border-[#923a35]/40 px-3 py-1.5 text-xs font-semibold text-[#923a35] hover:bg-[#f0ded6] disabled:opacity-50"
                          disabled={deletingTicketNumber !== null}
                          onClick={() => void deleteTicket(ticket)}
                          type="button"
                        >
                          {deletingTicketNumber === ticket.ticketNumber
                            ? "Deleting…"
                            : "Delete ticket"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
