import { NextResponse } from "next/server";
import {
  asRecord,
  getNumber,
  getString,
  stripModelThinking,
} from "@/lib/aiPayload";
import {
  fetchGroqChatWithFallback,
  getGroqApiKey,
  getMissingGroqKeyMessage,
  readGroqError,
} from "@/lib/groqHosted";
import { createKaprukaMcpClient } from "@/lib/kaprukaMcp";
import { toKaprukaLocationType } from "@/lib/deliveryLocations";
import { KaprukaSearchProduct, Product, toProduct } from "@/lib/productCatalog";

export const runtime = "nodejs";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

type CommerceRecommendation = {
  id: string;
  fitScore: number;
  reason: string;
};

type MessageIntent = "command" | "conversation" | "question";
type DetectedLanguage = "English" | "Sinhala" | "Singlish";

type PreferenceSnapshot = {
  budget: string | null;
  category: string | null;
  occasion: string | null;
  recipient: string | null;
  requestedGiftType: string | null;
};

type MessageAnalysis = {
  detectedLanguage: DetectedLanguage;
  intent: MessageIntent;
  preferences: PreferenceSnapshot;
  searchQuery: string | null;
};

type ShoppingProfile = {
  budget?: string;
  category?: string;
  city?: string;
  date?: string;
  occasion?: string;
  recipient?: string;
};

type KaprukaSearchResponse = {
  applied_filters?: unknown;
  next_cursor?: string | null;
  result?: string;
  results?: KaprukaSearchProduct[];
};

type KaprukaCityResponse = {
  cities?: Array<{
    aliases?: string[];
    name?: string;
  }>;
};

type KaprukaDeliveryResponse = {
  available?: boolean;
  checked_date?: string;
  city?: string;
  currency?: string;
  next_available_date?: string | null;
  perishable_warning?: string | null;
  rate?: number;
  reason?: string | null;
  result?: string;
};

type KaprukaOrderResponse = {
  checkout_url?: string;
  expires_at?: string;
  order_ref?: string;
  result?: string;
  summary?: {
    addons_total?: number;
    currency?: string;
    delivery_fee?: number;
    grand_total?: number;
    items_total?: number;
  };
};

const COMMON_GIFT_SEARCH_TERMS = ["chocolate", "cake", "flowers"];
const COMMON_GIFT_SEARCH_QUERY = "__common_gifts__";
const PREFERENCE_GIFT_TYPES = [
  "Flowers",
  "Cakes",
  "Chocolate",
  "Electronics",
  "Perfumes",
  "Fashion",
  "Other",
] as const;
const PREFERENCE_BUDGETS = [
  "Under Rs. 2,500",
  "Rs. 2,500 - 5,000",
  "Rs. 5,000 - 10,000",
  "Above Rs. 10,000",
  "Other",
] as const;
const PREFERENCE_OCCASIONS = [
  "Birthday",
  "Anniversary",
  "Wedding",
  "Graduation",
  "Other",
] as const;
const PREFERENCE_RECIPIENTS = [
  "Male",
  "Female",
  "Child",
  "Couple",
  "Other",
] as const;

type BudgetFilter = {
  max_price?: number;
  min_price?: number;
};

type ProductSearchResult = {
  budgetFilter: BudgetFilter;
  exactBudgetMatched: boolean;
  nearbyBudgetLabel?: string;
  requestedBudgetLabel?: string;
  results: KaprukaSearchProduct[];
  usedNearbyBudgetFallback: boolean;
};

type CommerceResponse = {
  analytics: {
    buyBoxHealth: string;
    conversionSignal: string;
    nextBestAction: string;
    risk: string;
  };
  chips: string[];
  eventPlan: string[];
  giftMessage: string;
  mode: string;
  recommendations: CommerceRecommendation[];
  reply: string;
  tracking: string;
};

type CheckoutDetails = {
  address?: string;
  giftMessage?: string;
  instructions?: string;
  locationType?: string;
  recipientName?: string;
  recipientPhone?: string;
  senderName?: string;
};

type GiftMessagePreferences = {
  language?: string;
  size?: string;
  suggestions?: string;
  tone?: string;
};

const fallbackResponse: CommerceResponse = {
  analytics: {
    buyBoxHealth: "Kapruka MCP ready",
    conversionSignal: "Waiting for a catalog match",
    nextBestAction: "Search the live Kapruka catalog",
    risk: "Live catalog results may change",
  },
  chips: [],
  eventPlan: [],
  giftMessage: "",
  mode: "Smart Shopping",
  recommendations: [],
  reply: "I checked the live Kapruka MCP catalog.",
  tracking: "",
};

const giftTypeSearchTerms: Record<string, string> = {
  cake: "cake",
  cakes: "cake",
  chocolate: "chocolate",
  chocolates: "chocolate",
  electronics: "headphones",
  fashion: "watch",
  flowers: "roses",
  food: "chocolate",
  "gift box": "chocolate",
  perfumes: "perfume",
};

const categorySearchTerms: Record<string, string[]> = {
  cakes: ["cake", "cakes", "cupcake"],
  chocolate: ["chocolate", "chocolates", "truffles"],
  electronics: ["electronics", "headphones", "earbuds"],
  fashion: ["fashion", "watch", "wallet", "handbag"],
  flowers: ["flowers", "roses", "bouquet"],
  perfumes: ["perfume", "fragrance", "cologne"],
};

const categoryRelevanceTerms: Record<string, string[]> = {
  cakes: ["cake", "cakes", "cupcake", "cupcakes", "bakery", "gateau"],
  chocolate: ["chocolate", "chocolates", "cocoa", "truffle", "truffles"],
  electronics: [
    "electronic",
    "electronics",
    "headphone",
    "headphones",
    "earphone",
    "earphones",
    "earbud",
    "earbuds",
    "speaker",
    "speakers",
    "charger",
    "power bank",
    "smartwatch",
  ],
  fashion: [
    "fashion",
    "watch",
    "watches",
    "wallet",
    "wallets",
    "handbag",
    "handbags",
    "shirt",
    "dress",
    "clothing",
    "jewelry",
    "jewellery",
    "accessory",
    "accessories",
  ],
  flowers: ["flower", "flowers", "rose", "roses", "bouquet", "floral"],
  perfumes: ["perfume", "perfumes", "fragrance", "fragrances", "cologne", "scent"],
};

function parseStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseChipArray(value: unknown, maxItems: number) {
  return parseStringArray(value, maxItems)
    .filter(
      (chip) =>
        !/\b(check delivery|delivery check|create order link|order link|open checkout|more like this|search products|track order)\b|බෙදාහැරීම|ඇණවුම්\s+සබැඳිය/iu.test(
          chip,
        ),
    )
    .map((chip) => chip.split(/\s+/u).slice(0, 3).join(" "))
    .filter((chip, index, chips) => chips.indexOf(chip) === index);
}

function getLocalDateString(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getNonPastDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const today = getLocalDateString();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today
    ? value
    : today;
}

