import Link from "next/link";

export default function ChristmasSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-[520px] rounded-[30px] border border-[#24523c]/25 bg-[#f7f2e8] px-8 py-12 text-center text-[#15294b] shadow-[0_30px_90px_rgb(21_41_75/14%)]">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#24523c]">
          Payment complete
        </p>
        <h1 className="mt-4 font-serif text-4xl">You&apos;re going!</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#62645f]">
          Your payment was received. Your admission ticket and ticket code will
          arrive by email after the event service confirms your payment.
        </p>
        <Link
          className="mt-8 inline-flex rounded-full bg-[#15294b] px-5 py-3 text-sm font-semibold text-[#f5efe3]"
          href="/events/christmas"
        >
          Back to event
        </Link>
      </section>
    </main>
  );
}
