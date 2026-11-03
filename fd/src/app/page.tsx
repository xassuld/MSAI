import Image from "next/image";

type IconName =
  | "about"
  | "events"
  | "signup"
  | "contact"
  | "whatsapp"
  | "instagram"
  | "facebook";
type IconTone = "gold" | "red" | "green" | "blue";

type DirectoryLink = {
  title: string;
  note: string;
  href: string;
  icon: IconName;
  tone: IconTone;
  external?: boolean;
};

const links: DirectoryLink[] = [
  {
    title: "Events",
    note: "See our upcoming event",
    href: "/events/christmas",
    icon: "events",
    tone: "red",
  },
  {
    title: "Sign up",
    note: "Join Mongolian students across Italy",
    href: "https://forms.gle/ji65hGcf4hHHNrvi7",
    icon: "signup",
    tone: "gold",
    external: true,
  },
  {
    title: "Instagram Page",
    note: "Follow along with life and events",
    href: "https://www.instagram.com/msai_imokh?exln=YWF1bGs3cGhkMXVo",
    icon: "instagram",
    tone: "red",
    external: true,
  },
  {
    title: "Facebook Page",
    note: "Find updates from MSAI",
    href: "https://www.facebook.com/profile.php?id=61595879544998",
    icon: "facebook",
    tone: "blue",
    external: true,
  },
  {
    title: "WhatsApp",
    note: "Join the conversation",
    href: "https://chat.whatsapp.com/BP0ZoEL2NO085BauKUmCn7",
    icon: "whatsapp",
    tone: "green",
    external: true,
  },
  {
    title: "About Us",
    note: "Get to know the MSAI community",
    href: "https://www.facebook.com/profile.php?id=61595879544998",
    icon: "about",
    tone: "gold",
    external: true,
  },
  {
    title: "Contact Us",
    note: "Get in touch with the student community",
    href: "https://chat.whatsapp.com/BP0ZoEL2NO085BauKUmCn7",
    icon: "contact",
    tone: "green",
    external: true,
  },
];

function LinkIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    about: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0M19 5v5m-2.5-2.5h5" />
      </>
    ),
    events: (
      <>
        <rect x="4" y="6" width="16" height="15" rx="2" />
        <path d="M8 3v6m8-6v6M4 11h16m-11 4h2m3 0h2m-7 3h2" />
      </>
    ),
    signup: (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </>
    ),
    contact: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-11.3 6.4L4 19l1.1-4.1A7.5 7.5 0 1 1 20 11.5Z" />
        <path d="M9 10a5 5 0 0 0 5 5" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-11.3 6.4L4 19l1.1-4.1A7.5 7.5 0 1 1 20 11.5Z" />
        <path d="M9 9.5c.6 2 2 3.4 4 4" />
      </>
    ),
    instagram: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="17.5" cy="6.8" r=".7" fill="currentColor" stroke="none" />
      </>
    ),
    facebook: (
      <path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h1.7V1.5C17 1.3 15.8 1.2 14.5 1.2 11.4 1.2 9.5 3 9.5 6.3V9H6v4h3.5v8H14Z" />
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="h-[21px] w-[21px] fill-none stroke-current stroke-[1.65] [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function ResourceCard({ link, index }: { link: DirectoryLink; index: number }) {
  return (
    <a
      className="group relative grid min-h-[72px] grid-cols-[44px_minmax(0,1fr)_26px] items-center gap-3 overflow-hidden rounded-[18px] border border-[#b5b4aa] bg-[#f0e9dc] px-3.5 py-3 text-left text-[#15294b] no-underline shadow-[0_5px_14px_rgb(21_41_75/9%)] transition-[transform,border-color,background-color,box-shadow] duration-200 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r before:bg-[#15294b] before:content-[''] hover:-translate-y-0.5 hover:border-[#15294b]/45 hover:bg-[#e9eadf] hover:shadow-[0_9px_20px_rgb(21_41_75/15%)] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#263d75]/40 focus-visible:outline-offset-[3px] max-[480px]:min-h-[68px] max-[480px]:gap-2.5 max-[480px]:px-3"
      href={link.href}
      {...(link.external
        ? { rel: "noopener noreferrer", target: "_blank" }
        : {})}
    >
      <span
        className={`relative grid h-11 w-11 place-items-center rounded-[14px] shadow-inner ${
          link.tone === "green"
            ? "bg-[#dce5d6] text-[#24523c]"
            : link.tone === "red"
              ? "bg-[#f0ded6] text-[#923a35]"
              : link.tone === "gold"
                ? "bg-[#ebe1cd] text-[#71572e]"
                : "bg-[#dfe4eb] text-[#15294b]"
        }`}
      >
        <LinkIcon name={link.icon} />
      </span>
      <span className="relative grid gap-1">
        <span className="text-[13px] font-semibold tracking-[.01em] text-[#15294b]">
          {link.title}
        </span>
        <span className="text-[10px] leading-[1.4] text-[#535044]">
          {link.note}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="relative text-center text-lg text-[#15294b] transition duration-200 group-hover:translate-x-1"
      >
        {link.external ? "↗" : "→"}
      </span>
      {link.external && <span className="sr-only">Opens in a new tab</span>}
      <span className="absolute right-3 top-2 text-[9px] font-semibold tabular-nums text-[#15294b]/50">
        {String(index + 1).padStart(2, "0")}
      </span>
    </a>
  );
}