function parseProfile(value: unknown): ShoppingProfile {
  const record = asRecord(value);

  return {
    budget: getString(record, "budget") ?? undefined,
    category: getString(record, "category") ?? undefined,
    city: getString(record, "city") ?? undefined,
    date: getNonPastDate(getString(record, "date") ?? undefined),
    occasion: getString(record, "occasion") ?? undefined,
    recipient: getString(record, "recipient") ?? undefined,
  };
}

function parseCheckoutDetails(value: unknown): CheckoutDetails {
  const record = asRecord(value);

  return {
    address: getString(record, "address") ?? undefined,
    giftMessage: getString(record, "giftMessage") ?? undefined,
    instructions: getString(record, "instructions") ?? undefined,
    locationType: getString(record, "locationType") ?? undefined,
    recipientName: getString(record, "recipientName") ?? undefined,
    recipientPhone: getString(record, "recipientPhone") ?? undefined,
    senderName: getString(record, "senderName") ?? undefined,
  };
}

function getMissingCheckoutFields(
  cartIds: string[],
  profile: ShoppingProfile,
  checkout: CheckoutDetails,
) {
  const missing: string[] = [];

  if (cartIds.length === 0) missing.push("cart item");
  if (!checkout.recipientName) missing.push("recipient name");
  if (!checkout.recipientPhone) missing.push("recipient phone");
  if (!checkout.address) missing.push("delivery address");
  if (!profile.city) missing.push("delivery city");
  if (!profile.date) missing.push("delivery date");
  if (!checkout.senderName) missing.push("sender name");

  return missing;
}

function parseBudgetFilter(...values: Array<string | undefined>): BudgetFilter {
  const normalized = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/,/g, "");

  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?\s*(k)?/g)]
    .map((match) => {
      const amount = Number(match[0].replace(/[^\d.]/g, ""));
      return Number.isFinite(amount) ? amount * (match[1] ? 1000 : 1) : null;
    })
    .filter((amount): amount is number => amount !== null && amount > 0);

  if (
    /\b(between|from|range)\b/.test(normalized) &&
    numbers.length >= 2
  ) {
    return {
      max_price: Math.max(numbers[0], numbers[1]),
      min_price: Math.min(numbers[0], numbers[1]),
    };
  }

  const upperBudgetAmount = normalized.match(
    /\b(?:under|below|less\s+than|up\s+to|within|max(?:imum)?)\s*(?:rs\.?|lkr)?\s*(\d+(?:\.\d+)?)\s*(k)?/i,
  );
  if (upperBudgetAmount) {
    return {
      max_price:
        Number(upperBudgetAmount[1]) * (upperBudgetAmount[2] ? 1000 : 1),
    };
  }

  const lowerBudgetAmount = normalized.match(
    /\b(?:above|over|higher\s+than|greater\s+than|more\s+than|min(?:imum)?)\s*(?:rs\.?|lkr)?\s*(\d+(?:\.\d+)?)\s*(k)?/i,
  );
  if (lowerBudgetAmount) {
    return {
      min_price:
        Number(lowerBudgetAmount[1]) * (lowerBudgetAmount[2] ? 1000 : 1),
    };
  }

  const explicitBudgetAmount = normalized.match(
    /\bbudget(?:\s+(?:is|of|around|about|approximately|max(?:imum)?))?\s*:?\s*(?:rs\.?|lkr)?\s*(\d+(?:\.\d+)?)\s*(k)?/i,
  );
  const currencyAmount = normalized.match(
    /(?:\b(?:rs\.?|lkr|rupees?)|අයවැය|රුපියල්|රු\.?)\s*:?\s*(\d+(?:\.\d+)?)\s*(k)?/iu,
  );
  const forAmount = normalized.match(
    /\bfor\s+(?:rs\.?|lkr)?\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:rs\.?|lkr|rupees?)?/i,
  );
  const customAmount = explicitBudgetAmount ?? currencyAmount ?? forAmount;

  if (customAmount) {
    const amount = Number(customAmount[1]);
    const forAmountEnd =
      forAmount && typeof forAmount.index === "number"
        ? forAmount.index + forAmount[0].length
        : 0;
    const forAmountRemainder = forAmount
      ? normalized.slice(forAmountEnd).trim()
      : "";
    const isPlausibleForAmount =
      customAmount !== forAmount ||
      /\b(?:rs\.?|lkr|rupees?)\b|\d\s*k\b/i.test(forAmount?.[0] ?? "") ||
      /^[.!?]*$/.test(forAmountRemainder);
    if (Number.isFinite(amount) && amount > 0 && isPlausibleForAmount) {
      return { max_price: amount * (customAmount[2] ? 1000 : 1) };
    }
  }

  if (
    numbers.length >= 2 &&
    (/\b(budget|price|cost|rs\.?|lkr|rupees?)\b/.test(normalized) ||
      /\d\s*-\s*\d/.test(normalized))
  ) {
    return {
      max_price: Math.max(numbers[0], numbers[1]),
      min_price: Math.min(numbers[0], numbers[1]),
    };
  }

  if (
    numbers.length === 1 &&
    numbers[0] >= 100 &&
    /^\s*(?:rs\.?|lkr)?\s*\d+(?:\.\d+)?\s*k?\s*(?:rs\.?|lkr|rupees?)?\s*$/.test(
      normalized,
    )
  ) {
    return { max_price: numbers[0] };
  }

  return {};
}

function hasBudgetFilter(filter: BudgetFilter) {
  return (
    typeof filter.min_price === "number" ||
    typeof filter.max_price === "number"
  );
}

function formatLkrAmount(value: number) {
  return `LKR ${Math.round(value).toLocaleString("en-US")}`;
}

function formatBudgetFilter(filter: BudgetFilter) {
  if (
    typeof filter.min_price === "number" &&
    typeof filter.max_price === "number"
  ) {
    return `${formatLkrAmount(filter.min_price)}-${formatLkrAmount(filter.max_price)}`;
  }

  if (typeof filter.max_price === "number") {
    return `under ${formatLkrAmount(filter.max_price)}`;
  }

  if (typeof filter.min_price === "number") {
    return `above ${formatLkrAmount(filter.min_price)}`;
  }

  return "";
}

function hasAvailableStock(product: Product) {
  return product.stock > 0 || /in stock/i.test(product.stockLabel);
}

