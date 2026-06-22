"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STATUS_BAR_HIDDEN_STORAGE_KEY = "kapruka-genie-status-bar-hidden";

const services = [
  {
    title: "Chat replies",
    primary: "Novita: Sinhala and Singlish · Groq: English",
    fallback: "Groq fallback for Novita replies",
  },
  {
    title: "Gift messages",
    primary: "Novita: Sinhala and Singlish · Groq: English",
    fallback: "Groq fallback for Novita messages",
  },
];

export default function KaprukaAdminPage() {
  const [isStatusBarHidden, setIsStatusBarHidden] = useState(false);

  useEffect(() => {
    function syncStatusBarPreference() {
      try {
        setIsStatusBarHidden(
          localStorage.getItem(STATUS_BAR_HIDDEN_STORAGE_KEY) === "true",
        );
      } catch {
        setIsStatusBarHidden(false);
      }
    }

    const animationFrame = window.requestAnimationFrame(syncStatusBarPreference);
    window.addEventListener("storage", syncStatusBarPreference);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("storage", syncStatusBarPreference);
    };
  }, []);

  function toggleStatusBar() {
    setIsStatusBarHidden((current) => {
      const next = !current;
      try {
        localStorage.setItem(STATUS_BAR_HIDDEN_STORAGE_KEY, String(next));
      } catch {
        // Keep the setting for this page load if browser storage is unavailable.
      }
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff7bc_0,transparent_28%),linear-gradient(135deg,#fbf9fe_0%,#f1ebf8_100%)] px-4 py-10 text-[#1b1524] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-[#b58d00]">
              Kapruka Genie
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-[#3f246d] sm:text-5xl">
              AI Admin
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#71677e]">
              Sinhala and Singlish chat replies use Novita, while English chat
              replies use Groq. Gift messages follow the same language routing.
            </p>
          </div>
          <Link
            href="/"
            className="w-fit rounded-xl border border-[#d8cce7] bg-white px-4 py-2 text-sm font-black text-[#3f246d]"
          >
            Open shopping app
          </Link>
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          {services.map((service) => (
            <section
              key={service.title}
              className="rounded-3xl border border-[#e9e1f4] bg-white p-6 shadow-[0_20px_60px_rgba(63,36,109,0.08)]"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9b8bae]">
                Fixed provider
              </p>
              <h2 className="mt-2 text-xl font-black text-[#3f246d]">
                {service.title}
              </h2>
              <div className="mt-5 rounded-2xl bg-[#3f246d] p-4 text-white">
                <span className="text-xs font-black uppercase tracking-wider text-[#d8cce7]">
                  Primary
                </span>
                <strong className="mt-1 block">{service.primary}</strong>
              </div>
              <div className="mt-3 rounded-2xl bg-[#f8f5fb] p-4 text-[#3f246d]">
                <span className="text-xs font-black uppercase tracking-wider text-[#9b8bae]">
                  Automatic fallback
                </span>
                <strong className="mt-1 block">{service.fallback}</strong>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-5 flex flex-col justify-between gap-4 rounded-3xl border border-[#e9e1f4] bg-white p-6 shadow-[0_20px_60px_rgba(63,36,109,0.06)] sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9b8bae]">
              Shopping interface
            </p>
            <h2 className="mt-1 text-lg font-black text-[#3f246d]">
              Hide status and error bar
            </h2>
            <p className="mt-1 text-sm text-[#71677e]">
              Controls the status panel beside the See features button.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isStatusBarHidden}
            onClick={toggleStatusBar}
            className="flex h-12 items-center gap-3 self-start rounded-[14px] border border-[#e8e2f2] bg-[#f8f5fb] px-4 text-sm font-black text-[#3f246d] sm:self-auto"
          >
            <span
              className={`relative h-6 w-11 rounded-full transition ${
                isStatusBarHidden ? "bg-[#3f246d]" : "bg-[#d8cce7]"
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isStatusBarHidden ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
            {isStatusBarHidden ? "Hidden" : "Visible"}
          </button>
        </section>

        <section className="mt-5 rounded-3xl border border-[#e9e1f4] bg-white p-6">
          <h2 className="text-lg font-black text-[#3f246d]">Groq fallback setup</h2>
          <p className="mt-1 text-sm text-[#71677e]">
            For Sinhala and Singlish chat, these models supply the visible response
            only if Novita reaches a limit, times out, or returns no usable reply.
          </p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f8f5fb] p-4">
              <strong className="block text-[#3f246d]">Sinhala</strong>
              <span className="mt-1 block break-all text-[#71677e]">
                openai/gpt-oss-120b
              </span>
            </div>
            <div className="rounded-2xl bg-[#f8f5fb] p-4">
              <strong className="block text-[#3f246d]">Singlish</strong>
              <span className="mt-1 block break-all text-[#71677e]">
                llama-3.3-70b-versatile
              </span>
            </div>
            <div className="rounded-2xl bg-[#f8f5fb] p-4">
              <strong className="block text-[#3f246d]">Fast fallback</strong>
              <span className="mt-1 block break-all text-[#71677e]">
                qwen/qwen3.6-27b
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
