import Link from "next/link";

function getDriveEmbedUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const fileMatch = trimmed.match(/\/file\/d\/([^/]+)/);
  const queryMatch = trimmed.match(/[?&]id=([^&]+)/);
  const id = fileMatch?.[1] ?? queryMatch?.[1];

  if (id) {
    return `https://drive.google.com/file/d/${id}/preview`;
  }

  return trimmed;
}

const demoVideoUrl = getDriveEmbedUrl(
  process.env.NEXT_PUBLIC_DEMO_VIDEO_EMBED_URL ?? "",
);

export default function DemoVideoPage() {
  return (
    <main className="min-h-screen bg-[#f6f4fb] text-[#161226]">
      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-4 md:gap-8 md:px-8 md:py-6">
        <header className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
          <Link
            href="/"
            className="text-2xl font-black tracking-normal text-[#3f246d]"
          >
            Kapruka <span className="text-[#ffdf00]">Genie</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/features"
              className="grid h-11 place-items-center rounded-[13px] border border-[#e8e2f2] bg-white px-4 text-sm font-black text-[#3f246d]"
            >
              See features
            </Link>
            <Link
              href="/"
              className="grid h-11 place-items-center rounded-[13px] bg-[#3f246d] px-4 text-sm font-black text-white"
            >
              Chat now
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-[#7b3fb1]">
              Demo video
            </p>
            <h1 className="mt-1.5 max-w-3xl text-3xl font-black tracking-normal text-[#3f246d] md:mt-2 md:text-6xl">
              Watch Kapruka Genie in action
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[#675f79] md:mt-4 md:text-base md:leading-7">
              See how a shopping request becomes product cards, guided context,
              comparisons, gift messages, and checkout preparation.
            </p>
          </div>

          <section className="overflow-hidden rounded-[22px] border border-[#e8e2f2] bg-white shadow-[0_18px_50px_rgba(44,22,75,0.12)]">
            <div className="flex justify-end border-b border-[#e8e2f2] bg-[#fbf9ff] px-4 py-3">
              <Link
                href={demoVideoUrl || "#"}
                className="grid h-11 place-items-center rounded-[13px] bg-[#3f246d] px-4 text-sm font-black text-white"
                target={demoVideoUrl ? "_blank" : undefined}
                rel={demoVideoUrl ? "noreferrer" : undefined}
                aria-disabled={!demoVideoUrl}
              >
                Open preview
              </Link>
            </div>
            <div className="aspect-video bg-[linear-gradient(135deg,#3f246d_0%,#7b3fb1_48%,#ffdf00_100%)] p-1">
              {demoVideoUrl ? (
                <iframe
                  src={demoVideoUrl}
                  title="Kapruka Genie demo video"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full rounded-[18px] border-0 bg-black"
                />
              ) : (
                <div className="grid h-full place-items-center rounded-[18px] bg-white/92 p-6 text-center">
                  <div>
                    <p className="text-2xl font-black text-[#3f246d]">
                      Demo video player
                    </p>
                    <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-[#675f79]">
                      Add your Google Drive video URL to
                      `NEXT_PUBLIC_DEMO_VIDEO_EMBED_URL` and this page will
                      render it as an embedded player.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
