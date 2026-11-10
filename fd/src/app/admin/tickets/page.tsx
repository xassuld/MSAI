"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

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

type TicketPreviewEvent = {
  title: string;
  date: string;
  time: string;
  location: string;
  partyDescription: string;
};

const ticketTierLabels = {
  earlyBird: "Early Bird",
  regular: "Regular",
  late: "Late",
  atGate: "At-gate · Cash",
  lateLate: "At-gate · Cash",
} as const;

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<SentTicketRecipient[] | null>(null);
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [deletingTicketNumber, setDeletingTicketNumber] = useState<number | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState("");
  const [complimentaryName, setComplimentaryName] = useState("");
  const [complimentaryEmail, setComplimentaryEmail] = useState("");
  const [sendingComplimentary, setSendingComplimentary] = useState(false);
  const [gateName, setGateName] = useState("");
  const [issuingGateTicket, setIssuingGateTicket] = useState(false);
  const [showComplimentaryPreview, setShowComplimentaryPreview] = useState(false);
  const [previewEvent, setPreviewEvent] = useState<TicketPreviewEvent>({
    title: "Christmas together",
    date: "",
    time: "",
    location: "",
    partyDescription: "",
  });
  const [resendingTicketNumber, setResendingTicketNumber] = useState<number | null>(
    null,
  );

  function formatPreviewDate(date: string): string {
    if (!date) return "To be announced";
    return new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  }

  function upsertTicket(ticket: SentTicketRecipient) {
    setTickets((current) =>
      [
        ticket,
        ...(current ?? []).filter((item) => item.ticketNumber !== ticket.ticketNumber),
      ].sort((a, b) => b.ticketNumber - a.ticketNumber),
    );
  }

  async function sendComplimentaryTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendingComplimentary(true);
    setActionMessage("");
    try {
      const response = await fetch(`${adminApiUrl}/tickets/complimentary`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: complimentaryName,
          email: complimentaryEmail,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        ticket?: SentTicketRecipient;
      };
      if (result.ticket) upsertTicket(result.ticket);
      if (!response.ok) throw new Error(result.error ?? "Could not send complimentary ticket.");
      if (!result.ticket) throw new Error("The server did not return the issued ticket.");
      setComplimentaryName("");
      setComplimentaryEmail("");
      setActionMessage(
        `Complimentary ticket #${result.ticket.ticketNumber} was emailed to ${result.ticket.email}.`,
      );
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not send complimentary ticket.",
      );
    } finally {
      setSendingComplimentary(false);
    }
  }

  async function issueGateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssuingGateTicket(true);
    setActionMessage("");
    try {
      const response = await fetch(`${adminApiUrl}/tickets/gate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: gateName }),
      });
      const result = (await response.json()) as {
        error?: string;
        ticket?: SentTicketRecipient;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not issue gate ticket.");
      if (!result.ticket) throw new Error("The server did not return the issued gate ticket.");
      upsertTicket(result.ticket);
      setGateName("");
      setActionMessage(
        `€28 cash ticket #${result.ticket.ticketNumber} issued for ${result.ticket.name}. Entry authorized.`,
      );
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not issue gate ticket.",
      );
    } finally {
      setIssuingGateTicket(false);
    }
  }

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
      upsertTicket({ ...ticket, emailSentAt: result.emailSentAt });
      setActionMessage(`Ticket #${ticket.ticketNumber} was emailed to ${ticket.email}.`);
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not resend complimentary ticket.",
      );
    } finally {
      setResendingTicketNumber(null);
    }
  }

  async function deleteRemovableTicket(ticket: SentTicketRecipient) {
    const ticketKind = ticket.isComplimentary
      ? "complimentary"
      : ticket.isGateSale
        ? "cash gate"
        : ticket.isSandbox
          ? "Sandbox test"
          : "paid live";
    const paidTicketWarning = ticket.isComplimentary
      ? ""
      : ticket.isGateSale
        ? " This invalidates the ticket; no cash refund will be issued."
        : " Its ticket will be invalidated and the paid capacity spot reopened. No refund will be issued.";
    const confirmed = window.confirm(
      `Delete ${ticketKind} ticket #${ticket.ticketNumber} for ${ticket.email ?? ticket.name}? This invalidates its ticket code.${paidTicketWarning}`,
    );
    if (!confirmed) return;

    setDeletingTicketNumber(ticket.ticketNumber);
    setActionMessage("");
    try {
      const response = await fetch(
        `${adminApiUrl}/tickets/${ticket.ticketNumber}`,
        { method: "DELETE", credentials: "include" },
      );
      const result = (await response.json()) as { error?: string; deleted?: boolean };
      if (!response.ok || result.deleted !== true) {
        throw new Error(result.error ?? "Could not delete the Sandbox ticket.");
      }
      setTickets((current) =>
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

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch(`${adminApiUrl}/tickets`, {
        cache: "no-store",
        credentials: "include",
      }),
      fetch(`${adminApiUrl}/events/christmas`, {
        cache: "no-store",
        credentials: "include",
      }),
    ])
      .then(async ([ticketsResponse, eventResponse]) => {
        const [ticketsResult, eventResult] = (await Promise.all([
          ticketsResponse.json(),
          eventResponse.json(),
        ])) as [
          { error?: string; sentTickets?: SentTicketRecipient[] },
          Partial<TicketPreviewEvent> & { error?: string },
        ];

        if (ticketsResponse.status === 401 || eventResponse.status === 401) {
          if (active) setRequiresLogin(true);
          return;
        }
        if (!ticketsResponse.ok || !Array.isArray(ticketsResult.sentTickets)) {
          throw new Error(ticketsResult.error ?? "Could not load ticket recipients.");
        }
        if (
          !eventResponse.ok ||
          typeof eventResult.title !== "string" ||
          typeof eventResult.date !== "string" ||
          typeof eventResult.time !== "string" ||
          typeof eventResult.location !== "string" ||
          typeof eventResult.partyDescription !== "string"
        ) {
          throw new Error(eventResult.error ?? "Could not load ticket preview details.");
        }
        if (active) {
          setTickets(ticketsResult.sentTickets);
          setPreviewEvent({
            title: eventResult.title,
            date: eventResult.date,
            time: eventResult.time,
            location: eventResult.location,
            partyDescription: eventResult.partyDescription,
          });
        }
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
          Paid and complimentary tickets are listed with their email status.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#62645f]">
          Any ticket can be deleted here. Deleting a paid ticket invalidates it
          and reopens its capacity spot without issuing a refund. Complimentary
          tickets do not affect paid capacity.
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

        <form
          className="mt-7 grid gap-4 rounded-2xl border border-[#923a35]/30 bg-[#f0ded6]/60 p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={issueGateTicket}
        >
          <div className="sm:col-span-2">
            <h2 className="font-serif text-xl">Cash-only At-gate · €28</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#62645f]">
              Available anytime for in-person sales. Collect cash and the
              attendee&apos;s name only; issuing the ticket immediately
              authorizes entry. Up to 20 tickets.
            </p>
          </div>
          <label className="grid text-sm font-semibold">
            Attendee name
            <input
              autoComplete="name"
              className="mt-1.5 w-full rounded-xl border border-[#c7b995] bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-[#15294b] focus:ring-2 focus:ring-[#15294b]/15"
              maxLength={120}
              onChange={(event) => setGateName(event.target.value)}
              required
              value={gateName}
            />
          </label>
          <button
            className="self-end rounded-xl bg-[#923a35] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7d302c] disabled:opacity-50"
            disabled={issuingGateTicket}
            type="submit"
          >
            {issuingGateTicket ? "Issuing…" : "Collect cash · issue · admit"}
          </button>
        </form>

        <form
          className="mt-7 grid gap-4 rounded-2xl border border-[#c7b995]/80 bg-[#fffdf8]/70 p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={sendComplimentaryTicket}
        >
          <div className="sm:col-span-2">
            <h2 className="font-serif text-xl">Send a complimentary ticket</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#62645f]">
              No payment is collected. Complimentary tickets do not count
              toward the 120 paid-ticket capacity.
            </p>
          </div>
          <label className="grid text-sm font-semibold">
            Recipient name
            <input
              autoComplete="name"
              className="mt-1.5 w-full rounded-xl border border-[#c7b995] bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-[#15294b] focus:ring-2 focus:ring-[#15294b]/15"
              maxLength={120}
              onChange={(event) => setComplimentaryName(event.target.value)}
              required
              value={complimentaryName}
            />
          </label>
          <label className="grid text-sm font-semibold">
            Recipient email
            <input
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-[#c7b995] bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-[#15294b] focus:ring-2 focus:ring-[#15294b]/15"
              maxLength={254}
              onChange={(event) => setComplimentaryEmail(event.target.value)}
              required
              type="email"
              value={complimentaryEmail}
            />
          </label>
          <button
            className="rounded-xl bg-[#15294b] px-5 py-3 text-sm font-semibold text-[#fffdf8] transition hover:bg-[#263d75] disabled:opacity-50 sm:col-span-2"
            disabled={sendingComplimentary}
            type="submit"
          >
            {sendingComplimentary ? "Issuing ticket…" : "Issue and email free ticket"}
          </button>
          <button
            aria-controls="complimentary-ticket-preview"
            aria-expanded={showComplimentaryPreview}
            className="rounded-xl border border-[#15294b]/30 px-5 py-3 text-sm font-semibold transition hover:bg-[#e8dfcf] sm:col-span-2"
            onClick={() => setShowComplimentaryPreview((visible) => !visible)}
            type="button"
          >
            {showComplimentaryPreview ? "Hide ticket preview" : "Preview complimentary ticket"}
          </button>
        </form>

        {showComplimentaryPreview && (
          <section
            aria-label="Complimentary ticket preview"
            className="mt-5 rounded-2xl border border-[#c7b995]/80 bg-[#fffdf8] p-5 text-[#15294b] sm:p-6"
            id="complimentary-ticket-preview"
          >
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
              Email preview · Sample only
            </p>
            <p className="mt-2 text-sm">
              To: {complimentaryEmail || "recipient@example.com"}
            </p>
            <p className="mt-1 text-sm">
              Hello {complimentaryName.trim() || "Recipient"}, your admission is confirmed.
            </p>

            <article className="mt-5 overflow-hidden rounded-xl border border-[#c7b995]">
              <header className="flex items-center justify-between gap-3 bg-[#15294b] px-4 py-3 text-[10px] font-bold tracking-[.12em] text-[#fffdf8]">
                <span>ADMISSION TICKET</span>
                <span className="text-[#e4c77e]">MSAI · EVENT PASS</span>
              </header>
              <div className="grid gap-5 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#80643a]">
                    Christmas gathering
                  </p>
                  <h3 className="mt-1 font-serif text-xl font-bold">
                    {previewEvent.title}
                  </h3>
                  <p className="mt-3 text-sm font-bold text-[#80643a]">
                    COMPLIMENTARY
                  </p>
                  <p className="mt-1 text-xs">No payment required</p>
                  <p className="mt-3 text-xs">
                    <strong className="text-[#80643a]">Ticket code:</strong>{" "}
                    generated when issued
                  </p>
                  <dl className="mt-4 grid gap-2 text-xs">
                    <div>
                      <dt className="font-bold uppercase tracking-wide text-[#80643a]">Date</dt>
                      <dd>{formatPreviewDate(previewEvent.date)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wide text-[#80643a]">Time</dt>
                      <dd>{previewEvent.time || "To be announced"}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wide text-[#80643a]">Location</dt>
                      <dd>{previewEvent.location || "To be announced"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-[#c7b995] bg-[#f3ecdf] p-4 text-center text-xs text-[#535044] sm:w-40">
                  QR code is generated when issued
                </div>
              </div>
            </article>
            {previewEvent.partyDescription && (
              <p className="mt-4 text-sm leading-6 text-[#535044]">
                <strong>What&apos;s included:</strong> {previewEvent.partyDescription}
              </p>
            )}
          </section>
        )}

        <div aria-live="polite" className="mt-7">
          {actionMessage && (
            <p
              className="mb-4 rounded-xl bg-[#e8dfcf] px-4 py-3 text-sm text-[#15294b]"
              role="status"
            >
              {actionMessage}
            </p>
          )}
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
                    <th className="px-4 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c7b995]/60">
                  {tickets.map((ticket) => (
                    <tr className="bg-[#fffdf8]/70" key={ticket.ticketNumber}>
                      <td className="px-4 py-3 font-semibold">{ticket.name}</td>
                      <td className="break-all px-4 py-3">
                        {ticket.email ?? (ticket.isGateSale ? "Cash at gate" : "—")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            ticket.ticketTier === "earlyBird"
                              ? "bg-[#dce5d6] text-[#24523c]"
                              : ticket.ticketTier === "regular"
                                ? "bg-[#ebe1cd] text-[#71572e]"
                                : ticket.ticketTier === "late" ||
                                    ticket.ticketTier === "atGate" ||
                                    ticket.ticketTier === "lateLate"
                                  ? "bg-[#f0ded6] text-[#923a35]"
                                  : "bg-[#e8dfcf] text-[#62645f]"
                          }`}
                        >
                          {ticket.isComplimentary
                            ? "Complimentary"
                            : ticket.ticketTier
                              ? ticketTierLabels[ticket.ticketTier]
                              : "Older ticket"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#62645f]">
                        {ticket.isGateSale ? (
                          "Cash · admitted"
                        ) : ticket.emailSentAt ? (
                          <time dateTime={ticket.emailSentAt}>
                            {new Intl.DateTimeFormat("en", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(ticket.emailSentAt))}
                          </time>
                        ) : (
                          "Email not sent"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {ticket.isComplimentary && !ticket.emailSentAt && (
                            <button
                              className="rounded-full border border-[#15294b]/30 px-3 py-1.5 text-xs font-semibold hover:bg-[#e8dfcf] disabled:opacity-50"
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
                            className="rounded-full border border-[#923a35]/40 px-3 py-1.5 text-xs font-semibold text-[#923a35] hover:bg-[#f0ded6] disabled:opacity-50"
                            disabled={deletingTicketNumber !== null}
                            onClick={() => void deleteRemovableTicket(ticket)}
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
