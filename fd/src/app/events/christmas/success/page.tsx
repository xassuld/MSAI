import Link from "next/link";

export default function ChristmasCheckoutSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-[#c7b995]/80 bg-[#fffdf8] p-8 text-center text-[#15294b] shadow-[0_30px_90px_rgb(21_41_75/14%)] sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#24523c]">
          MSAI · Christmas event
        </p>
        <h1 className="mt-4 font-serif text-4xl">Payment complete</h1>
        <p className="mt-4 text-sm leading-6 text-[#535044]">
          Your payment is being confirmed. Once verified, your admission ticket
          and QR code will be sent to your email.
        </p>
        <Link
          className="mt-8 inline-flex rounded-full bg-[#15294b] px-5 py-3 text-sm font-semibold text-[#f5efe3] transition hover:bg-[#263d75]"
          href="/events/christmas"
        >
          Return to the event
        </Link>
      </section>
    </main>
  );
}
