import Link from "next/link";

const tools = [
  {
    href: "/ai-chatbot",
    name: "Chatbot",
    tag: "LLM",
    color: "bg-[#116149]",
  },
  {
    href: "/image-analysis",
    name: "Image analysis",
    tag: "Vision",
    color: "bg-[#1d4ed8]",
  },
  {
    href: "/voice-messages",
    name: "Voice messages",
    tag: "Speech",
    color: "bg-[#b45309]",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-8 text-[#171717] sm:px-6">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase text-black/50">
            MCP AI Shopping Platform
          </span>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
            AI test bench
          </h1>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-lg border border-black/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">{tool.name}</span>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-semibold text-white ${tool.color}`}
                >
                  {tool.tag}
                </span>
              </div>
              <div className="mt-8 flex h-11 items-center justify-center rounded-md border border-black/10 text-sm font-semibold group-hover:bg-black/[.04]">
                Open
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
