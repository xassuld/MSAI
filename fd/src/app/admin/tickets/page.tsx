"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import AdminNavigation from "../admin-navigation";

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
  ticketPrices: {
    atGate: number;
  };
};

export default function AdminTicketsPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
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
    ticketPrices: { atGate: 2800 },
  });

  function formatPreviewDate(date: string): string {
    if (!date) return "To be announced";
    return new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
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
        ticket?: SentTicketRecipient & { amountPaidCents?: number };
      };
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
        ticket?: SentTicketRecipient & { amountPaidCents?: number };
      };
      if (!response.ok) throw new Error(result.error ?? "Could not issue gate ticket.");
      if (!result.ticket) throw new Error("The server did not return the issued gate ticket.");
      setGateName("");
      setActionMessage(
        `${new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(
          (result.ticket.amountPaidCents ?? previewEvent.ticketPrices.atGate) / 100,
        )} cash ticket #${result.ticket.ticketNumber} issued for ${result.ticket.name}. Entry authorized.`,
      );
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not issue gate ticket.",
      );
    } finally {
      setIssuingGateTicket(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetch(`${adminApiUrl}/events/christmas`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (eventResponse) => {
        const eventResult = (await eventResponse.json()) as Partial<TicketPreviewEvent> & {
          error?: string;
        };

        if (eventResponse.status === 401) {
          if (active) setRequiresLogin(true);
          return;
        }
        if (
          !eventResponse.ok ||
          typeof eventResult.title !== "string" ||
          typeof eventResult.date !== "string" ||
          typeof eventResult.time !== "string" ||
          typeof eventResult.location !== "string" ||
          typeof eventResult.partyDescription !== "string" ||
          !eventResult.ticketPrices
        ) {
          throw new Error(eventResult.error ?? "Could not load ticket preview details.");
        }
        if (active) {
          setPreviewEvent({
            title: eventResult.title,
            date: eventResult.date,
            time: eventResult.time,
            location: eventResult.location,
            partyDescription: eventResult.partyDescription,
            ticketPrices: eventResult.ticketPrices,
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

  useEffect(() => {
    if (requiresLogin) router.replace("/admin");
  }, [requiresLogin, router]);

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
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 text-[#15294b] shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
              MSAI · Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl text-[#15294b]">
              Ticket tools
            </h1>
            <p className="mt-2 text-sm text-[#62645f]">
              Issue tickets or browse attendee records.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#15294b] px-5 py-3 text-sm font-semibold text-[#fffdf8] transition hover:bg-[#263d75] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15294b]"
            href="/admin/tickets/list"
          >
            See list
          </Link>
        </div>
        <AdminNavigation active="recipients" />
        <p className="mt-2 text-xs leading-relaxed text-[#62645f]">
          Tickets can be deleted from the recipient list. Deleting a paid ticket
          invalidates it and reopens its capacity spot without issuing a refund.
          Complimentary tickets do not affect paid capacity.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
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

        <form
          className="mt-7 grid gap-4 rounded-2xl border border-[#923a35]/30 bg-[#f0ded6]/60 p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={issueGateTicket}
        >
          <div className="sm:col-span-2">
            <h2 className="font-serif text-xl">
              Cash-only At-gate ·{" "}
              {new Intl.NumberFormat("en", {
                style: "currency",
                currency: "EUR",
              }).format(previewEvent.ticketPrices.atGate / 100)}
            </h2>
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
          {error && (
            <p className="rounded-xl bg-[#f0ded6] px-4 py-3 text-sm text-[#923a35]" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