function getDeterministicCompareSummary(products: Product[]) {
  const [first, second] = products;

  if (!first || !second) {
    return "I could not compare both products because one product did not load.";
  }

  const sameCategory =
    first.category.trim().toLowerCase() === second.category.trim().toLowerCase();
  const categorySentence = sameCategory
    ? `Both products are in ${first.category}, so the choice is mainly about price, availability, and which description better fits the gift need.`
    : `${first.name} is in ${first.category}, while ${second.name} is in ${second.category}, so they suit different gifting needs.`;

  const firstAvailable = hasAvailableStock(first);
  const secondAvailable = hasAvailableStock(second);
  const stockSentence =
    firstAvailable === secondAvailable
      ? `Availability is similar: ${first.name} is ${first.stockLabel.toLowerCase()} and ${second.name} is ${second.stockLabel.toLowerCase()}.`
      : `${firstAvailable ? first.name : second.name} has the availability advantage because it is ${firstAvailable ? first.stockLabel.toLowerCase() : second.stockLabel.toLowerCase()}, while ${firstAvailable ? second.name : first.name} is ${firstAvailable ? second.stockLabel.toLowerCase() : first.stockLabel.toLowerCase()}.`;

  const priceSentence =
    first.price === second.price
      ? `Both are priced the same at ${formatLkrAmount(first.price)}.`
      : `${first.price < second.price ? first.name : second.name} is cheaper by ${formatLkrAmount(Math.abs(first.price - second.price))}, so ${first.price < second.price ? first.name : second.name} is stronger for budget value, while ${first.price > second.price ? first.name : second.name} needs to justify its higher price through fit, presentation, or category preference.`;

  const preferred = firstAvailable && !secondAvailable
    ? first
    : secondAvailable && !firstAvailable
      ? second
      : first.price <= second.price
        ? first
        : second;
  const alternative = preferred.id === first.id ? second : first;

  return `${categorySentence} ${priceSentence} ${stockSentence} Choose ${preferred.name} if you want the safer pick because it has ${preferred.id === first.id ? "the better price or availability balance" : "the better availability or value balance"} for this comparison. Choose ${alternative.name} instead if its ${alternative.category} category and description match the recipient better, but do not choose it over ${preferred.name} unless that fit matters more than ${preferred.id === first.id ? second.name : first.name}'s price or stock advantage.`;
}

function isProductInsideBudget(product: Product, filter: BudgetFilter) {
  if (product.currency.toUpperCase() !== "LKR") {
    return false;
  }

  if (
    typeof filter.min_price === "number" &&
    product.price < filter.min_price
  ) {
    return false;
  }

  if (
    typeof filter.max_price === "number" &&
    product.price > filter.max_price
  ) {
    return false;
  }

  return true;
}

function getPreferenceSearchTerms(query: string, profile: ShoppingProfile) {
  const category = profile.category?.trim().toLowerCase() ?? "";
  const expandedTerms = categorySearchTerms[category];

  if (expandedTerms) {
    return [...new Set([query, ...expandedTerms].filter(Boolean))];
  }

  return [query];
}

function getPreferenceRelevanceTerms(
  query: string,
  profile: ShoppingProfile,
) {
  const category = profile.category?.trim().toLowerCase() ?? "";

  if (!category) {
    return [];
  }

  const knownCategoryTerms = categoryRelevanceTerms[category];
  if (knownCategoryTerms) {
    return knownCategoryTerms;
  }

  if (category !== "other") {
    return [category];
  }

  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (term) =>
        term.length >= 3 &&
        !/^(gift|gifts|present|presents|personalized|custom|birthday|anniversary|wedding|male|female|child|couple)$/.test(
          term,
        ),
    );
}

function isProductRelevantToPreferences(
  product: KaprukaSearchProduct,
  query: string,
  profile: ShoppingProfile,
) {
  const relevanceTerms = getPreferenceRelevanceTerms(query, profile);

  if (relevanceTerms.length === 0) {
    return true;
  }

  const normalized = toProduct(product);
  if (!normalized) {
    return false;
  }

  const productText = [
    normalized.name,
    normalized.category,
    normalized.description,
  ]
    .join(" ")
    .toLowerCase();

  return relevanceTerms.some((term) => productText.includes(term));
}

function getSearchQuery(query: string, profile: ShoppingProfile, mode: string) {
  const haystack = [query, profile.category, profile.occasion, mode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [key, term] of Object.entries(giftTypeSearchTerms)) {
    if (haystack.includes(key)) {
      return term;
    }
  }

  const cleaned = query
    .replace(
      /\b(find|can|you|me|a|an|gift|for|please|kapruka|budget|recipient|occasion)\b/gi,
      " ",
    )
    .replace(/\b(between|from|to|and|under|below|less|than|above|over|higher|greater|more|rupees?|rs\.?|lkr)\b/gi, " ")
    .replace(/\d+(?:\.\d+)?\s*k?/gi, " ")
    .replace(/\b(male|female|child|couple|birthday|anniversary|wedding)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 120);
  }

  return profile.category || COMMON_GIFT_SEARCH_QUERY;
}

function inferBudgetPreference(message: string) {
  const filter = parseBudgetFilter(message);

  if (!hasBudgetFilter(filter)) {
    return null;
  }

  if (filter.max_price === 2500 && filter.min_price === undefined) {
    return PREFERENCE_BUDGETS[0];
  }

  if (filter.min_price === 2500 && filter.max_price === 5000) {
    return PREFERENCE_BUDGETS[1];
  }

  if (filter.min_price === 5000 && filter.max_price === 10000) {
    return PREFERENCE_BUDGETS[2];
  }

  if (filter.min_price === 10000 && filter.max_price === undefined) {
    return PREFERENCE_BUDGETS[3];
  }

  return PREFERENCE_BUDGETS[4];
}

function normalizeAnalyzedSearchQuery(
  searchQuery: string | null,
  profile: ShoppingProfile,
) {
  const value = searchQuery || profile.category || "";
  const normalized = value.trim().toLowerCase();

  if (
    !normalized ||
    /^(gift|gifts|other|present|presents)$/.test(normalized)
  ) {
    const profileCategory = profile.category?.trim() ?? "";
    const normalizedProfileCategory = profileCategory.toLowerCase();

    if (
      profileCategory &&
      !/^(gift|gifts|other|present|presents)$/.test(
        normalizedProfileCategory,
      )
    ) {
      return giftTypeSearchTerms[normalizedProfileCategory] ?? profileCategory;
    }

    return COMMON_GIFT_SEARCH_QUERY;
  }

  return giftTypeSearchTerms[normalized] ?? value;
}

function inferMessageIntent(query: string): MessageIntent {
  const normalized = query.trim().toLowerCase();

  if (
    normalized.includes("?") ||
    /^(can|could|do|does|how|is|may|should|what|when|where|which|who|why)\b/.test(
      normalized,
    ) ||
    /\b(mokak|mokada|kohomada|koheda|keeyada|puluwanda)\b/.test(normalized)
  ) {
    return "question";
  }

  return normalized ? "command" : "conversation";
}

