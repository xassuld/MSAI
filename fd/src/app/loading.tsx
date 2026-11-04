import Image from "next/image";

export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center px-5 py-12 max-[480px]:px-[14px]"
    >
      <section
        aria-labelledby="loading-title"
        className="w-full max-w-[460px] rounded-[30px] border border-[#c7b995]/80 bg-[#f7f2e8] px-8 py-12 text-center text-[#15294b] shadow-[0_30px_90px_rgb(21_41_75/14%)] sm:px-12"
      >
        <Image
          alt="Mongolian Students’ Association in Italy"
          className="mx-auto mb-8 h-auto w-full max-w-[260px]"
          height={768}
          priority
          src="/msai-logo.png"
          width={1835}
        />
        <div
          aria-hidden="true"
          className="mx-auto mb-6 h-10 w-10 motion-safe:animate-spin rounded-full border-[3px] border-[#15294b]/15 border-t-[#24523c]"
        />
        <h1
          className="font-serif text-3xl font-medium tracking-[-.03em]"
          id="loading-title"
        >
          Getting things ready
        </h1>
        <p className="mx-auto mt-3 max-w-[340px] text-sm leading-relaxed text-[#62645f]">
          This page is taking a little longer to load. Please wait a moment; it
          can take up to 30 seconds when our service is starting up.
        </p>
        <p className="mt-8 text-[9px] font-semibold uppercase tracking-[.17em] text-[#24523c]">
          Mongolia <span className="px-1 text-[#c59d50]">×</span> Italia
        </p>
      </section>
    </main>
  );
}
