"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const adminApiUrl = "/api/admin";

type EventFields = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  posterUrl: string;
  ticketInfo: string;
  partyDescription: string;
  maxCapacity: number;
  soldCount: number;
};

const initialEvent: EventFields = {
  title: "",
  description: "",
  date: "",
  time: "",
  location: "",
  posterUrl: "",
  ticketInfo: "",
  partyDescription: "",
  maxCapacity: 120,
  soldCount: 0,
};

type CloudinaryUpload = {
  secure_url?: string;
  error?: { message?: string };
};

export default function AdminEventEditor() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [event, setEvent] = useState<EventFields>(initialEvent);
  const [sentTicketCount, setSentTicketCount] = useState<number | null>(null);
  const [ticketCountError, setTicketCountError] = useState("");
  const [confirmClearTickets, setConfirmClearTickets] = useState(false);
  const [clearingTickets, setClearingTickets] = useState(false);
  const [clearTicketsMessage, setClearTicketsMessage] = useState("");
  const [selectedPoster, setSelectedPoster] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`${adminApiUrl}/events/christmas`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) return;
        if (!response.ok) {
          throw new Error("Could not check the admin session. Refresh and retry.");
        }

        const data = (await response.json()) as EventFields;
        setEvent(data);
        setAuthenticated(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Could not load the admin page.",
          );
          setMessageIsError(true);
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    let active = true;

    fetch(`${adminApiUrl}/tickets/stats`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string;
          sentTicketCount?: number;
        };
        if (!response.ok || typeof data.sentTicketCount !== "number") {
          throw new Error(data.error ?? "Could not load the sent ticket count.");
        }
        if (active) {
          setSentTicketCount(data.sentTicketCount);
          setTicketCountError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setTicketCountError(
            error instanceof Error
              ? error.message
              : "Could not load the sent ticket count.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [authenticated]);

  async function handleLogin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${adminApiUrl}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not sign in.");
      }

      const eventResponse = await fetch(
        `${adminApiUrl}/events/christmas`,
        {
          cache: "no-store",
          credentials: "include",
        },
      );
      if (!eventResponse.ok) {
        throw new Error("Signed in, but could not load the event. Refresh to retry.");
      }

      setEvent((await eventResponse.json()) as EventFields);
      setAuthenticated(true);
      setPassword("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearTickets() {
    setClearingTickets(true);
    setClearTicketsMessage("");
    try {
      const response = await fetch(`${adminApiUrl}/tickets`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = (await response.json()) as {
        error?: string;
        deletedCount?: number;
      };
      if (!response.ok || typeof result.deletedCount !== "number") {
        throw new Error(result.error ?? "Could not clear the ticket records.");
      }

      setTicketCountError("");
      setConfirmClearTickets(false);
      setClearTicketsMessage(
        `${result.deletedCount} saved ticket ${
          result.deletedCount === 1 ? "record was" : "records were"
        } cleared.`,
      );
    } catch (error) {
      setClearTicketsMessage(
        error instanceof Error ? error.message : "Could not clear the ticket records.",
      );
    } finally {
      setClearingTickets(false);
    }
  }

  async function handlePosterChange(file: File | undefined) {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG, or WebP image up to 10 MB.");
      setMessageIsError(true);
      return;
    }

    setSelectedPoster(file);
    setBusy(true);
    setMessage("");

    try {
      const signResponse = await fetch(`${adminApiUrl}/upload-signature`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: file.type, size: file.size }),
      });
      const signature = (await signResponse.json()) as {
        error?: string;
        cloudName?: string;
        apiKey?: string;
        timestamp?: number;
        folder?: string;
        signature?: string;
      };

      if (!signResponse.ok || !signature.cloudName || !signature.apiKey) {
        throw new Error(signature.error ?? "Could not prepare the poster upload.");
      }

      const formData = new FormData();
      formData.set("file", file);
      formData.set("api_key", signature.apiKey);
      formData.set("timestamp", String(signature.timestamp));
      formData.set("folder", signature.folder ?? "");
      formData.set("signature", signature.signature ?? "");

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`,
        { method: "POST", body: formData },
      );
      const upload = (await uploadResponse.json()) as CloudinaryUpload;

      if (!uploadResponse.ok || !upload.secure_url) {
        throw new Error(upload.error?.message ?? "Cloudinary could not upload the poster.");
      }

      setEvent((current) => ({ ...current, posterUrl: upload.secure_url! }));
      setMessage("Poster uploaded. Save the event to publish it.");
      setMessageIsError(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Poster upload failed.");
      setMessageIsError(true);
      setSelectedPoster(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${adminApiUrl}/events/christmas`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      const result = (await response.json()) as EventFields & { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not save the event.");
      }

      setEvent(result);
      setSelectedPoster(null);
      setMessage("Event saved. The event page is now updated.");
      setMessageIsError(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the event.");
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      const response = await fetch(`${adminApiUrl}/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not sign out. Please retry.");
      setAuthenticated(false);
      setEvent(initialEvent);
      setSentTicketCount(null);
      setTicketCountError("");
      setMessage("");
      router.push("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  function updateField(field: keyof EventFields, value: string | number) {
    setEvent((current) => ({ ...current, [field]: value }));
  }

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-[#c7b995] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#15294b] outline-none transition focus:border-[#15294b] focus:ring-2 focus:ring-[#15294b]/15";

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
              MSAI · Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl text-[#15294b]">
              Christmas event
            </h1>
            <p className="mt-2 text-sm text-[#62645f]">
              Update the public invitation and event poster.
            </p>
          </div>
          {authenticated && (
            <button
              className="rounded-full border border-[#15294b]/20 px-3 py-2 text-xs font-semibold text-[#15294b] hover:bg-[#e8dfd0] disabled:opacity-50"
              disabled={busy}
              onClick={handleLogout}
              type="button"
            >
              Sign out
            </button>
          )}
        </div>

        {checkingSession ? (
          <p aria-live="polite" className="py-8 text-center text-sm text-[#62645f]">
            Checking admin session…
          </p>
        ) : !authenticated ? (
          <form className="grid gap-5" onSubmit={handleLogin}>
            <label className="grid text-sm font-semibold text-[#15294b]">
              Admin password
              <input
                autoComplete="current-password"
                className={fieldClass}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button
              className="rounded-xl bg-[#15294b] px-5 py-3.5 text-sm font-semibold text-[#f5efe3] transition hover:bg-[#263d75] disabled:opacity-50"
              disabled={busy}
              type="submit"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <>
            <section
              aria-live="polite"
              className="mb-6 rounded-2xl border border-[#24523c]/20 bg-[#dce5d6] px-5 py-4 text-[#24523c]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[.16em]">
                Paid tickets emailed
              </p>
              {sentTicketCount === null ? (
                <p
                  aria-live="polite"
                  className="mt-1 text-sm"
                  role={ticketCountError ? "alert" : "status"}
                >
                  {ticketCountError || "Loading sent ticket count…"}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {sentTicketCount}{" "}
                  <span className="text-sm font-medium">
                    {sentTicketCount === 1 ? "ticket has" : "tickets have"} been
                    emailed
                  </span>
                </p>
              )}
              <p className="mt-2 text-xs text-[#24523c]/75">
                Counts successful ticket emails from when tracking was enabled;
                earlier sends aren’t recorded.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-[#24523c]/15 pt-4">
                <Link
                  className="inline-flex items-center rounded-full border border-[#24523c]/30 px-4 py-2 text-xs font-semibold text-[#24523c] transition hover:bg-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24523c]"
                  href="/admin/tickets"
                >
                  View recipients
                </Link>
                <button
                  className="inline-flex items-center rounded-full border border-[#923a35]/30 px-4 py-2 text-xs font-semibold text-[#923a35] transition hover:bg-[#f0ded6]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#923a35] disabled:opacity-50"
                  disabled={clearingTickets}
                  onClick={() => {
                    setClearTicketsMessage("");
                    setConfirmClearTickets(true);
                  }}
                  type="button"
                >
                  Clear unpaid legacy tickets
                </button>
              </div>
              {confirmClearTickets && (
                <div
                  aria-labelledby="clear-tickets-title"
                  className="mt-4 rounded-xl border border-[#923a35]/25 bg-[#f0ded6]/60 p-4 text-[#923a35]"
                  role="group"
                >
                  <p className="text-sm font-semibold" id="clear-tickets-title">
                    Delete legacy unpaid ticket records?
                  </p>
                  <p className="mt-1 text-xs">
                    Paid tickets and the sold count are retained. This cannot be undone.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-full bg-[#923a35] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={clearingTickets}
                      onClick={() => void handleClearTickets()}
                      type="button"
                    >
                      {clearingTickets ? "Clearing…" : "Confirm clear all"}
                    </button>
                    <button
                      className="rounded-full border border-[#923a35]/30 px-4 py-2 text-xs font-semibold disabled:opacity-50"
                      disabled={clearingTickets}
                      onClick={() => setConfirmClearTickets(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {clearTicketsMessage && (
                <p
                  aria-live="polite"
                  className={`mt-3 text-xs ${
                    clearTicketsMessage.startsWith("Could not")
                      ? "text-[#923a35]"
                      : "text-[#24523c]"
                  }`}
                  role={
                    clearTicketsMessage.startsWith("Could not")
                      ? "alert"
                      : "status"
                  }
                >
                  {clearTicketsMessage}
                </p>
              )}
            </section>
            <form className="grid gap-5" onSubmit={handleSave}>
            <label className="grid text-sm font-semibold text-[#15294b]">
              Event title
              <input
                className={fieldClass}
                maxLength={120}
                onChange={(event) => updateField("title", event.target.value)}
                required
                value={event.title}
              />
            </label>

            <label className="grid text-sm font-semibold text-[#15294b]">
              Description
              <textarea
                className={`${fieldClass} min-h-28 resize-y`}
                maxLength={2000}
                onChange={(event) => updateField("description", event.target.value)}
                rows={4}
                value={event.description}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid text-sm font-semibold text-[#15294b]">
                Date
                <input
                  className={fieldClass}
                  onChange={(event) => updateField("date", event.target.value)}
                  type="date"
                  value={event.date}
                />
              </label>
              <label className="grid text-sm font-semibold text-[#15294b]">
                Time
                <input
                  className={fieldClass}
                  maxLength={40}
                  onChange={(event) => updateField("time", event.target.value)}
                  placeholder="e.g. 18:30"
                  value={event.time}
                />
              </label>
            </div>

            <label className="grid text-sm font-semibold text-[#15294b]">
              Location
              <input
                className={fieldClass}
                maxLength={240}
                onChange={(event) => updateField("location", event.target.value)}
                placeholder="City, venue, or address"
                value={event.location}
              />
            </label>

            <label className="grid text-sm font-semibold text-[#15294b]">
              Ticket information
              <textarea
                className={`${fieldClass} min-h-24 resize-y`}
                maxLength={1000}
                onChange={(event) => updateField("ticketInfo", event.target.value)}
                rows={3}
                value={event.ticketInfo}
              />
            </label>

            <label className="grid text-sm font-semibold text-[#15294b]">
              Party description
              <textarea
                className={`${fieldClass} min-h-24 resize-y`}
                maxLength={2000}
                onChange={(event) => updateField("partyDescription", event.target.value)}
                placeholder="What is included with admission?"
                rows={3}
                value={event.partyDescription}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid text-sm font-semibold text-[#15294b]">
                Maximum capacity
                <input
                  className={`${fieldClass} bg-[#e8dfcf]`}
                  readOnly
                  type="number"
                  value={120}
                />
              </label>
              <label className="grid text-sm font-semibold text-[#15294b]">
                Paid tickets sold
                <input
                  className={`${fieldClass} bg-[#e8dfcf]`}
                  disabled
                  type="number"
                  value={event.soldCount}
                />
              </label>
            </div>

            <fieldset className="grid gap-3 rounded-2xl border border-[#c7b995] bg-[#fffdf8]/60 p-4">
              <legend className="px-1 text-sm font-semibold text-[#15294b]">
                Ticket pricing by tickets sold
              </legend>
              <p className="text-sm text-[#15294b]">Tickets 1–25: Early Bird · €18</p>
              <p className="text-sm text-[#15294b]">Tickets 26–75: Regular · €22</p>
              <p className="text-sm text-[#15294b]">Tickets 76–120: Late · €26</p>
            </fieldset>

            <div className="grid gap-2 text-sm font-semibold text-[#15294b]">
              <span>Event poster</span>
              <label className="grid cursor-pointer place-items-center rounded-2xl border border-dashed border-[#15294b]/35 bg-[#fffdf8]/70 p-5 text-center transition hover:bg-[#fffdf8]">
                <span className="text-sm">Choose JPG, PNG, or WebP</span>
                <span className="mt-1 text-xs font-normal text-[#62645f]">
                  Maximum file size: 10 MB. Uploads to Cloudinary.
                </span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) =>
                    void handlePosterChange(event.target.files?.[0])
                  }
                  type="file"
                />
              </label>
              {selectedPoster && (
                <p className="text-xs font-normal text-[#62645f]">
                  Selected: {selectedPoster.name}
                </p>
              )}
              {event.posterUrl && (
                <>
                  <div className="overflow-hidden rounded-xl border border-[#c7b995] bg-white">
                    <Image
                      alt="Current event poster"
                      className="max-h-72 w-full object-contain"
                      height={720}
                      src={event.posterUrl}
                      unoptimized
                      width={540}
                    />
                  </div>
                  <button
                    className="w-fit rounded-full border border-[#923a35]/35 px-4 py-2 text-xs font-semibold text-[#923a35] transition hover:bg-[#f0ded6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#923a35] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      setEvent((current) => ({ ...current, posterUrl: "" }));
                      setSelectedPoster(null);
                      setMessage("Picture removed. Save the event to publish the change.");
                      setMessageIsError(false);
                    }}
                    type="button"
                  >
                    Remove picture
                  </button>
                </>
              )}
            </div>

            <button
              className="rounded-xl bg-[#15294b] px-5 py-3.5 text-sm font-semibold text-[#f5efe3] transition hover:bg-[#263d75] disabled:opacity-50"
              disabled={busy}
              type="submit"
            >
              {busy ? "Saving…" : "Save event"}
            </button>
            <a
              className="text-center text-xs font-semibold text-[#15294b] underline underline-offset-4"
              href="/events/christmas"
              rel="noreferrer"
              target="_blank"
            >
              Preview public event page
            </a>
            </form>
          </>
        )}

        {message && (
          <p
            aria-live="polite"
            className={`mt-5 rounded-xl px-4 py-3 text-sm ${
              messageIsError
                ? "bg-[#f0ded6] text-[#923a35]"
                : "bg-[#dce5d6] text-[#24523c]"
            }`}
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