function inferOccasionPreference(message: string) {
  const normalized = message.toLowerCase();

  if (/\b(birthday|bday)\b/.test(normalized)) return PREFERENCE_OCCASIONS[0];
  if (/\banniversary\b/.test(normalized)) return PREFERENCE_OCCASIONS[1];
  if (/\b(wedding|marriage)\b/.test(normalized)) return PREFERENCE_OCCASIONS[2];
  if (/\b(graduation|graduate)\b/.test(normalized)) return PREFERENCE_OCCASIONS[3];
  if (
    /\b(christmas|new year|valentine(?:'s)? day|mother(?:'s)? day|father(?:'s)? day|housewarming|baby shower|engagement|retirement|farewell|promotion|religious festival)\b/.test(
      normalized,
    )
  ) {
    return PREFERENCE_OCCASIONS[4];
  }

  return null;
}

function inferRecipientPreference(message: string) {
  const normalized = message.toLowerCase();

  if (/\b(couple|parents|mom and dad|husband and wife)\b/.test(normalized)) {
    return PREFERENCE_RECIPIENTS[3];
  }
  if (/\b(child|children|kid|kids|baby|son|daughter|nephew|niece)\b/.test(normalized)) {
    return PREFERENCE_RECIPIENTS[2];
  }
  if (/\b(girlfriend|wife|mother|mom|mum|sister|aunt|aunty|female|lady|girl|her)\b/.test(normalized)) {
    return PREFERENCE_RECIPIENTS[1];
  }
  if (/\b(boyfriend|husband|father|dad|brother|uncle|male|gentleman|boy|him)\b/.test(normalized)) {
    return PREFERENCE_RECIPIENTS[0];
  }
  if (
    /\b(friend|teacher|boss|manager|colleague|coworker|employee|client|customer|neighbor|neighbour|grandparent|grandmother|grandfather|coach|mentor)\b/.test(
      normalized,
    )
  ) {
    return PREFERENCE_RECIPIENTS[4];
  }

  return null;
}

function normalizeDetectedLanguage(
  value: string | null,
  fallback: DetectedLanguage,
): DetectedLanguage {
  return value === "English" || value === "Sinhala" || value === "Singlish"
    ? value
    : fallback;
}

function getNormalizedPreference<T extends readonly string[]>(
  value: string | null,
  options: T,
) {
  if (!value) {
    return null;
  }

  return options.find(
    (option) => option.toLowerCase() === value.trim().toLowerCase(),
  ) ?? null;
}

function getFreshProfile(
  profile: ShoppingProfile,
  preferences: PreferenceSnapshot,
): ShoppingProfile {
  return {
    ...profile,
    budget: preferences.budget ?? undefined,
    category: preferences.category ?? undefined,
    occasion: preferences.occasion ?? undefined,
    recipient: preferences.recipient ?? undefined,
  };
}

function getClientPreferences(profile: ShoppingProfile) {
  return {
    budget: profile.budget ?? "",
    category: profile.category ?? "",
    occasion: profile.occasion ?? "",
    recipient: profile.recipient ?? "",
  };
}

function parseMessageAnalysis(
  text: string,
  fallbackLanguage: DetectedLanguage,
): MessageAnalysis | null {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = asRecord(JSON.parse(jsonText) as unknown);
    const rawIntent = getString(parsed, "intent");
    const intent: MessageIntent =
      rawIntent === "question" ||
      rawIntent === "command" ||
      rawIntent === "conversation"
        ? rawIntent
        : "conversation";
    const rawSearchQuery = getString(parsed, "searchQuery")?.trim() ?? "";
    const searchQuery = rawSearchQuery
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 80);
    const rawPreferences = asRecord(parsed?.preferences);
    const requestedGiftType =
      getString(rawPreferences, "requestedGiftType")
        ?.replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || null;

    return {
      detectedLanguage: fallbackLanguage,
      intent,
      preferences: {
        budget: getNormalizedPreference(
          getString(rawPreferences, "budget"),
          PREFERENCE_BUDGETS,
        ),
        category: getNormalizedPreference(
          getString(rawPreferences, "category"),
          PREFERENCE_GIFT_TYPES,
        ),
        occasion: getNormalizedPreference(
          getString(rawPreferences, "occasion"),
          PREFERENCE_OCCASIONS,
        ),
        recipient: getNormalizedPreference(
          getString(rawPreferences, "recipient"),
          PREFERENCE_RECIPIENTS,
        ),
        requestedGiftType,
      },
      searchQuery: searchQuery || null,
    };
  } catch {
    return null;
  }
}

async function getGroqMessageAnalysis(
  apiKey: string,
  language: string,
  mode: string,
  query: string,
  latestUserMessage: string,
) {
  const { response } = await fetchGroqChatWithFallback(apiKey, {
    model:
      process.env.GROQ_PROCESSING_MODEL ??
      process.env.GROQ_COMMERCE_MODEL ??
      DEFAULT_MODEL,
    messages: [
        {
          role: "system",
          content:
            "Analyze the user's Kapruka shopping request without detecting or inferring its language; selectedLanguage is authoritative and must remain unchanged. Do not inherit preferences from earlier messages. Classify the request as question, command, or conversation. Extract budget, recipient, occasion, and gift type only when explicitly present in the current request; otherwise return null for that preference, and never use Other as a default. Normalize only the four exact preset budget ranges to their matching option. Return budget Other only for an explicitly requested non-preset numeric budget; the original message retains its exact amount for catalog filtering. Return occasion Other only for an explicitly requested occasion outside Birthday, Anniversary, Wedding, or Graduation. Return recipient Other only for an explicitly requested recipient outside Male, Female, Child, or Couple. Normalize known gift types to Flowers, Cakes, Chocolate, Electronics, Perfumes, or Fashion. If the user requests any different specific gift or product type, set category to Other and preserve its short English name in requestedGiftType. Extract that exact requested type as a short English catalog searchQuery, translating when needed. Never use Other as searchQuery. Return JSON only and do not answer the user.",
        },
        {
          role: "user",
          content: JSON.stringify({
            expectedSchema: {
              intent: "question | command | conversation",
              preferences: {
                budget:
                  "Under Rs. 2,500 | Rs. 2,500 - 5,000 | Rs. 5,000 - 10,000 | Above Rs. 10,000 | Other | null",
                category:
                  "Flowers | Cakes | Chocolate | Electronics | Perfumes | Fashion | Other | null",
                occasion:
                  "Birthday | Anniversary | Wedding | Graduation | Other | null",
                recipient: "Male | Female | Child | Couple | Other | null",
                requestedGiftType:
                  "specific English gift type from this message, or null",
              },
              searchQuery: "2-5 English catalog words, or empty string",
            },
            latestUserMessage,
            message: query,
            mode,
            selectedLanguage: language,
          }),
        },
    ],
    temperature: 0,
    max_completion_tokens: 180,
    response_format: { type: "json_object" },
  });

  if (!response.ok) {
    return null;
  }

  const content = getAssistantContent((await response.json()) as unknown);
  return content
    ? parseMessageAnalysis(
        content,
        normalizeDetectedLanguage(language, "English"),
      )
    : null;
}

function parseGiftMessagePreferences(value: unknown): GiftMessagePreferences {
  const record = asRecord(value);

  return {
    language: getString(record, "language") ?? undefined,
    size: getString(record, "size") ?? undefined,
    suggestions: getString(record, "suggestions") ?? undefined,
    tone: getString(record, "tone") ?? undefined,
  };
}

