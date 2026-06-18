import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "Smart shopping chat",
    text: "Describe the recipient, occasion, budget, city, or gift type and Kapruka Genie turns it into live product suggestions.",
  },
  {
    title: "Event and gift box planning",
    text: "Build a guided checklist for parties, office events, birthdays, and curated gift boxes, then shop one item group at a time.",
  },
  {
    title: "Product compare",
    text: "Paste product IDs from live cards and get a clean comparison of price, category, description, and best-fit recommendation.",
  },
  {
    title: "Checkout support",
    text: "Add items to the buy box, confirm delivery details, and create a Kapruka guest checkout link when everything is ready.",
  },
];

const steps = [
  "Start with a natural request like 'find a birthday gift under Rs. 5,000 in Colombo'.",
  "Choose the guided context chips for budget, recipient, occasion, or gift type.",
  "Review the product cards, compare options, and add the best picks to the buy box.",
  "Enter recipient and delivery details, then create the checkout link.",
];

const modeGuides = [
  {
    mode: "Smart Shopping",
    purpose: "Find live Kapruka gift options from a normal chat request.",
    howTo:
      "Type what you need, then add context for budget, recipient, occasion, category, city, or date when prompted. Use product cards to add items to the buy box.",
  },
  {
    mode: "Event Planner",
    purpose: "Plan a party, office event, birthday, or gathering.",
    howTo:
      "Choose event context such as event type, venue, participant count, budget, and occasion. The app suggests one item group at a time, such as cake, flowers, chocolates, snacks, or party packs.",
  },
  {
    mode: "Gift Box Builder",
    purpose: "Create a curated multi-item gift box.",
    howTo:
      "Pick the recipient, gift box theme, item count, budget, and occasion. Use Next item and Suggest more to move through each gift box component.",
  },
  {
    mode: "Product Compare",
    purpose: "Compare two real Kapruka products side by side.",
    howTo:
      "Copy product IDs from Smart Shopping product cards, paste them into Product ID 1 and Product ID 2, then compare price, category, description, stock, and AI recommendation.",
  },
  {
    mode: "Order Tracking",
    purpose: "Check an existing Kapruka order status.",
    howTo:
      "Enter the Kapruka order number from the confirmation email or order completion page. The app returns tracking output and a concise next-step suggestion.",
  },
  {
    mode: "Gift Message",
    purpose: "Write or refine a gift card message.",
    howTo:
      "Choose language, size, and tone, then add suggestions like relationship, occasion, names, or wording style. Generate a default or update the message.",
  },
];

const preferences = [
  {
    title: "User context",
    text: "Budget, recipient, and occasion keep recommendations focused. The left panel stores these preferences per mode so each workflow can continue with the right context.",
  },
  {
    title: "Delivery context",
    text: "City and delivery date are used for delivery checks and checkout. Dates are kept non-past so Kapruka MCP does not reject the request.",
  },
  {
    title: "Language",
    text: "Switch between English, Sinhala, and Singlish. Chat prompts, chips, and generated support text follow the selected language where available.",
  },
  {
    title: "Buy box",
    text: "Add recommended products, review subtotal, delivery fee, total, recipient details, sender details, gift message, and checkout link creation.",
  },
  {
    title: "Voice and image input",
    text: "Use microphone input for spoken requests, speaker output for the latest reply, and image upload to search for visually similar gift ideas.",
  },
  {
    title: "Guided chips",
    text: "Quick chips help continue the flow without typing, including Check delivery, Create order link, Next item, Suggest more, and category shortcuts.",
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-[#f6f4fb] text-[#161226]">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-2xl font-black tracking-normal text-[#3f246d]"
          >
            Kapruka <span className="text-[#ffdf00]">Genie</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/demo-video"
              className="grid h-11 place-items-center rounded-[13px] bg-[#ffdf00] px-4 text-sm font-black text-[#1a0f2e]"
            >
              See demo video
            </Link>
            <Link
              href="/"
              className="grid h-11 place-items-center rounded-[13px] bg-[#3f246d] px-4 text-sm font-black text-white"
            >
              Chat now
            </Link>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-[#7b3fb1]">
              Features and how to use
            </p>
            <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-normal text-[#3f246d] md:text-6xl">
              A guided AI shopping desk for Kapruka gifts
            </h1>
            <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-[#675f79]">
              Kapruka Genie combines chat, live catalog search, delivery checks,
              comparison, event planning, gift message writing, and checkout
              preparation in one focused workspace.
            </p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-[#e8e2f2] bg-white shadow-[0_18px_50px_rgba(44,22,75,0.12)]">
            <Image
              src="/product-images/gift-box.svg"
              alt="Kapruka gift box"
              fill
              priority
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-contain p-8"
            />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[18px] border border-[#e8e2f2] bg-white p-4 shadow-[0_12px_32px_rgba(44,22,75,0.06)]"
            >
              <h2 className="text-lg font-black text-[#3f246d]">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm font-bold leading-6 text-[#675f79]">
                {feature.text}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 rounded-[22px] border border-[#e8e2f2] bg-white p-5 shadow-[0_12px_32px_rgba(44,22,75,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-[#7b3fb1]">
                Modes
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-normal text-[#3f246d]">
                What each mode does
              </h2>
            </div>
            <Link
              href="/"
              className="grid h-11 place-items-center rounded-[13px] bg-[#3f246d] px-4 text-sm font-black text-white"
            >
              Open chat workspace
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {modeGuides.map((item) => (
              <article
                key={item.mode}
                className="rounded-[18px] border border-[#e8e2f2] bg-[#fbf9ff] p-4"
              >
                <h3 className="text-lg font-black text-[#3f246d]">
                  {item.mode}
                </h3>
                <p className="mt-2 text-sm font-black leading-6 text-[#161226]">
                  {item.purpose}
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-[#675f79]">
                  {item.howTo}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 rounded-[22px] border border-[#e8e2f2] bg-white p-5 shadow-[0_12px_32px_rgba(44,22,75,0.06)]">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-[#7b3fb1]">
              Preferences and options
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-normal text-[#3f246d]">
              Controls that shape the shopping flow
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {preferences.map((item) => (
              <article
                key={item.title}
                className="rounded-[18px] border border-[#e8e2f2] bg-[#fbf9ff] p-4"
              >
                <h3 className="text-base font-black text-[#3f246d]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm font-bold leading-6 text-[#675f79]">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 rounded-[22px] border border-[#e8e2f2] bg-white p-5 shadow-[0_12px_32px_rgba(44,22,75,0.06)] md:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-[#7b3fb1]">
              How to
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-normal text-[#3f246d]">
              From request to checkout
            </h2>
          </div>
          <ol className="grid gap-3">
            {steps.map((step, index) => (
              <li
                key={step}
                className="grid grid-cols-[44px_1fr] items-start gap-3 rounded-[16px] bg-[#fbf9ff] p-3 text-sm font-bold leading-6 text-[#675f79]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#3f246d] font-black text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}
