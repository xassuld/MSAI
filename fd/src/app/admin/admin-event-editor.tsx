"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { backendApiUrl } from "@/lib/backend-api";

type EventFields = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  posterUrl: string;
  ticketInfo: string;
};

const initialEvent: EventFields = {
  title: "",
  description: "",
  date: "",
  time: "",
  location: "",
  posterUrl: "",
  ticketInfo: "",
};

type CloudinaryUpload = {
  secure_url?: string;
  error?: { message?: string };
};

export default function AdminEventEditor() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [event, setEvent] = useState<EventFields>(initialEvent);
  const [selectedPoster, setSelectedPoster] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`${backendApiUrl}/api/admin/events/christmas`, {
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

  async function handleLogin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${backendApiUrl}/api/admin/login`, {
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
        `${backendApiUrl}/api/admin/events/christmas`,
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
      const signResponse = await fetch(`${backendApiUrl}/api/admin/upload-signature`, {
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
      const response = await fetch(`${backendApiUrl}/api/admin/events/christmas`, {
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
      const response = await fetch(`${backendApiUrl}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not sign out. Please retry.");
      setAuthenticated(false);
      setEvent(initialEvent);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  function updateField(field: keyof EventFields, value: string) {
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