function getAssistantContent(payload: unknown) {
  const choices = asRecord(payload)?.choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const content = getString(message, "content");
  return content ? stripModelThinking(content) : null;
}

function extractJsonObject(text: string) {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return withoutFence.slice(start, end + 1);
}

function parseRecommendations(value: unknown, products: Product[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  const productIds = new Set(products.map((product) => product.id));

  return value
    .map((item) => {
      const record = asRecord(item);
      const id = getString(record, "id");
      const reason = getString(record, "reason");
      const rawFitScore = getNumber(record, "fitScore") ?? 80;
      const fitScore = rawFitScore <= 10 ? rawFitScore * 10 : rawFitScore;

      if (!id || !productIds.has(id)) {
        return null;
      }

      return {
        id,
        fitScore: Math.max(0, Math.min(100, Math.round(fitScore))),
        reason: reason ?? "Good match from the live Kapruka catalog.",
      };
    })
    .filter((item): item is CommerceRecommendation => item !== null)
    .slice(0, 4);
}

function parseCommerceResponse(
  text: string,
  mode: string,
  products: Product[],
): CommerceResponse {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    return {
      ...fallbackResponse,
      mode,
      recommendations: fallbackRecommendations(products),
      reply: stripModelThinking(text),
    };
  }

  try {
    const parsed = asRecord(JSON.parse(jsonText) as unknown);
    const analytics = asRecord(parsed?.analytics);

    return {
      analytics: {
        buyBoxHealth:
          getString(analytics, "buyBoxHealth") ??
          fallbackResponse.analytics.buyBoxHealth,
        conversionSignal:
          getString(analytics, "conversionSignal") ??
          fallbackResponse.analytics.conversionSignal,
        nextBestAction:
          getString(analytics, "nextBestAction") ??
          fallbackResponse.analytics.nextBestAction,
        risk: getString(analytics, "risk") ?? fallbackResponse.analytics.risk,
      },
      chips: parseChipArray(parsed?.chips, 6),
      eventPlan: parseStringArray(parsed?.eventPlan, 8),
      giftMessage: getString(parsed, "giftMessage") ?? "",
      mode: getString(parsed, "mode") ?? mode,
      recommendations: parseRecommendations(parsed?.recommendations, products),
      reply:
        stripModelThinking(getString(parsed, "reply") ?? "") ||
        fallbackResponse.reply,
      tracking: getString(parsed, "tracking") ?? "",
    };
  } catch {
    return {
      ...fallbackResponse,
      mode,
      recommendations: fallbackRecommendations(products),
      reply: stripModelThinking(text),
    };
  }
}

function getNoProductListFallback(language: DetectedLanguage) {
  if (language === "Sinhala") {
    return "ඔබේ ඉල්ලීමට ගැළපෙන options product cards ලෙස පෙන්වා ඇත.";
  }

  if (language === "Singlish") {
    return "Oyage illimata galapena options product cards walin pennanawa.";
  }

  return "Matching options are shown in the product cards.";
}

function sanitizeChatReply(
  reply: string,
  products: Product[],
  language: DetectedLanguage,
) {
  const productReferences = products.flatMap((product) => [
    product.id.trim().toLowerCase(),
    product.name.trim().toLowerCase(),
  ]);
  const isProductSpecific = (value: string) => {
    const normalized = value.toLowerCase();
    return productReferences.some(
      (reference) => reference.length > 0 && normalized.includes(reference),
    );
  };
  const safeSentences = reply
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
    .flatMap((line) => line.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !isProductSpecific(sentence));
  const sanitized = safeSentences.join(" ").replace(/\s+/g, " ").trim();

  return sanitized || getNoProductListFallback(language);
}

function fallbackRecommendations(products: Product[]) {
  return products.slice(0, 3).map((product, index) => ({
    id: product.id,
    fitScore: 92 - index * 4,
    reason: "Matched by Kapruka MCP live product search.",
  }));
}

function orderProductsByRecommendation(
  products: Product[],
  recommendations: CommerceRecommendation[],
) {
  if (recommendations.length === 0) {
    return products.slice(0, 3);
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  return recommendations
    .map((recommendation) => byId.get(recommendation.id))
    .filter((product): product is Product => Boolean(product))
    .slice(0, 3);
}

function getBudgetSearchReply(search: ProductSearchResult, productCount: number) {
  if (!hasBudgetFilter(search.budgetFilter)) {
    return null;
  }

  const requestedBudgetLabel =
    search.requestedBudgetLabel ?? formatBudgetFilter(search.budgetFilter);
  const productLabel = productCount === 1 ? "product" : "products";

  if (search.exactBudgetMatched) {
    return `I found ${productCount} ${productLabel} in ${requestedBudgetLabel}. Prices are in LKR.`;
  }

  if (search.usedNearbyBudgetFallback && productCount > 0) {
    return `No products match in ${requestedBudgetLabel}. I'll show related gifts around ${search.nearbyBudgetLabel ?? "that price"} instead. Prices are in LKR.`;
  }

  return `No products match in ${requestedBudgetLabel}, and I could not find nearby LKR-priced products for this search.`;
}

async function searchKaprukaProducts(
  mcp: Awaited<ReturnType<typeof createKaprukaMcpClient>>,
  query: string,
  profile: ShoppingProfile,
  rawQuery = query,
): Promise<ProductSearchResult> {
  const budgetFilter = parseBudgetFilter(rawQuery, profile.budget);
  const searchTerms =
    query === COMMON_GIFT_SEARCH_QUERY
      ? COMMON_GIFT_SEARCH_TERMS
      : getPreferenceSearchTerms(query, profile);
  const baseParams = {
    currency: "LKR",
    in_stock_only: true,
    limit: 8,
    response_format: "json",
    sort: "relevance",
  };

  async function searchWithParams(filter: BudgetFilter = {}) {
    const responses = await Promise.all(
      searchTerms.map((term) =>
        mcp.callTool<KaprukaSearchResponse>("kapruka_search_products", {
          ...baseParams,
          ...filter,
          q: term,
        }),
      ),
    );
    const seenIds = new Set<string>();

    const rawResults =
      query === COMMON_GIFT_SEARCH_QUERY
        ? responses.flatMap((response) => (response.results?.[0] ? [response.results[0]] : []))
        : responses.flatMap((response) => response.results ?? []);

    return rawResults
      .filter((product) => {
        const id = typeof product.id === "string" ? product.id : null;

        if (!id || seenIds.has(id)) {
          return false;
        }

        seenIds.add(id);
        return true;
      })
      .filter((product) =>
        isProductRelevantToPreferences(product, query, profile),
      )
      .slice(0, 8);
  }

  if (!hasBudgetFilter(budgetFilter)) {
    const results = await searchWithParams();

    return {
      budgetFilter,
      exactBudgetMatched: false,
      results,
      usedNearbyBudgetFallback: false,
    };
  }

  const withBudget = await searchWithParams(budgetFilter);
  const exactResults = withBudget.filter((product) => {
    const normalized = toProduct(product);
    return normalized ? isProductInsideBudget(normalized, budgetFilter) : false;
  });

  if (exactResults.length > 0) {
    return {
      budgetFilter,
      exactBudgetMatched: true,
      requestedBudgetLabel: formatBudgetFilter(budgetFilter),
      results: exactResults,
      usedNearbyBudgetFallback: false,
    };
  }

  return {
    budgetFilter,
    exactBudgetMatched: false,
    requestedBudgetLabel: formatBudgetFilter(budgetFilter),
    results: [],
    usedNearbyBudgetFallback: false,
  };
}

async function getCanonicalCity(
  mcp: Awaited<ReturnType<typeof createKaprukaMcpClient>>,
  city: string,
) {
  const cityResponse = await mcp.callTool<KaprukaCityResponse>(
    "kapruka_list_delivery_cities",
    {
      limit: 1,
      query: city,
      response_format: "json",
    },
  );

  return cityResponse.cities?.[0]?.name ?? city;
}

async function checkDelivery(
  mcp: Awaited<ReturnType<typeof createKaprukaMcpClient>>,
  profile: ShoppingProfile,
  productId?: string,
) {
  if (!profile.city) {
    return null;
  }

  const city = await getCanonicalCity(mcp, profile.city);

  return mcp.callTool<KaprukaDeliveryResponse>("kapruka_check_delivery", {
    city,
    delivery_date: profile.date || null,
    product_id: productId ?? null,
    response_format: "json",
  });
}

async function createCheckoutOrder(
  mcp: Awaited<ReturnType<typeof createKaprukaMcpClient>>,
  cartIds: string[],
  profile: ShoppingProfile,
  checkout: CheckoutDetails,
) {
  const city = await getCanonicalCity(mcp, profile.city ?? "");

  return mcp.callTool<KaprukaOrderResponse>("kapruka_create_order", {
    cart: cartIds.map((productId) => ({
      product_id: productId,
      quantity: 1,
    })),
    currency: "LKR",
    delivery: {
      address: checkout.address,
      city,
      date: profile.date,
      instructions: checkout.instructions || null,
      location_type: toKaprukaLocationType(checkout.locationType),
    },
    gift_message: checkout.giftMessage || null,
    recipient: {
      name: checkout.recipientName,
      phone: checkout.recipientPhone,
    },
    response_format: "json",
    sender: {
      anonymous: false,
      name: checkout.senderName,
    },
  });
}

function getOrderNumber(query: string) {
  return query.match(/\b[A-Z0-9][A-Z0-9_-]{4,48}[A-Z0-9]\b/i)?.[0] ?? null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out.")), timeoutMs),
    ),
  ]);
}