export default function Home() {
  return (
    <main className="relative flex min-h-screen justify-center overflow-hidden px-5 py-10 sm:py-14 max-[480px]:px-[14px]">
      <div className="relative z-10 my-auto w-full max-w-[540px]">
        <div className="mx-auto mb-5 w-full max-w-[430px] px-4">
          <Image
            alt="Mongolian Students’ Association in Italy — MSAI"
            className="h-auto w-full drop-shadow-[0_8px_14px_rgb(29_37_53/14%)]"
            height={768}
            priority
            sizes="(max-width: 480px) 90vw, 430px"
            src="/msai-logo.png"
            width={1835}
          />
        </div>

        <section
          aria-labelledby="page-title"
          className="relative rounded-[34px] border border-[#15294b]/25 bg-transparent px-9 pb-8 pt-8 text-center shadow-[0_18px_48px_rgb(21_41_75/10%)] before:absolute before:left-10 before:right-10 before:top-0 before:h-[3px] before:rounded-b before:bg-gradient-to-r before:from-[#15294b] before:via-[#c4a66e] before:to-[#15294b] before:content-[''] max-[480px]:rounded-[28px] max-[480px]:px-5 max-[480px]:pb-7 max-[480px]:pt-7"
        >
          <div className="mb-4 flex items-center justify-center gap-3 text-[9px] font-bold uppercase tracking-[.24em] text-[#15294b] before:h-px before:w-7 before:bg-[#15294b]/60 after:h-px after:w-7 after:bg-[#15294b]/60">
            Mongolia <span aria-hidden="true">×</span> Italia
          </div>

          <div aria-label="Mongolian and Italian flags" className="mx-auto mb-5 flex justify-center gap-2">
            <svg
              aria-hidden="true"
              className="h-[18px] w-[30px] overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgb(32_36_42/16%)]"
              viewBox="0 0 30 18"
            >
              <rect width="10" height="18" fill="#c4273a" />
              <rect x="10" width="10" height="18" fill="#0566a9" />
              <rect x="20" width="10" height="18" fill="#c4273a" />
              <circle cx="5" cy="5.1" r="1.15" fill="#f3c94b" />
              <path d="M5 6.8v3.7m-1.6-2h3.2" stroke="#f3c94b" strokeWidth=".75" />
              <path d="M5 10.1a1.3 1.3 0 0 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" fill="none" stroke="#f3c94b" strokeWidth=".65" />
            </svg>
            <svg
              aria-hidden="true"
              className="h-[18px] w-[30px] overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgb(32_36_42/16%)]"
              viewBox="0 0 30 18"
            >
              <rect width="10" height="18" fill="#16845b" />
              <rect x="10" width="10" height="18" fill="#fffdf8" />
              <rect x="20" width="10" height="18" fill="#cf4d4d" />
            </svg>
          </div>

          <h1
            className="font-serif text-[clamp(32px,8vw,42px)] font-medium leading-[1.08] tracking-[-.035em] text-[#15294b]"
            id="page-title"
          >
            Find your people.
          </h1>
          <p className="mx-auto mb-7 mt-3 max-w-[350px] text-[13px] leading-[1.75] text-[#62645f]">
            A little home away from home for Mongolian students across Italy.
            Find us, join in, and stay connected.
          </p>

          <nav
            aria-label="Mongolian Students’ Association in Italy links"
            className="grid gap-2.5"
          >
            {links.map((link, index) => (
              <ResourceCard index={index} key={link.title} link={link} />
            ))}
          </nav>

          <footer className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[9px] font-semibold uppercase tracking-[.17em] text-[#15294b]/75">
            <span className="h-px w-5 bg-[#15294b]/55" />
            Mongolian Students’ Association in Italy
            <span className="h-px w-5 bg-[#15294b]/55" />
          </footer>
        </section>
      </div>
    </main>
  );
}