async function searchProductsByIds(
  mcp: Awaited<ReturnType<typeof createKaprukaMcpClient>>,
  productIds: string[],
) {
  const results = await Promise.allSettled(
    productIds.map((productId) =>
      withTimeout(
        mcp.callTool<KaprukaSearchResponse>("kapruka_search_products", {
          currency: "LKR",
          in_stock_only: false,
          limit: 3,
          q: productId,
          response_format: "json",
          sort: "relevance",
        }),
        7000,
      ),
    ),
  );
  const seenIds = new Set<string>();

  return results
    .flatMap((result) =>
      result.status === "fulfilled" ? (result.value.results ?? []) : [],
    )
    .filter((product) => {
      const id = typeof product.id === "string" ? product.id.toUpperCase() : null;

      if (!id || seenIds.has(id)) {
        return false;
      }

      seenIds.add(id);
      return true;
    });
}

async function getGroqCommerce(
  apiKey: string,
  language: DetectedLanguage,
  mode: string,
  task: string,
  query: string,
  products: Product[],
  delivery: KaprukaDeliveryResponse | null,
  profile: ShoppingProfile,
  messageAnalysis: MessageAnalysis,
  searchQuery: string,
  productSearch: ProductSearchResult | null,
) {
  const { response } = await fetchGroqChatWithFallback(apiKey, {
    model:
      process.env.GROQ_PROCESSING_MODEL ??
      process.env.GROQ_COMMERCE_MODEL ??
      DEFAULT_MODEL,
    messages: [
        {
          role: "system",
          content:
            "You are the multilingual reasoning and conversation layer for Kapruka Genie. Product and delivery data already came from the real Kapruka MCP server. The submitted profile is the user's highest-priority requirement: never replace its requested gift type, budget, recipient, or occasion with a different option. Rank only provided products that satisfy those preferences. If no matching catalog products are supplied, clearly say that no exact match was found and ask whether the user wants to change a preference; never propose a substitute category such as mugs when flowers were requested. First respond to the user's actual message: answer a question directly, carry out or specifically acknowledge a command, and respond naturally to conversation. In Event Planner and Gift Box modes, always answer a custom user question or command directly in reply, even while a guided item list is active. Never use 'I updated the products', a translation of it, or another generic UI-update status as the reply. The product cards update separately while you reply. If facts needed to answer are not present in the supplied data, say so briefly or ask one useful clarification instead of inventing facts. Rank only the provided product IDs and never invent catalog products. The reply must be one short paragraph with no bullet list or numbered list. Never include product names, product IDs, prices, or a written list of recommendations in reply because the UI shows products only as cards. For eventPlan and giftBox tasks, return the checklist only in eventPlan, never repeat that checklist in reply. For compare tasks, make reply a direct, useful response for the AI suggestions field without listing products. The selected replyLanguage is authoritative; never detect or switch language from the user's message. Write every user-facing field in replyLanguage: Sinhala uses Sinhala script and Singlish uses Latin script. Generate chips only from the current user message; never add generic delivery, checkout, order-link, or more-like-this chips. Every chip must contain at most three words. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            delivery,
            expectedSchema: {
              analytics: {
                buyBoxHealth: "short status",
                conversionSignal: "short signal",
                nextBestAction: "short action",
                risk: "short risk",
              },
              chips: ["selection up to 3 words"],
              eventPlan: ["optional checklist line"],
              giftMessage: "optional generated message",
              mode: "active mode",
              recommendations: [
                {
                  fitScore: 0,
                  id: "one of the provided Kapruka product ids only",
                  reason: "why this product fits",
                },
              ],
              reply: "concise direct answer to this specific user message",
              tracking: "optional order tracking update",
            },
            mode,
            messageIntent: messageAnalysis.intent,
            requestedGiftType:
              messageAnalysis.preferences.requestedGiftType,
            productCatalogFromKaprukaMcp: products,
            profile,
            query,
            replyLanguage: language,
            searchContext: {
              budgetResult: productSearch
                ? getBudgetSearchReply(productSearch, products.length)
                : null,
              catalogSearchQuery: searchQuery,
            },
            task,
          }),
        },
    ],
    temperature: 0.2,
    max_completion_tokens: 1200,
    response_format: {
      type: "json_object",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response) },
      { status: response.status },
    );
  }

  const content = getAssistantContent((await response.json()) as unknown);

  if (!content) {
    return NextResponse.json(
      { error: "Groq returned an empty commerce response." },
      { status: 502 },
    );
  }

  const commerce = parseCommerceResponse(content, mode, products);

  return {
    ...commerce,
    reply: sanitizeChatReply(commerce.reply, products, language),
  };
}

async function getGroqTrackingSuggestion(
  apiKey: string,
  language: string,
  tracking: string,
) {
  const { response } = await fetchGroqChatWithFallback(apiKey, {
    model:
      process.env.GROQ_PROCESSING_MODEL ??
      process.env.GROQ_COMMERCE_MODEL ??
      DEFAULT_MODEL,
    messages: [
        {
          role: "system",
          content:
            "You give one concise post-order shopping support suggestion. Do not invent tracking facts. Reply in the requested language. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            expectedSchema: { suggestion: "one short next-step suggestion" },
            language,
            tracking,
          }),
        },
    ],
    temperature: 0.2,
    max_completion_tokens: 180,
    response_format: { type: "json_object" },
  });

  if (!response.ok) {
    return "";
  }

  const content = getAssistantContent((await response.json()) as unknown);
  const jsonText = content ? extractJsonObject(content) : null;

  if (!jsonText) {
    return "";
  }

  try {
    return getString(asRecord(JSON.parse(jsonText) as unknown), "suggestion") ?? "";
  } catch {
    return "";
  }
}

async function getGroqCompareSuggestion(
  apiKey: string,
  language: string,
  products: Product[],
) {
  const { response } = await fetchGroqChatWithFallback(apiKey, {
    model:
      process.env.GROQ_PROCESSING_MODEL ??
      process.env.GROQ_COMMERCE_MODEL ??
      DEFAULT_MODEL,
    messages: [
        {
          role: "system",
          content:
            "Give one detailed final comparison paragraph using only the supplied products. Compare product 1 and product 2 tradeoffs, price/value, use case, strengths, weaknesses, and say which is better for which buyer and why. Reply in the requested language. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            expectedSchema: { suggestion: "one long final comparison paragraph for both products" },
            language,
            products: products.map((product) => ({
              category: product.category,
              id: product.id,
              name: product.name,
              price: product.price,
              stock: product.stockLabel,
            })),
          }),
        },
    ],
    temperature: 0.2,
    max_completion_tokens: 420,
    response_format: { type: "json_object" },
  });

  if (!response.ok) {
    return "";
  }

  const content = getAssistantContent((await response.json()) as unknown);
  const jsonText = content ? extractJsonObject(content) : null;

  if (!jsonText) {
    return "";
  }

  try {
    return getString(asRecord(JSON.parse(jsonText) as unknown), "suggestion") ?? "";
  } catch {
    return "";
  }
}

async function getGroqGiftMessage(
  apiKey: string,
  profile: ShoppingProfile,
  preferences: GiftMessagePreferences,
) {
  const { response } = await fetchGroqChatWithFallback(apiKey, {
    model:
      process.env.GROQ_PROCESSING_MODEL ??
      process.env.GROQ_COMMERCE_MODEL ??
      DEFAULT_MODEL,
    messages: [
        {
          role: "system",
          content:
            "Generate one polished gift card message. Use English unless another language is requested. Respect size and tone. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            expectedSchema: { giftMessage: "message text only" },
            preferences,
            profile,
          }),
        },
    ],
    temperature: 0.45,
    max_completion_tokens: 260,
    response_format: { type: "json_object" },
  });

  if (!response.ok) {
    return "";
  }

  const content = getAssistantContent((await response.json()) as unknown);
  const jsonText = content ? extractJsonObject(content) : null;

  if (!jsonText) {
    return "";
  }

  try {
    return getString(asRecord(JSON.parse(jsonText) as unknown), "giftMessage") ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const bodyRecord = asRecord(body);
  const task = getString(bodyRecord, "task") ?? "recommend";
  const mode = getString(bodyRecord, "mode") ?? "Smart Shopping";
  const language = normalizeDetectedLanguage(
    getString(bodyRecord, "language"),
    "English",
  );
  const query = getString(bodyRecord, "query") ?? "";
  const userMessage = getString(bodyRecord, "userMessage") ?? query;
  const preserveProfile = bodyRecord?.preserveProfile === true;
  const cartIds = parseStringArray(bodyRecord?.cartIds, 30);
  const requestedProductIds = parseStringArray(bodyRecord?.productIds, 3);
  const profile = parseProfile(bodyRecord?.profile);
  const checkout = parseCheckoutDetails(bodyRecord?.checkout);
  const giftMessagePreferences = parseGiftMessagePreferences(
    bodyRecord?.giftMessagePreferences,
  );

  try {
    if (task === "giftMessage") {
      const apiKey = getGroqApiKey();
      const message = apiKey
        ? await getGroqGiftMessage(apiKey, profile, giftMessagePreferences)
        : "";

      return NextResponse.json({
        ...fallbackResponse,
        chips: [],
        giftMessage:
          message ||
          "Wishing you a wonderful day filled with love, joy, and beautiful memories.",
        mode,
        products: [],
        reply: "Gift message generated.",
      });
    }

    const mcp = await createKaprukaMcpClient();

    if (task === "checkout") {
      const missingFields = getMissingCheckoutFields(cartIds, profile, checkout);

      if (missingFields.length > 0) {
        return NextResponse.json(
          {
            error: `Add ${missingFields.join(", ")} before creating a Kapruka checkout link.`,
          },
          { status: 400 },
        );
      }

      const order = await createCheckoutOrder(mcp, cartIds, profile, checkout);

      return NextResponse.json({
        ...fallbackResponse,
        analytics: {
          buyBoxHealth: "Checkout link created",
          conversionSignal: "Ready for payment",
          nextBestAction: "Open the Kapruka click-to-pay URL",
          risk: "Checkout link expires after 60 minutes",
        },
        checkout: order,
        chips: [],
        mode,
        products: [],
        reply: order.checkout_url
          ? "Kapruka MCP created a guest-checkout link."
          : (order.result ?? "Kapruka MCP returned checkout details."),
      });
    }

    if (task === "track") {
      const orderNumber = getOrderNumber(query);

      if (!orderNumber) {
        return NextResponse.json({
          ...fallbackResponse,
          chips: [],
          mode,
          products: [],
          tracking:
            "Enter the Kapruka order number from the confirmation email or order complete page.",
        });
      }

      const tracking = await mcp.callTool<{ result?: string }>(
        "kapruka_track_order",
        {
          order_number: orderNumber,
          response_format: "markdown",
        },
      );
      const trackingResult = tracking.result ?? "No tracking update returned.";
      const apiKey = getGroqApiKey();
      const aiSuggestion = apiKey
        ? await getGroqTrackingSuggestion(apiKey, language, trackingResult)
        : "";

      return NextResponse.json({
        ...fallbackResponse,
        analytics: {
          buyBoxHealth: "Tracking lookup complete",
          conversionSignal: "Post-order support",
          nextBestAction: "Share the latest delivery status",
          risk: "Order data depends on paid order number",
        },
        chips: [],
        mode,
        products: [],
        reply: aiSuggestion,
        tracking: trackingResult,
      });
    }

    const productIdsForCompare =
      task === "compare" ? requestedProductIds : [];
    const apiKey = getGroqApiKey();
    const messageAnalysis =
      apiKey && task !== "initial" && productIdsForCompare.length < 2
        ? await withTimeout(
            getGroqMessageAnalysis(
              apiKey,
              language,
              mode,
              query,
              userMessage,
            ),
            6000,
          ).catch(() => null)
        : null;
    const locallyDetectedBudget = inferBudgetPreference(userMessage);
    const locallyDetectedOccasion = inferOccasionPreference(userMessage);
    const locallyDetectedRecipient = inferRecipientPreference(userMessage);
    const resolvedMessageAnalysis: MessageAnalysis = messageAnalysis
      ? {
          ...messageAnalysis,
          detectedLanguage: language,
          preferences: {
            ...messageAnalysis.preferences,
            budget:
              locallyDetectedBudget ?? messageAnalysis.preferences.budget,
            occasion:
              locallyDetectedOccasion ?? messageAnalysis.preferences.occasion,
            recipient:
              locallyDetectedRecipient ?? messageAnalysis.preferences.recipient,
          },
        }
      : {
          detectedLanguage: language,
          intent: inferMessageIntent(query),
          preferences: {
            budget: locallyDetectedBudget,
            category: null,
            occasion: locallyDetectedOccasion,
            recipient: locallyDetectedRecipient,
            requestedGiftType: null,
          },
          searchQuery: null,
        };
    const effectiveProfile = preserveProfile
      ? profile
      : messageAnalysis
        ? getFreshProfile(profile, resolvedMessageAnalysis.preferences)
        : profile;
    const searchQuery =
      productIdsForCompare.length >= 2
        ? productIdsForCompare.join(" ")
        : messageAnalysis
          ? normalizeAnalyzedSearchQuery(
              resolvedMessageAnalysis.searchQuery ||
                resolvedMessageAnalysis.preferences.requestedGiftType,
              effectiveProfile,
            )
          : getSearchQuery(query, effectiveProfile, mode);
    let productSearch: ProductSearchResult | null = null;
    const searchResults =
      productIdsForCompare.length >= 2
        ? await searchProductsByIds(mcp, productIdsForCompare)
        : (productSearch = await searchKaprukaProducts(
            mcp,
            searchQuery,
            effectiveProfile,
            query,
          )).results;
    const products = searchResults
      .map((product) => toProduct(product))
      .filter((product): product is Product => product !== null);

    if (task === "initial") {
      const recommendations = fallbackRecommendations(products);

      return NextResponse.json({
        ...fallbackResponse,
        analytics: {
          buyBoxHealth: "Live Kapruka products loaded",
          conversionSignal: "Starter catalog is ready",
          nextBestAction: "Ask for the gift recipient and budget",
          risk: "Live catalog results may change",
        },
        chips: [],
        delivery: null,
        mcp: {
          endpoint: "https://mcp.kapruka.com/mcp",
          searchQuery,
          tools: ["kapruka_search_products"],
        },
        mode,
        products: products.slice(0, 3),
        recommendations,
        reply: "Kapruka MCP loaded live starter products.",
      });
    }

    if (task === "compare" && productIdsForCompare.length >= 2) {
      if (products.length < 2) {
        return NextResponse.json({
          ...fallbackResponse,
          analytics: {
            buyBoxHealth: "Comparison needs real product IDs",
            conversionSignal: "Missing product match",
            nextBestAction: "Copy IDs from Smart Shopping product cards",
            risk: "One or more IDs did not match live Kapruka products",
          },
          chips: [],
          mode,
          products,
          recommendations: [],
          reply:
            "I could not match two live Kapruka products. Copy the real product IDs shown on product cards in Smart Shopping mode.",
        });
      }

      const apiKey = getGroqApiKey();
      const aiSuggestion = apiKey
        ? await withTimeout(
            getGroqCompareSuggestion(apiKey, language, products.slice(0, 3)),
            6000,
          ).catch(() => "")
        : "";
      const finalComparison =
        aiSuggestion || getDeterministicCompareSummary(products.slice(0, 2));

      return NextResponse.json({
        ...fallbackResponse,
        analytics: {
          buyBoxHealth: "Comparison ready",
          conversionSignal: "User is evaluating products",
          nextBestAction: "Review the AI suggestion field",
          risk: products.length < 2 ? "Some product IDs did not return matches" : "Live catalog can change",
        },
        chips: [],
        mode,
        products: products.slice(0, 3),
        recommendations: products.slice(0, 3).map((product) => ({
          fitScore: 80,
          id: product.id,
          reason: finalComparison,
        })),
        reply: finalComparison,
      });
    }

    const productIdForDelivery = products[0]?.id ?? cartIds[0];
    const delivery = await checkDelivery(
      mcp,
      effectiveProfile,
      productIdForDelivery,
    );

    if (products.length === 0 && !apiKey) {
      return NextResponse.json({
        ...fallbackResponse,
        analytics: {
          buyBoxHealth: "No live products found",
          conversionSignal: "Search needs refinement",
          nextBestAction: "Try another specific keyword",
          risk: "Kapruka MCP returned no purchasable products",
        },
        chips: [],
        delivery,
        mode,
        products: [],
        reply:
          productSearch && hasBudgetFilter(productSearch.budgetFilter)
            ? getBudgetSearchReply(productSearch, 0)
            : `Kapruka MCP did not find products for "${searchQuery}".`,
      });
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: getMissingGroqKeyMessage() },
        { status: 500 },
      );
    }

    const commerce = await getGroqCommerce(
      apiKey,
      resolvedMessageAnalysis.detectedLanguage,
      mode,
      task,
      query,
      products,
      delivery,
      effectiveProfile,
      resolvedMessageAnalysis,
      searchQuery,
      productSearch,
    );

    if (commerce instanceof NextResponse) {
      return commerce;
    }

    const recommendations =
      commerce.recommendations.length > 0
        ? commerce.recommendations
        : fallbackRecommendations(products);
    const recommendationProducts = orderProductsByRecommendation(
      products,
      recommendations,
    );
    const responseProducts =
      task === "compare" ? products.slice(0, 3) : recommendationProducts;
    return NextResponse.json({
      ...commerce,
      chips: commerce.chips,
      delivery,
      detectedLanguage: resolvedMessageAnalysis.detectedLanguage,
      mcp: {
        endpoint: "https://mcp.kapruka.com/mcp",
        searchQuery,
        tools: ["kapruka_search_products", "kapruka_check_delivery"],
      },
      products: responseProducts,
      preferences: getClientPreferences(effectiveProfile),
      recommendations,
      reply: commerce.reply,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kapruka MCP commerce request failed.",
      },
      { status: 502 },
    );
  }
}
