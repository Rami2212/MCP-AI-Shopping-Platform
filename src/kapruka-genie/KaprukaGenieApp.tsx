"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { stripModelThinking } from "@/lib/aiPayload";
import { deliveryCities, locationTypes } from "@/lib/deliveryLocations";
import { formatPrice, Product } from "@/lib/productCatalog";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  retryContext?: boolean;
  retryReason?: "timeout";
  retryText?: string;
  variant?: "context-panel";
};

type IconName =
  | "box"
  | "camera"
  | "cart"
  | "check"
  | "gift"
  | "heart"
  | "menu"
  | "mic"
  | "plus"
  | "search"
  | "send"
  | "settings"
  | "speaker"
  | "sparkles"
  | "trash"
  | "truck"
  | "x";

type CommerceResponse = {
  analytics?: {
    buyBoxHealth?: string;
    conversionSignal?: string;
    nextBestAction?: string;
    risk?: string;
  };
  chips?: string[];
  detectedLanguage?: Language;
  eventPlan?: string[];
  extendedPreferences?: ExtendedPreferences;
  giftMessage?: string;
  preferences?: {
    budget: string;
    category: string;
    occasion: string;
    recipient: string;
  };
  products?: Product[];
  recommendations?: Array<{
    id: string;
    fitScore: number;
    reason: string;
  }>;
  reply?: string;
  delivery?: {
    available?: boolean;
    checked_date?: string;
    city?: string;
    currency?: string;
    next_available_date?: string | null;
    perishable_warning?: string | null;
    rate?: number;
    reason?: string | null;
  } | null;
  checkout?: {
    checkout_url?: string;
    expires_at?: string;
    order_ref?: string;
    result?: string;
    summary?: {
      currency?: string;
      delivery_fee?: number;
      grand_total?: number;
      items_total?: number;
    };
  };
  tracking?: string;
};

function getCheckoutResponseMessage(data: CommerceResponse) {
  return (
    data.checkout?.result ??
    data.reply ??
    "Kapruka returned checkout details without a checkout link."
  );
}

type CompareRow = {
  product: Product;
  suggestion: string;
};

type GuidedPlanItem = {
  label: string;
  quantity: string;
  searchTerm: string;
};

type SuggestedPrompt = {
  action: "fill" | "custom";
  text: string;
};

type GiftMessagePreferences = {
  language: string;
  size: string;
  suggestions: string;
  tone: string;
};

type ImageResponse = {
  error?: string;
  fallback?: boolean;
  model?: string;
  productHints?: string[];
  searchQuery?: string;
  summary?: string;
  visibleText?: string[];
};

type VoiceResponse = {
  error?: string;
  language?: "en";
  retry?: boolean;
  transcript?: string;
};

type RequiredField = "budget" | "recipient" | "occasion";

type ContextField =
  | RequiredField
  | "boxRecipient"
  | "category"
  | "eventType"
  | "giftBoxTheme"
  | "itemCount"
  | "participants"
  | "venue";

type ContextDraft = Record<ContextField, string>;

type Language = "English" | "Sinhala" | "Singlish" | "Tanglish";

type ShoppingProfile = {
  budget: string;
  category: string;
  city: string;
  date: string;
  interests: string;
  occasion: string;
  recipient: string;
};

type ExtendedPreferences = {
  budget: string;
  giftType: string;
  occasion: string;
  recipient: string;
  lastRepliedCount: number;
  replyCount: number;
};

type ContextAnalysisResponse = {
  budget?: string | null;
  category?: string | null;
  detectedLanguage?: Language;
  error?: string;
  missingFields?: RequiredField[];
  occasion?: string | null;
  recipient?: string | null;
};

type StoredChatState = {
  chips: string[];
  contextDraft: ContextDraft;
  conversationStage: "first-message" | "collecting-context" | "ready";
  extendedPreferences?: ExtendedPreferences;
  fitReasons?: Record<string, string>;
  input: string;
  language: Language;
  messages: ChatMessage[];
  pendingUserRequest: string;
  profile: ShoppingProfile;
  buyBox?: Product[];
  recommendedProducts?: Product[];
  activeMode?: string;
  modeSessions?: Record<string, ModeSession>;
};

type ModeSession = {
  chips: string[];
  contextDraft: ContextDraft;
  conversationStage: "first-message" | "collecting-context" | "ready";
  extendedPreferences?: ExtendedPreferences;
  fitReasons?: Record<string, string>;
  input: string;
  messages: ChatMessage[];
  pendingUserRequest: string;
  profile: ShoppingProfile;
  recommendedProducts?: Product[];
};

const modes = [
  { name: "Smart Shopping", icon: "cart" },
  { name: "Event Planner", icon: "sparkles" },
  { name: "Gift Box Builder", icon: "gift" },
  { name: "Product Compare", icon: "search" },
  { name: "Order Tracking", icon: "truck" },
  { name: "Gift Message", icon: "heart" },
] satisfies Array<{ icon: IconName; name: string }>;

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hello! ආයුබෝවන්! Ayubowan! I am Kapruka Genie. 💫 Tell me what you are looking for, and I will guide the gift details. 😊",
  },
];

const starterChips = [
  "Find a gift",
  "Find a cake",
  "Find flowers",
  "Find chocolates",
  "Find perfume",
];

const starterChipGiftTypes: Record<string, string> = {
  "Find a cake": "Cakes",
  "Find chocolates": "Chocolate",
  "Find flowers": "Flowers",
  "Find perfume": "Perfumes",
};

const languageOptions: Language[] = ["English", "Sinhala", "Singlish", "Tanglish"];

const languageLabels: Record<Language, string> = {
  English: "English",
  Sinhala: "සිංහල",
  Singlish: "Singlish",
  Tanglish: "Tanglish",
};

const starterMessagesByLanguage: Record<Language, ChatMessage[]> = {
  English: starterMessages,
  Sinhala: [
    {
      role: "assistant",
      content:
        "Ayubowan! මම Kapruka Genie. 💫 ඔබට අවශ්‍ය gift එක කියන්න, මම ඔයාව guide කරන්නම්. 😊",
    },
  ],
  Singlish: [
    {
      role: "assistant",
      content:
        "Ayubowan! Mama Kapruka Genie. 💫 Oyata ona gift eka kiyanna, mama oyawa guide karannam. 😊",
    },
  ],
  Tanglish: [
    {
      role: "assistant",
      content:
        "Vanakkam! Naan Kapruka Genie. 💫 Neenga thedura gift pathi sollunga, naan unga details guide pannren. 😊",
    },
  ],
};

const modeIcons: Record<string, IconName> = {
  "Event Planner": "sparkles",
  "Gift Box Builder": "gift",
  "Gift Message": "heart",
  "Order Tracking": "truck",
  "Product Compare": "search",
  "Smart Shopping": "cart",
};

const budgetOptions = [
  "Under Rs. 2,500",
  "Rs. 2,500 - 5,000",
  "Rs. 5,000 - 10,000",
  "Above Rs. 10,000",
  "Other",
];

const recipientOptions = ["Male", "Female", "Child", "Couple", "Other"];

const occasionOptions = [
  "Birthday",
  "Anniversary",
  "Wedding",
  "Graduation",
  "Other",
];

const giftTypeOptions = [
  "Flowers",
  "Cakes",
  "Chocolate",
  "Electronics",
  "Perfumes",
  "Fashion",
  "Other",
];

const eventTypeOptions = ["Birthday", "Anniversary", "Office party", "Family gathering"];

const participantOptions = ["Under 10", "10 - 25", "25 - 50", "Above 50"];

const venueOptions = ["Home", "Office", "Hotel", "Outdoor"];

const giftBoxThemeOptions = ["Chocolate", "Flowers", "Perfume", "Wellness", "Party"];

const itemCountOptions = ["2 items", "3 items", "4 items", "5+ items"];

const genericCompareSuggestion = "Compare price, stock, and category values.";

function isGenericCompareSuggestion(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === genericCompareSuggestion.toLowerCase() ||
    normalized === "compare price, description, and stock before choosing."
  );
}

function hasAvailableStock(product: Product) {
  return product.stock > 0 || /in stock/i.test(product.stockLabel);
}

function getLocalCompareSummary(first?: Product, second?: Product) {
  if (!first || !second) {
    return "";
  }

  const sameCategory =
    first.category.trim().toLowerCase() === second.category.trim().toLowerCase();
  const firstAvailable = hasAvailableStock(first);
  const secondAvailable = hasAvailableStock(second);
  const priceLine =
    first.price === second.price
      ? `Both products are priced the same at ${formatPrice(first.price, first.currency)}.`
      : `${first.price < second.price ? first.name : second.name} is cheaper by ${formatPrice(Math.abs(first.price - second.price), first.currency)}.`;
  const categoryLine = sameCategory
    ? `Both are in ${first.category}, so compare them by value, availability, and gift fit.`
    : `${first.name} is a ${first.category} option, while ${second.name} is a ${second.category} option, so they suit different needs.`;
  const stockLine =
    firstAvailable === secondAvailable
      ? `${first.name} is ${first.stockLabel.toLowerCase()}, and ${second.name} is ${second.stockLabel.toLowerCase()}.`
      : `${firstAvailable ? first.name : second.name} is the safer availability pick because it is ${firstAvailable ? first.stockLabel.toLowerCase() : second.stockLabel.toLowerCase()}.`;
  const preferred = firstAvailable && !secondAvailable
    ? first
    : secondAvailable && !firstAvailable
      ? second
      : first.price <= second.price
        ? first
        : second;
  const alternative = preferred.id === first.id ? second : first;

  return `${categoryLine} ${priceLine} ${stockLine} Choose ${preferred.name} if you want the stronger price and availability balance. Choose ${alternative.name} instead if its category, style, or description is a better match for the recipient, but skip it if that fit does not outweigh ${preferred.name}'s value advantage.`;
}

const shoppingContextFields: ContextField[] = [
  "budget",
  "recipient",
  "occasion",
  "category",
];

function getContextFieldsForMode(mode: string): ContextField[] {
  if (mode.includes("Event")) {
    return ["eventType", "participants", "venue", "budget"];
  }

  if (mode.includes("Gift Box")) {
    return ["boxRecipient", "giftBoxTheme", "itemCount", "budget"];
  }

  return shoppingContextFields;
}

const contextQuestions: Record<
  Language,
  Partial<Record<ContextField, string>>
> = {
  English: {
    boxRecipient: "Who is this gift box for?",
    budget: "What is your budget?",
    category: "What type of gift would you like to explore?",
    eventType: "What type of event are you planning?",
    giftBoxTheme: "What gift box theme should I use?",
    itemCount: "How many items should the box include?",
    occasion: "What is the occasion?",
    participants: "How many participants are expected?",
    recipient: "Who is the recipient?",
    venue: "Where will the event happen?",
  },
  Sinhala: {
    budget: "ඔබගේ budget එක කීයද?",
    occasion: "මේ තෑග්ග දෙන්නේ මොන අවස්ථාවකටද?",
    recipient: "තෑග්ග ලැබෙන්නේ කාටද?",
  },
  Singlish: {
    boxRecipient: "Gift box eka kaatada?",
    budget: "Budget eka keeyada?",
    category: "Mokak wage gift type ekakda balanne?",
    eventType: "Event type eka mokakda?",
    giftBoxTheme: "Gift box theme eka mokakda?",
    itemCount: "Box ekata items keeyak oneda?",
    occasion: "Me gift eka mona occasion ekakatada?",
    participants: "Participants keedenek innawada?",
    recipient: "Gift eka denna one kaatada?",
    venue: "Event eka koheda thiyenne?",
  },
  Tanglish: {
    boxRecipient: "Indha gift box yaarukkaga?",
    budget: "Budget evlo?",
    category: "Enna mathiri gift type paakanum?",
    eventType: "Event type enna?",
    giftBoxTheme: "Gift box theme enna?",
    itemCount: "Box la evalo items venum?",
    occasion: "Indha gift enna occasion ku?",
    participants: "Participants evalo per varuvaanga?",
    recipient: "Gift yaarukku kudukkanum?",
    venue: "Event enga nadakkudhu?",
  },
};

const contextQuestionOverrides: Record<
  Language,
  Partial<Record<ContextField, string>>
> = {
  English: {},
  Sinhala: {
    boxRecipient: "මෙම gift box එක කාටද?",
    category: "ඔබ බලන්න කැමති gift type එක මොකක්ද?",
    eventType: "ඔබ plan කරන event එක මොකක්ද?",
    giftBoxTheme: "Gift box theme එක මොකක්ද?",
    itemCount: "Box එකට items කීයක් දාන්නද?",
    participants: "Participants කී දෙනෙක් ඉන්නවද?",
    venue: "Event එක තියෙන්නේ කොහෙද?",
  },
  Singlish: {
    boxRecipient: "Gift box eka kaatada?",
    category: "Mona wage gift type ekakda balanne?",
    eventType: "Event type eka mokakda?",
    giftBoxTheme: "Gift box theme eka mokakda?",
    itemCount: "Box ekata items keeyak oneda?",
    participants: "Participants keedenek innawada?",
    venue: "Event eka koheda thiyenne?",
  },
  Tanglish: {
    boxRecipient: "Gift box yaarukkaga?",
    category: "Enna gift type paakanum?",
    eventType: "Event type enna?",
    giftBoxTheme: "Gift box theme enna?",
    itemCount: "Box ku evalo items venum?",
    participants: "Participants evalo per?",
    venue: "Event enga irukku?",
  },
};

const giftTypeMessages: Record<Language, string> = {
  English: "Thanks. What type of gift would you like to explore?",
  Sinhala: "ස්තුතියි. ඔබ බලන්න කැමති තෑගි වර්ගය තෝරන්න.",
  Singlish: "Thanks. mokak wage gift type ekak balannada?",
  Tanglish: "Thanks. Enna gift type paakanum?",
};

const contextFieldOptions: Record<ContextField, string[]> = {
  boxRecipient: recipientOptions,
  budget: budgetOptions,
  category: giftTypeOptions,
  eventType: eventTypeOptions,
  giftBoxTheme: giftBoxThemeOptions,
  itemCount: itemCountOptions,
  occasion: occasionOptions,
  participants: participantOptions,
  recipient: recipientOptions,
  venue: venueOptions,
};

const contextFieldLabels: Record<ContextField, string> = {
  boxRecipient: "Recipient",
  budget: "Budget",
  category: "Gift type",
  eventType: "Event type",
  giftBoxTheme: "Theme",
  itemCount: "Items",
  occasion: "Occasion",
  participants: "Participants",
  recipient: "Recipient",
  venue: "Venue",
};

const contextFieldLabelsByLanguage: Record<
  Language,
  Record<ContextField, string>
> = {
  English: contextFieldLabels,
  Sinhala: {
    boxRecipient: "Recipient",
    budget: "Budget",
    category: "Gift type",
    eventType: "Event type",
    giftBoxTheme: "Theme",
    itemCount: "Items",
    occasion: "Occasion",
    participants: "Participants",
    recipient: "Recipient",
    venue: "Venue",
  },
  Singlish: {
    boxRecipient: "Recipient",
    budget: "Budget",
    category: "Gift type",
    eventType: "Event type",
    giftBoxTheme: "Theme",
    itemCount: "Items",
    occasion: "Occasion",
    participants: "Participants",
    recipient: "Recipient",
    venue: "Venue",
  },
  Tanglish: {
    boxRecipient: "Recipient",
    budget: "Budget",
    category: "Gift type",
    eventType: "Event type",
    giftBoxTheme: "Theme",
    itemCount: "Items",
    occasion: "Occasion",
    participants: "Participants",
    recipient: "Recipient",
    venue: "Venue",
  },
};

const contextFieldLabelOverrides: Record<
  Language,
  Partial<Record<ContextField, string>>
> = {
  English: {},
  Sinhala: {
    boxRecipient: "ලබන්නා",
    budget: "Budget",
    category: "Gift type",
    eventType: "Event type",
    giftBoxTheme: "Theme",
    itemCount: "Items",
    occasion: "අවස්ථාව",
    participants: "Participants",
    recipient: "ලබන්නා",
    venue: "ස්ථානය",
  },
  Singlish: {
    boxRecipient: "Recipient",
    budget: "Budget",
    category: "Gift type",
    eventType: "Event type",
    giftBoxTheme: "Theme",
    itemCount: "Items",
    occasion: "Occasion",
    participants: "Participants",
    recipient: "Recipient",
    venue: "Venue",
  },
  Tanglish: {
    boxRecipient: "Recipient",
    budget: "Budget",
    category: "Gift type",
    eventType: "Event type",
    giftBoxTheme: "Theme",
    itemCount: "Items",
    occasion: "Occasion",
    participants: "Participants",
    recipient: "Recipient",
    venue: "Venue",
  },
};

const emptyContextDraft: ContextDraft = {
  boxRecipient: "",
  budget: "",
  category: "",
  eventType: "",
  giftBoxTheme: "",
  itemCount: "",
  occasion: "",
  participants: "",
  recipient: "",
  venue: "",
};

function getLocalDateString(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function removeEmojiForSpeech(value: string) {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNonPastDate(value: string) {
  const today = getLocalDateString();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today
    ? value
    : today;
}

const initialShoppingProfile: ShoppingProfile = {
  budget: "",
  category: "",
  city: "Colombo",
  date: getLocalDateString(),
  interests: "premium gifts, useful items",
  occasion: "",
  recipient: "",
};

function getExtendedPreferencesFromProfile(
  profile: ShoppingProfile,
): ExtendedPreferences {
  return {
    budget: profile.budget,
    giftType: profile.category,
    lastRepliedCount: 0,
    occasion: profile.occasion,
    recipient: profile.recipient,
    replyCount: 0,
  };
}

function normalizeExtendedPreferences(
  value: Partial<ExtendedPreferences> | undefined,
  profile: ShoppingProfile,
): ExtendedPreferences {
  const fallback = getExtendedPreferencesFromProfile(profile);

  return {
    budget: value?.budget ?? fallback.budget,
    giftType: value?.giftType ?? fallback.giftType,
    lastRepliedCount: value?.lastRepliedCount ?? 0,
    occasion: value?.occasion ?? fallback.occasion,
    recipient: value?.recipient ?? fallback.recipient,
    replyCount: value?.replyCount ?? 0,
  };
}

function mergeExtendedPreferencesWithProfile(
  current: ExtendedPreferences,
  profileUpdates: Partial<
    Pick<ShoppingProfile, "budget" | "category" | "occasion" | "recipient">
  >,
  extendedUpdates?: Partial<ExtendedPreferences>,
): ExtendedPreferences {
  const nextPreferences = {
    budget:
      extendedUpdates?.budget ?? profileUpdates.budget ?? current.budget ?? "",
    giftType:
      extendedUpdates?.giftType ??
      profileUpdates.category ??
      current.giftType ??
      "",
    occasion:
      extendedUpdates?.occasion ??
      profileUpdates.occasion ??
      current.occasion ??
      "",
    recipient:
      extendedUpdates?.recipient ??
      profileUpdates.recipient ??
      current.recipient ??
      "",
  };
  const didPreferenceChange =
    nextPreferences.budget !== current.budget ||
    nextPreferences.giftType !== current.giftType ||
    nextPreferences.occasion !== current.occasion ||
    nextPreferences.recipient !== current.recipient;

  return {
    ...nextPreferences,
    lastRepliedCount: current.lastRepliedCount,
    replyCount: didPreferenceChange ? current.replyCount + 1 : current.replyCount,
  };
}

function havePreferenceValuesChanged(
  current: ExtendedPreferences,
  updates: Partial<Pick<ExtendedPreferences, "budget" | "giftType" | "occasion" | "recipient">>,
) {
  return (
    (updates.budget !== undefined && updates.budget !== current.budget) ||
    (updates.giftType !== undefined && updates.giftType !== current.giftType) ||
    (updates.occasion !== undefined && updates.occasion !== current.occasion) ||
    (updates.recipient !== undefined && updates.recipient !== current.recipient)
  );
}

function applyExtendedPreferenceUpdates(
  current: ExtendedPreferences,
  updates: Partial<Pick<ExtendedPreferences, "budget" | "giftType" | "occasion" | "recipient">>,
) {
  const didPreferenceChange = havePreferenceValuesChanged(current, updates);

  return {
    ...current,
    ...updates,
    replyCount: didPreferenceChange ? current.replyCount + 1 : current.replyCount,
  };
}

function syncExtendedPreferencesWithProfile(
  current: ExtendedPreferences,
  profile: ShoppingProfile,
) {
  return applyExtendedPreferenceUpdates(current, {
    budget: profile.budget,
    giftType: profile.category,
    occasion: profile.occasion,
    recipient: profile.recipient,
  });
}

function normalizeShoppingProfile(nextProfile: ShoppingProfile): ShoppingProfile {
  return {
    ...initialShoppingProfile,
    ...nextProfile,
    date: getNonPastDate(nextProfile.date),
  };
}

function normalizeModeSession(session: ModeSession): ModeSession {
  const normalizedProfile = normalizeShoppingProfile(session.profile);
  return {
    ...session,
    extendedPreferences: normalizeExtendedPreferences(
      session.extendedPreferences,
      normalizedProfile,
    ),
    fitReasons: session.fitReasons ?? {},
    profile: normalizedProfile,
    recommendedProducts: session.recommendedProducts ?? [],
  };
}

function normalizeModeSessions(sessions: Record<string, ModeSession>) {
  return Object.fromEntries(
    Object.entries(sessions).map(([mode, session]) => [
      mode,
      normalizeModeSession(session),
    ]),
  );
}

const copy: Record<
  Language,
  Partial<{
    active: string;
    addProducts: string;
    addToBuyBox: string;
    allContextDetected: string;
    askPlaceholder: string;
    buyBox: string;
    checkout: string;
    city: string;
    clearHistory: string;
    comparePrompt: string;
    continueWithoutContext: string;
    contextIntro: string;
    contextTitle: string;
    createOrderLink: string;
    date: string;
    detectedContext: string;
    delivery: string;
    deliveryInstructions: string;
    eventPrompt: string;
    giftBoxPrompt: string;
    giftMessageLabel: string;
    initialEmpty: string;
    initialLoading: string;
    imageLooksLike: string;
    language: string;
    modes: string;
    openCheckout: string;
    processing: string;
    productView: string;
    recipientName: string;
    recipientPhone: string;
    relatedGiftsReply: string;
    recordingVoice: string;
    send: string;
    sendContext: string;
    sending: string;
    sendingContext: string;
    senderName: string;
    subtotal: string;
    trackingPrompt: string;
    transcribingVoice: string;
    total: string;
    uploadingImage: string;
    useContextCard: string;
    userContext: string;
    voicePause: string;
    voiceEnglishOnly: string;
    voiceRetry: string;
    voiceResume: string;
    voiceStop: string;
  }>
> = {
  English: {
    active: "Active",
    addProducts: "Add products to build a cart order link.",
    addToBuyBox: "Add to Cart",
    allContextDetected: "All needed context was detected from your message.",
    askPlaceholder: "Ask Genie to search, compare, plan an event, or checkout...",
    buyBox: "Cart",
    checkout: "Delivery address",
    city: "City",
    clearHistory: "Clear history",
    comparePrompt: "Enter 2 or 3 product IDs and I will compare them in a table.",
    continueWithoutContext: "Continue Without Context",
    contextIntro:
      "I detected details from your message and only need anything missing before answering it.",
    contextTitle: "Set shopping preferences",
    createOrderLink: "Create Order Link",
    date: "Date",
    detectedContext: "Detected preferences",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    eventPrompt: "Let us plan the event. Add the event details below.",
    giftBoxPrompt: "Let us build the gift box. Add the gift box details below.",
    giftMessageLabel: "Gift message",
    initialEmpty: "Kapruka products will appear here after a search.",
    initialLoading: "Loading products...",
    imageLooksLike: "Your image looks like",
    language: "Language",
    modes: "Agent Modes",
    openCheckout: "Open Checkout",
    processing: "Processing...",
    productView: "View",
    recipientName: "Recipient name",
    recipientPhone: "Recipient phone",
    relatedGiftsReply: "I will show you related gifts.",
    recordingVoice: "Recording voice input...",
    send: "Send",
    sendContext: "Send Preferences",
    sending: "Sending",
    sendingContext: "Sending Preferences",
    senderName: "Sender name",
    subtotal: "Subtotal",
    trackingPrompt: "Enter your Kapruka order number and I will check the latest status.",
    transcribingVoice: "Transcribing voice note...",
    total: "Total",
    uploadingImage: "Processing image...",
    useContextCard: "Use the preferences above...",
    userContext: "Preferences",
    voicePause: "Pause",
    voiceEnglishOnly: "Voice search supports English only.",
    voiceRetry:
      "I couldn't clearly recognize that voice message. Please try again in English.",
    voiceResume: "Resume",
    voiceStop: "Stop",
  },
  Sinhala: {
    active: "Active",
    addProducts: "Order එකකට products එකතු කරන්න.",
    addToBuyBox: "Cart එකට එකතු කරන්න",
    allContextDetected: "ඔබගේ message එකෙන් අවශ්‍ය context හමු වුණා.",
    askPlaceholder: "Genieගෙන් search, compare, plan, checkout අහන්න...",
    buyBox: "Cart",
    checkout: "Delivery address",
    city: "නගරය",
    continueWithoutContext: "Preferences නැතුව ඉදිරියට",
    contextIntro:
      "ඔබගේ message එකෙන් හමු වූ details පාවිච්චි කරලා, අඩු දේවල් විතරක් අහනවා.",
    contextTitle: "Shopping preferences තෝරන්න",
    createOrderLink: "Create Order Link",
    date: "දිනය",
    detectedContext: "හමු වූ preferences",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    initialEmpty: "සෙවීමට පස්සේ Kapruka products මෙතැන පෙන්වයි.",
    initialLoading: "Products load වෙනවා...",
    language: "භාෂාව",
    modes: "Agent Modes",
    openCheckout: "Open Checkout",
    productView: "බලන්න",
    recipientName: "Recipient name",
    recipientPhone: "Recipient phone",
    send: "යවන්න",
    sendContext: "Preferences යවන්න",
    sending: "යවමින්",
    sendingContext: "Preferences යවමින්",
    senderName: "Sender name",
    subtotal: "Subtotal",
    total: "Total",
    useContextCard: "ඉහළ preferences භාවිත කරන්න...",
    userContext: "Preferences",
  },
  Singlish: {
    active: "Active",
    addProducts: "Order ekak hadanna products add karanna.",
    addToBuyBox: "Cart ekata add karanna",
    allContextDetected: "Oyage message eken preferences detect una.",
    askPlaceholder: "Genie gen search, compare, plan, checkout ahanna...",
    buyBox: "Cart",
    checkout: "Delivery address",
    city: "City eka",
    clearHistory: "History clear karanna",
    comparePrompt: "Product IDs 2k hari 3k hari denna. Mama table ekakin compare karannam.",
    continueWithoutContext: "Preferences nathuwa idiriyata",
    contextIntro:
      "Oyage message eken details detect kala.",
    contextTitle: "Shopping preferences set karanna",
    createOrderLink: "Create Order Link",
    date: "Date eka",
    detectedContext: "Detected preferences",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    eventPrompt: "Event eka plan karamu. Pahala details tika denna.",
    giftBoxPrompt: "Gift box eka hadamu. Pahala details tika denna.",
    giftMessageLabel: "Gift message",
    initialEmpty: "Seweemakata passe Kapruka products methana pennanawa.",
    initialLoading: "Products load wenawa...",
    language: "Language",
    modes: "Agent Modes",
    openCheckout: "Open Checkout",
    productView: "Balanna",
    recipientName: "Recipient name",
    recipientPhone: "Recipient phone",
    relatedGiftsReply: "Mama oyata related gifts pennannam.",
    send: "Send",
    sendContext: "Preferences send karanna",
    sending: "Sending",
    sendingContext: "Preferences sending",
    senderName: "Sender name",
    subtotal: "Subtotal",
    trackingPrompt: "Kapruka order number eka denna. Mama latest status eka balannam.",
    total: "Total",
    useContextCard: "Uda preferences use karanna...",
    userContext: "Preferences",
  },
  Tanglish: {
    active: "Active",
    addProducts: "Order build panna products add pannunga.",
    addToBuyBox: "Cart ku add pannunga",
    allContextDetected: "Unga message la preferences detect aayiduchu.",
    askPlaceholder: "Genie kitta search, compare, plan, checkout kekkalaam...",
    buyBox: "Cart",
    checkout: "Delivery address",
    city: "City",
    clearHistory: "History clear pannunga",
    comparePrompt: "2 illa 3 product IDs kudunga. Naan compare pannren.",
    continueWithoutContext: "Preferences illama continue pannunga",
    contextIntro: "Unga message la irundhu details detect panniten.",
    contextTitle: "Shopping preferences set pannunga",
    createOrderLink: "Create Order Link",
    date: "Date",
    detectedContext: "Detected preferences",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    eventPrompt: "Event plan pannalaam. Keezha details kudunga.",
    giftBoxPrompt: "Gift box build pannalaam. Keezha details kudunga.",
    giftMessageLabel: "Gift message",
    initialEmpty: "Search panna apram Kapruka products inga kaattappadum.",
    initialLoading: "Products load aagudhu...",
    language: "Language",
    modes: "Agent Modes",
    openCheckout: "Open Checkout",
    productView: "Paarkka",
    recipientName: "Recipient name",
    recipientPhone: "Recipient phone",
    relatedGiftsReply: "Unga request ku related gifts kaamikiren.",
    send: "Send",
    sendContext: "Preferences send pannunga",
    sending: "Sending",
    sendingContext: "Preferences sending",
    senderName: "Sender name",
    subtotal: "Subtotal",
    trackingPrompt: "Kapruka order number kudunga. Latest status paathuttu sollren.",
    total: "Total",
    useContextCard: "Mela irukka preferences use pannunga...",
    userContext: "Preferences",
  },
};

const copyOverrides: Record<Language, Partial<Required<(typeof copy)["English"]>>> = {
  English: {},
  Sinhala: {
    addProducts: "Order එකක් හදන්න products එකතු කරන්න.",
    addToBuyBox: "Cart එකට එකතු කරන්න",
    buyBox: "Cart",
    clearHistory: "History clear කරන්න",
    comparePrompt: "Product IDs 2ක් හෝ 3ක් දෙන්න. මම table එකකින් compare කරන්නම්.",
    contextIntro: "ඔබ දුන් details අනුව අඩු තොරතුරු ටික පමණක් තෝරන්න.",
    contextTitle: "Preferences තෝරන්න",
    eventPrompt: "Event එක plan කරමු. පහළ details ටික තෝරන්න.",
    giftBoxPrompt: "Gift box එක හදමු. පහළ details ටික තෝරන්න.",
    deliveryInstructions: "Delivery instructions",
    giftMessageLabel: "Gift message",
    imageLooksLike: "ඔබේ image එක පේන්නේ",
    processing: "Processing...",
    recordingVoice: "Voice record වෙනවා...",
    relatedGiftsReply: "මම ඔබට ගැලපෙන gifts පෙන්වන්නම්.",
    trackingPrompt: "Kapruka order number එක දෙන්න. මම latest status එක බලන්නම්.",
    transcribingVoice: "Voice note එක text කරනවා...",
    uploadingImage: "Image process වෙනවා...",
    useContextCard: "ඉහළ preferences භාවිතා කරන්න...",
    userContext: "Preferences",
    voicePause: "Pause",
    voiceEnglishOnly: "Voice search සඳහා සහාය දක්වන්නේ English පමණයි.",
    voiceRetry:
      "Voice message එක පැහැදිලිව හඳුනාගන්න බැරි වුණා. කරුණාකර English වලින් නැවත උත්සාහ කරන්න.",
    voiceResume: "Resume",
    voiceStop: "Stop",
  },
  Singlish: {
    deliveryInstructions: "Delivery instructions",
    giftMessageLabel: "Gift message",
    imageLooksLike: "Oyage image eka penenne",
    processing: "Processing...",
    recordingVoice: "Voice record wenawa...",
    transcribingVoice: "Voice note eka text karanawa...",
    uploadingImage: "Image process wenawa...",
    voicePause: "Pause",
    voiceEnglishOnly: "Voice search support karanne English witharai.",
    voiceRetry:
      "Voice message eka hariyata handunaganna bari una. English walin aye try karanna.",
    voiceResume: "Resume",
    voiceStop: "Stop",
  },
  Tanglish: {
    deliveryInstructions: "Delivery instructions",
    giftMessageLabel: "Gift message",
    imageLooksLike: "Unga image la theriyardhu",
    processing: "Processing...",
    recordingVoice: "Voice record aagudhu...",
    transcribingVoice: "Voice note text aagudhu...",
    uploadingImage: "Image process aagudhu...",
    voicePause: "Pause",
    voiceEnglishOnly: "Voice search ippo English mattum support pannudhu.",
    voiceRetry:
      "Voice message clear aa puriyala. Dayavu seithu English la innum oru thadava try pannunga.",
    voiceResume: "Resume",
    voiceStop: "Stop",
  },
};

const suggestedPromptsByLanguage: Record<Language, SuggestedPrompt[]> = {
  English: [
    {
      action: "fill",
      text: "Show me red roses between Rs. 2500 - 5000 for my girlfriend's birthday.",
    },
    {
      action: "fill",
      text: "Can you deliver to Colombo tomorrow?",
    },
    {
      action: "custom",
      text: "Or enter your custom message.",
    },
  ],
  Sinhala: [
    {
      action: "fill",
      text: "මගේ පෙම්වතියගේ උපන්දිනයට Rs. 2500 - 5000 අතර රතු රෝස මල් පෙන්නන්න.",
    },
    {
      action: "fill",
      text: "හෙට Colombo වලට delivery කරන්න පුළුවන්ද?",
    },
    {
      action: "custom",
      text: "නැත්නම් ඔබගේ custom message එක type කරන්න.",
    },
  ],
  Singlish: [
    {
      action: "fill",
      text: "Mage pemwathiyage upandinayata Rs. 2500 - 5000 athara rathu rosa mal pennanna.",
    },
    {
      action: "fill",
      text: "Heta Colombo walata delivery karanna puluwanda?",
    },
    {
      action: "custom",
      text: "Nathnam oyage custom message eka type karanna.",
    },
  ],
  Tanglish: [
    {
      action: "fill",
      text: "En girlfriend oda birthday ku Rs. 2500 - 5000 range la red roses kaamikkunga.",
    },
    {
      action: "fill",
      text: "Naalaikku Colombo ku delivery panna mudiyuma?",
    },
    {
      action: "custom",
      text: "Illenna unga custom message type pannunga.",
    },
  ],
};

const starterChipLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Build a gift box": "තෑගි පෙට්ටියක් හදන්න",
    "Compare products": "නිෂ්පාදන සසඳන්න",
    "Find a gift": "තෑග්ගක් හොයන්න",
    "Plan an event": "උත්සවයක් සැලසුම් කරන්න",
    "Track an order": "ඇණවුමක් පරීක්ෂා කරන්න",
    "Write a gift message": "තෑගි පණිවිඩයක් ලියන්න",
  },
  Singlish: {
    "Build a gift box": "Gift box hadanna",
    "Compare products": "Products compare karanna",
    "Find a gift": "Gift ekak hoyanna",
    "Plan an event": "Event ekak plan karanna",
    "Track an order": "Order track karanna",
    "Write a gift message": "Gift message liyanna",
  },
  Tanglish: {
    "Build a gift box": "Gift box build pannunga",
    "Compare products": "Products compare pannunga",
    "Find a gift": "Gift thedunga",
    "Plan an event": "Event plan pannunga",
    "Track an order": "Order track pannunga",
    "Write a gift message": "Gift message ezhudhunga",
  },
};

const starterChipOverrides: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Find a cake": "කේක් එකක් හොයන්න",
    "Find chocolates": "චොකලට් හොයන්න",
    "Find flowers": "මල් හොයන්න",
    "Find perfume": "සුවඳ විලවුන් හොයන්න",
    "Same-day delivery": "අදම බෙදාහැරීම",
  },
  Singlish: {
    "Find a cake": "Cake ekak hoyanna",
    "Find chocolates": "Chocolate hoyanna",
    "Find flowers": "Flowers hoyanna",
    "Find perfume": "Perfume hoyanna",
    "Same-day delivery": "Ada delivery",
  },
  Tanglish: {
    "Find a cake": "Cake thedunga",
    "Find chocolates": "Chocolates thedunga",
    "Find flowers": "Flowers thedunga",
    "Find perfume": "Perfume thedunga",
    "Same-day delivery": "Innaikku delivery",
  },
};

const optionLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Above Rs. 10,000": "Rs. 10,000 ට වැඩි",
    Anniversary: "\u0dc3\u0d82\u0dc0\u0dad\u0dca\u0dc3\u0dbb\u0dba",
    Birthday: "\u0d8b\u0db4\u0db1\u0dca\u0daf\u0dd2\u0db1\u0dba",
    Child: "ළමයෙක්",
    Chocolate: "\u0da0\u0ddc\u0d9a\u0dbd\u0da7\u0dca",
    Couple: "Couple",
    Cakes: "\u0d9a\u0dda\u0d9a\u0dca",
    Electronics: "Electronics",
    Fashion: "Fashion",
    Female: "කාන්තාවක්",
    Flowers: "\u0db8\u0dbd\u0dca",
    Graduation: "\u0d8b\u0db4\u0dcf\u0db0\u0dd2 \u0db4\u0dca\u0dbb\u0daf\u0dcf\u0db1\u0dba",
    Male: "පුරුෂයෙක්",
    Other: "වෙනත්",
    Perfumes: "\u0dc3\u0dd4\u0dc0\u0db3 \u0dc0\u0dd2\u0dbd\u0dc0\u0dd4\u0db1\u0dca",
    "Rs. 2,500 - 5,000": "Rs. 2,500 - 5,000",
    "Rs. 5,000 - 10,000": "Rs. 5,000 - 10,000",
    "Under Rs. 2,500": "Rs. 2,500 ට අඩු",
    Wedding: "\u0dc0\u0dd2\u0dc0\u0dcf\u0dc4\u0dba",
  },
  Singlish: {
    "Above Rs. 10,000": "Rs. 10,000 ta wedi",
    Anniversary: "Sanwathsare",
    Birthday: "Upandinaya",
    Child: "Child",
    Chocolate: "Chocolate",
    Couple: "Couple",
    Cakes: "Cake",
    Electronics: "Electronics",
    Fashion: "Fashion",
    Female: "Female",
    Flowers: "Mal",
    Graduation: "Upadhi pradanaya",
    Male: "Male",
    Other: "Wenas",
    Perfumes: "Perfume",
    "Rs. 2,500 - 5,000": "Rs. 2,500 - 5,000",
    "Rs. 5,000 - 10,000": "Rs. 5,000 - 10,000",
    "Under Rs. 2,500": "Rs. 2,500 ta adu",
    Wedding: "Vivahaya",
  },
  Tanglish: {
    "Above Rs. 10,000": "Rs. 10,000 mela",
    Anniversary: "Anniversary",
    Birthday: "Birthday",
    Child: "Child",
    Chocolate: "Chocolate",
    Couple: "Couple",
    Cakes: "Cakes",
    Electronics: "Electronics",
    Fashion: "Fashion",
    Female: "Female",
    Flowers: "Flowers",
    Graduation: "Graduation",
    Male: "Male",
    Other: "Other",
    Perfumes: "Perfumes",
    "Rs. 2,500 - 5,000": "Rs. 2,500 - 5,000",
    "Rs. 5,000 - 10,000": "Rs. 5,000 - 10,000",
    "Under Rs. 2,500": "Rs. 2,500 keela",
    Wedding: "Wedding",
  },
};

const contextOptionLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "2 items": "අයිතම 2",
    "3 items": "අයිතම 3",
    "4 items": "අයිතම 4",
    "5+ items": "අයිතම 5+",
    "10 - 25": "10 - 25",
    "25 - 50": "25 - 50",
    "Above 50": "50 ට වැඩි",
    "Family gathering": "පවුලේ එකතුව",
    Home: "නිවස",
    Hotel: "හෝටලය",
    Office: "කාර්යාලය",
    "Office party": "කාර්යාල සාදය",
    Outdoor: "එළිමහන්",
    Party: "සාදය",
    Perfume: "සුවඳ විලවුන්",
    "Under 10": "10 ට අඩු",
    Wellness: "සුවතා",
  },
  Singlish: {
    "2 items": "Items 2",
    "3 items": "Items 3",
    "4 items": "Items 4",
    "5+ items": "Items 5+",
    "10 - 25": "10 - 25",
    "25 - 50": "25 - 50",
    "Above 50": "50 ta wedi",
    "Family gathering": "Family gathering",
    Home: "Home",
    Hotel: "Hotel",
    Office: "Office",
    "Office party": "Office party",
    Outdoor: "Outdoor",
    Party: "Party",
    Perfume: "Perfume",
    "Under 10": "10 ta adu",
    Wellness: "Wellness",
  },
  Tanglish: {
    "2 items": "2 items",
    "3 items": "3 items",
    "4 items": "4 items",
    "5+ items": "5+ items",
    "10 - 25": "10 - 25",
    "25 - 50": "25 - 50",
    "Above 50": "50 ku mela",
    "Family gathering": "Family gathering",
    Home: "Home",
    Hotel: "Hotel",
    Office: "Office",
    "Office party": "Office party",
    Outdoor: "Outdoor",
    Party: "Party",
    Perfume: "Perfume",
    "Under 10": "10 ku keela",
    Wellness: "Wellness",
  },
};

const dynamicChipLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Check delivery": "බෙදාහැරීම පරීක්ෂා කරන්න",
    Chocolate: "චොකලට්",
    "Colombo delivery": "කොළඹට බෙදාහැරීම",
    "Create order link": "ඇණවුම් සබැඳිය හදන්න",
    "More like this": "මේ වගේ තවත්",
    Perfume: "සුවඳ විලවුන්",
    Roses: "රෝස මල්",
    Watch: "ඔරලෝසුව",
  },
  Singlish: {
    "Check delivery": "Delivery check karanna",
    Chocolate: "Chocolate",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link hadanna",
    "More like this": "Me wage thawa",
    Perfume: "Perfume",
    Roses: "Roses",
    Watch: "Watch",
  },
  Tanglish: {
    "Check delivery": "Delivery check pannunga",
    Chocolate: "Chocolate",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link create pannunga",
    "More like this": "Idhu maadhiri innum",
    Perfume: "Perfume",
    Roses: "Roses",
    Watch: "Watch",
  },
};

const commonChipLabels: Record<Language, Record<string, string>> = {
  English: {
    "Next item": "Next item",
    "Previous item": "Previous item",
    "Suggest more": "Suggest more",
  },
  Sinhala: {
    "Check delivery": "බෙදාහැරීම පරීක්ෂා කරන්න",
    Chocolate: "චොකලට්",
    "Colombo delivery": "කොළඹට බෙදාහැරීම",
    "Create order link": "ඇණවුම් සබැඳිය හදන්න",
    "Enter order number": "Order number එක දාන්න",
    "More like this": "මේ වගේ තවත්",
    "Next item": "ඊළඟ අයිතමය",
    "Open checkout": "Checkout අරින්න",
    "Previous item": "පෙර අයිතමය",
    Perfume: "සුවඳ විලවුන්",
    Roses: "රෝස මල්",
    "Search more products": "තව products හොයන්න",
    "Search products": "Products හොයන්න",
    "Track another order": "තව order එකක් track කරන්න",
    "Track order": "Order track කරන්න",
    "Suggest more": "තවත් යෝජනා",
    Watch: "ඔරලෝසුව",
  },
  Singlish: {
    "Check delivery": "Delivery check karanna",
    Chocolate: "Chocolate",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link hadanna",
    "Enter order number": "Order number eka danna",
    "More like this": "Me wage thawa",
    "Next item": "Ilanga item eka",
    "Open checkout": "Open checkout",
    "Previous item": "Kalin item eka",
    Perfume: "Perfume",
    Roses: "Roses",
    "Search more products": "Thawa products hoyanna",
    "Search products": "Products hoyanna",
    "Track another order": "Thawa order ekak track karanna",
    "Track order": "Order track karanna",
    "Suggest more": "Thawa yojana",
    Watch: "Watch",
  },
  Tanglish: {
    "Check delivery": "Delivery check pannunga",
    Chocolate: "Chocolate",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link create pannunga",
    "Enter order number": "Order number kudunga",
    "More like this": "Idhu maadhiri innum",
    "Next item": "Next item",
    "Open checkout": "Open checkout",
    "Previous item": "Previous item",
    Perfume: "Perfume",
    Roses: "Roses",
    "Search more products": "Innum products thedunga",
    "Search products": "Products thedunga",
    "Track another order": "Innum oru order track pannunga",
    "Track order": "Order track pannunga",
    "Suggest more": "Innum suggest pannunga",
    Watch: "Watch",
  },
};

const iconPaths: Record<IconName, string> = {
  box: "M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4m0-10v10m8-14v10l-8 4",
  camera:
    "M4 7h3l1.5-2h7L17 7h3v12H4V7Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  cart: "M3 4h2l2 11h10l2-7H6m2 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  check: "M5 12l4 4L19 6",
  gift: "M20 12v8H4v-8m16 0H4m16 0V8H4v4m8-4v12M8 8c-2 0-3-1-3-2s1-2 2-2c2 0 5 4 5 4s3-4 5-4c1 0 2 1 2 2s-1 2-3 2",
  heart:
    "M12 20s-7-4.4-9-9c-1.2-2.8.8-5.8 3.8-5.8 1.8 0 3.1 1 4.2 2.4 1.1-1.4 2.4-2.4 4.2-2.4 3 0 5 3 3.8 5.8-2 4.6-9 9-9 9Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0m-7 7v3m-4 0h8",
  plus: "M12 5v14M5 12h14",
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.5-2 5 5",
  send: "M12 5v14m0-14-5 5m5-5 5 5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.9 4.9 7 7m10 10 2.1 2.1M3 12h3m12 0h3M4.9 19.1 7 17m10-10 2.1-2.1",
  speaker: "M4 9v6h4l5 4V5L8 9H4Zm12 1a4 4 0 0 1 0 4m2-7a8 8 0 0 1 0 10",
  sparkles:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8L5 3Z",
  trash: "M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3",
  truck: "M3 6h11v9H3V6Zm11 3h4l3 3v3h-7V9ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  x: "M6 6l12 12M18 6 6 18",
};

const CHAT_DB_NAME = "kapruka-genie-chat";
const CHAT_STORE_NAME = "chat-state";
const CHAT_STATE_KEY = "current";
const CHAT_STORAGE_KEY = "kapruka-genie-chat-state";
const INTRO_PANEL_STORAGE_KEY = "kapruka-genie-intro-panel-date";
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function getValidatedPhoneNumber(value: string) {
  const trimmedValue = value.trim();
  const normalizedDigits = trimmedValue.replace(/\D/g, "");

  if (normalizedDigits.length < 7) {
    return {
      error: "Recipient phone number must have at least 7 digits.",
      normalizedValue: trimmedValue,
    };
  }

  return {
    error: "",
    normalizedValue: trimmedValue,
  };
}

function getTaskForMode(mode: string) {
  if (mode.includes("Event")) return "eventPlan";
  if (mode.includes("Gift Box")) return "giftBox";
  if (mode.includes("Compare")) return "compare";
  return "recommend";
}

function Icon({ name, className = "h-5 w-5" }: { className?: string; name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d={iconPaths[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function openChatDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CHAT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(CHAT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredChatState() {
  if (typeof indexedDB === "undefined") {
    const storedValue = localStorage.getItem(CHAT_STORAGE_KEY);
    return storedValue ? (JSON.parse(storedValue) as StoredChatState) : null;
  }

  const database = await openChatDatabase();

  return new Promise<StoredChatState | null>((resolve, reject) => {
    const transaction = database.transaction(CHAT_STORE_NAME, "readonly");
    const request = transaction.objectStore(CHAT_STORE_NAME).get(CHAT_STATE_KEY);

    request.onsuccess = () => resolve((request.result as StoredChatState) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeStoredChatState(state: StoredChatState) {
  if (typeof indexedDB === "undefined") {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
    return;
  }

  const database = await openChatDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHAT_STORE_NAME, "readwrite");
    const request = transaction
      .objectStore(CHAT_STORE_NAME)
      .put(state, CHAT_STATE_KEY);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function clearStoredChatState() {
  localStorage.removeItem(CHAT_STORAGE_KEY);

  if (typeof indexedDB === "undefined") {
    return;
  }

  const database = await openChatDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHAT_STORE_NAME, "readwrite");
    const request = transaction.objectStore(CHAT_STORE_NAME).delete(CHAT_STATE_KEY);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

const rotatingActivityMessages: Record<Language, string[]> = {
  English: [
    "Understanding your request...",
    "Checking your preferences...",
    "Searching Kapruka products...",
    "Matching the best options...",
    "Preparing your reply...",
  ],
  Sinhala: [
    "ඔබේ ඉල්ලීම තේරුම් ගනිමින්...",
    "Preferences පරීක්ෂා කරමින්...",
    "Kapruka products සොයමින්...",
    "හොඳම ගැළපීම් තෝරමින්...",
    "පිළිතුර සකස් කරමින්...",
  ],
  Singlish: [
    "Oyage request eka balamin...",
    "Preferences check karamin...",
    "Kapruka products hoyamin...",
    "Galapena options thoramin...",
    "Reply eka hadamin...",
  ],
  Tanglish: [
    "Unga request paathuttu irukken...",
    "Preferences check pannittu irukken...",
    "Kapruka products thedittu irukken...",
    "Best options match pannittu irukken...",
    "Reply ready pannittu irukken...",
  ],
};

export function KaprukaGenieApp() {
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const compareTableTopScrollRef = useRef<HTMLDivElement | null>(null);
  const compareTableBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const productCarouselRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const shouldSendRecordingRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatSoundContextRef = useRef<AudioContext | null>(null);
  const initialProductsLoadedRef = useRef(false);

  const [activeMode, setActiveMode] = useState("Smart Shopping");
  const [language, setLanguage] = useState<Language>("English");
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [chips, setChips] = useState(starterChips);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [isLoadingInitialProducts, setIsLoadingInitialProducts] =
    useState(true);
  const [fitReasons, setFitReasons] = useState<Record<string, string>>({});
  const [buyBox, setBuyBox] = useState<Product[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [checkoutDetails, setCheckoutDetails] = useState({
    address: "",
    locationType: "",
    recipientName: "",
    recipientPhone: "",
    senderName: "",
  });
  const [profile, setProfile] =
    useState<ShoppingProfile>(initialShoppingProfile);
  const [extendedPreferences, setExtendedPreferences] =
    useState<ExtendedPreferences>(() =>
      getExtendedPreferencesFromProfile(initialShoppingProfile),
    );
  const [conversationStage, setConversationStage] = useState<
    "first-message" | "collecting-context" | "ready"
  >("first-message");
  const [pendingUserRequest, setPendingUserRequest] = useState("");
  const [contextDraft, setContextDraft] =
    useState<ContextDraft>(emptyContextDraft);
  const [analytics, setAnalytics] = useState({
    buyBoxHealth: "Ready",
    conversionSignal: "High intent after budget and city are known",
    nextBestAction: "Ask for recipient phone and delivery slot",
    risk: "Perfume stock is limited",
  });
  const [giftMessage, setGiftMessage] = useState(
    "Wishing you a wonderful day filled with love and appreciation.",
  );
  const [status, setStatus] = useState(
    "Groq chat and media ready. Kapruka MCP commerce ready.",
  );
  const [canScrollProductCarouselLeft, setCanScrollProductCarouselLeft] =
    useState(false);
  const [canScrollProductCarouselRight, setCanScrollProductCarouselRight] =
    useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [isChatStateLoaded, setIsChatStateLoaded] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isInfoMenuOpen, setIsInfoMenuOpen] = useState(false);
  const [isBuyBoxOpen, setIsBuyBoxOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modeSessions, setModeSessions] = useState<Record<string, ModeSession>>({});
  const [compareIds, setCompareIds] = useState({ first: "", second: "" });
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [compareSuggestion, setCompareSuggestion] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [trackingResult, setTrackingResult] = useState("");
  const [trackingSuggestion, setTrackingSuggestion] = useState("");
  const [guidedPlanItems, setGuidedPlanItems] = useState<GuidedPlanItem[]>([]);
  const [guidedPlanIndex, setGuidedPlanIndex] = useState(0);
  const [guidedMoreCount, setGuidedMoreCount] = useState(0);
  const [isCompareSubmitting, setIsCompareSubmitting] = useState(false);
  const [isTrackingSubmitting, setIsTrackingSubmitting] = useState(false);
  const [isCheckoutCreating, setIsCheckoutCreating] = useState(false);
  const [checkoutWarning, setCheckoutWarning] = useState("");
  const [giftMessagePreferences, setGiftMessagePreferences] =
    useState<GiftMessagePreferences>({
      language: "English",
      size: "Short",
      suggestions: "",
      tone: "Warm",
    });
  const [isGiftMessageGenerating, setIsGiftMessageGenerating] = useState(false);
  const [isIntroPanelVisible, setIsIntroPanelVisible] = useState(false);
  const [isComposerMenuOpen, setIsComposerMenuOpen] = useState(false);
  const [isPromptPopupOpen, setIsPromptPopupOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const totals = useMemo(() => {
    const subtotal = buyBox.reduce((sum, product) => sum + product.price, 0);
    const delivery = buyBox.length > 0 ? deliveryFee : 0;
    return {
      delivery,
      subtotal,
      total: subtotal + delivery,
    };
  }, [buyBox, deliveryFee]);
  const text = { ...copy.English, ...copy[language], ...copyOverrides[language] } as Required<
    (typeof copy)["English"]
  >;
  const minimumDeliveryDate = getLocalDateString();
  const visibleProducts = recommendedProducts.slice(0, 3);
  const shouldShowProductSuggestions =
    conversationStage !== "collecting-context";
  const isSelectedProductInCart = selectedProduct
    ? buyBox.some((product) => product.id === selectedProduct.id)
    : false;
  const hasUserMessages = messages.some((message) => message.role === "user");
  const visibleReplyChips =
    activeMode === "Smart Shopping" && hasUserMessages
      ? chips.filter((chip) => chip === "Suggest more")
      : hasUserMessages
        ? chips.filter((chip) => !isRemovedGenericReplyChip(chip))
        : chips;
  const latestAssistantMessageIndex = messages.reduce(
    (latestIndex, message, index) =>
      message.role === "assistant" ? index : latestIndex,
    -1,
  );
  const cartCount = buyBox.length;
  const readAloudTitle =
    language === "Sinhala"
      ? "අවසන් message එක කියවන්න"
      : language === "Singlish"
        ? "Anthima message eka kiyawanna"
        : "Read latest message aloud";
  const isCompareMode = activeMode.includes("Compare");
  const isTrackingMode = activeMode.includes("Tracking");
  const isGiftMessageMode = activeMode.includes("Message");
  const isGuidedMode =
    activeMode.includes("Event") || activeMode.includes("Gift Box");
  const isFormToolMode = isCompareMode || isTrackingMode || isGiftMessageMode;
  const suggestedPrompts = suggestedPromptsByLanguage[language];

  useEffect(() => {
    if (!isPromptPopupOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!composerRef.current?.contains(event.target as Node)) {
        setIsPromptPopupOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPromptPopupOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPromptPopupOpen]);

  function closeIntroPanel() {
    setIsIntroPanelVisible(false);
  }

  function getChipLabel(chip: string) {
    const localizedLabel =
      starterChipOverrides[language][chip] ??
      starterChipLabels[language][chip] ??
      commonChipLabels[language][chip] ??
      dynamicChipLabels[language][chip] ??
      contextOptionLabels[language][chip] ??
      optionLabels[language][chip] ??
      chip;

    return localizedLabel.trim().split(/\s+/u).slice(0, 3).join(" ");
  }

  function getGuidedReplyChips() {
    return ["Previous item", "Next item", "Suggest more"];
  }

  function isRemovedGenericReplyChip(chip: string) {
    return /\b(check delivery|delivery check|create order link|order link|open checkout|more like this|search products|track order)\b|බෙදාහැරීම|ඇණවුම්\s+සබැඳිය/iu.test(
      chip,
    );
  }

  function getOptionLabel(option: string) {
    return (
      contextOptionLabels[language][option] ??
      optionLabels[language][option] ??
      option
    );
  }

  function getLocalizedUserText(value: string) {
    return getChipLabel(value);
  }

  function getContextFieldLabel(field: ContextField) {
    return (
      contextFieldLabelOverrides[language][field] ??
      contextFieldLabelsByLanguage[language][field]
    );
  }

  function getModeIntroMessage(mode: string, selectedLanguage = language) {
    const localizedText = {
      ...copy.English,
      ...copy[selectedLanguage],
      ...copyOverrides[selectedLanguage],
    } as Required<(typeof copy)["English"]>;

    if (mode.includes("Event")) return localizedText.eventPrompt;
    if (mode.includes("Gift Box")) return localizedText.giftBoxPrompt;
    if (mode.includes("Compare")) return localizedText.comparePrompt;
    if (mode.includes("Tracking")) return localizedText.trackingPrompt;
    return starterMessagesByLanguage[selectedLanguage][0].content;
  }

  function getDefaultModeSession(mode: string): ModeSession {
    if (mode === "Smart Shopping") {
      return {
        chips: starterChips,
        contextDraft: emptyContextDraft,
        conversationStage: "first-message",
        extendedPreferences: getExtendedPreferencesFromProfile(
          initialShoppingProfile,
        ),
        fitReasons: {},
        input: "",
        messages: starterMessagesByLanguage[language],
        pendingUserRequest: "",
        profile: normalizeShoppingProfile(initialShoppingProfile),
        recommendedProducts: [],
      };
    }

    const needsContext = mode.includes("Event") || mode.includes("Gift Box");

    return {
      chips: [],
      contextDraft: emptyContextDraft,
      conversationStage: needsContext ? "collecting-context" : "ready",
      extendedPreferences: getExtendedPreferencesFromProfile(profile),
      fitReasons: {},
      input: "",
      messages: [
        {
          role: "assistant",
          content: getModeIntroMessage(mode),
          variant: needsContext ? "context-panel" : undefined,
        },
      ],
      pendingUserRequest: mode.includes("Event")
        ? "Plan an event"
        : mode.includes("Gift Box")
          ? "Build a gift box"
          : "",
      profile: normalizeShoppingProfile(profile),
      recommendedProducts: [],
    };
  }

  function getCurrentModeSession(): ModeSession {
    return {
      chips,
      contextDraft,
      conversationStage,
      extendedPreferences,
      fitReasons,
      input,
      messages,
      pendingUserRequest,
      profile: normalizeShoppingProfile(profile),
      recommendedProducts,
    };
  }

  function applyModeSession(session: ModeSession) {
    const normalizedSession = normalizeModeSession(session);

    setChips(normalizedSession.chips);
    setContextDraft(normalizedSession.contextDraft);
    setConversationStage(normalizedSession.conversationStage);
    setExtendedPreferences(
      normalizeExtendedPreferences(
        normalizedSession.extendedPreferences,
        normalizedSession.profile,
      ),
    );
    setFitReasons(normalizedSession.fitReasons ?? {});
    setInput(normalizedSession.input);
    setMessages(normalizedSession.messages);
    setPendingUserRequest(normalizedSession.pendingUserRequest);
    setProfile(normalizedSession.profile);
    setRecommendedProducts(normalizedSession.recommendedProducts ?? []);
  }

  function resetToolPanels() {
    setCompareRows([]);
    setCompareSuggestion("");
    setTrackingResult("");
    setTrackingSuggestion("");
    setGuidedPlanItems([]);
    setGuidedPlanIndex(0);
  }

  function getCommerceReply(data: CommerceResponse) {
    const reply = stripModelThinking(data.reply ?? "").trim();

    if (!reply) {
      return reply;
    }

    if (activeMode.includes("Event") || activeMode.includes("Gift Box")) {
      return `${reply}`;
    }

    return reply;
  }

  function getGuidedReplyIntro() {
    if (language === "Sinhala") {
      return "මේවා තමයි ඔයාට ඕනෙ වෙන්න‌ේ.";
    }

    if (language === "Singlish") {
      return "Meඅa thamai oyata ona wenne.";
    }

    if (language === "Tanglish") {
      return "Idhu dhan neenga wanted pannadhu.";
    }

    return "This is what you need.";
  }

  function getRetryableFailureType(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();

    if (/timed?\s*out|timeout/.test(message)) {
      return "timeout" as const;
    }

    return null;
  }

  function getRetryFailureReply() {
    if (language === "Sinhala") {
      return "Model quota සීමාව ඉවර වෙලා. නැවත උත්සාහ කරන්න, නැත්නම් English වලට මාරු වෙන්න.";
    }

    if (language === "Singlish") {
      return "Model quota limit eka iwara wela. Ayeth try karanna nathnam English walata maru wenna.";
    }

    if (language === "Tanglish") {
      return "Model quota limit reach aayiduchu. Retry pannunga illenna English ku maathunga.";
    }

    return "Model quota limit reached. Please try again or switch to English.";
  }

  function addRetryFailure(
    error: unknown,
    retryText: string,
    retryContext = false,
  ) {
    const failureType = getRetryableFailureType(error);

    if (!failureType) {
      return false;
    }

    const content = getRetryFailureReply();
    addMessage({
      role: "assistant",
      content,
      retryContext,
      retryReason: "timeout",
      retryText,
    });
    setStatus(content);
    return true;
  }

  function getTryAgainLabel() {
    if (language === "Sinhala") return "නැවත උත්සාහ කරන්න";
    if (language === "Singlish") return "Ayeth try karanna";
    if (language === "Tanglish") return "Retry pannunga";
    return "Try again";
  }

  function getSwitchToEnglishLabel() {
    if (language === "Sinhala") return "English walata maru wenna";
    if (language === "Singlish") return "English walata maru wenna";
    if (language === "Tanglish") return "English ku maathunga";
    return "Switch to English";
  }

  function getEmptyCartWarning(selectedLanguage: Language = language) {
    if (selectedLanguage === "Sinhala") {
      return "Create Order Link click karanna kalin cart ekata item ekak hari add karanna.";
    }
    if (selectedLanguage === "Singlish") {
      return "Create Order Link click karanna kalin cart ekata item ekak add karanna.";
    }
    if (selectedLanguage === "Tanglish") {
      return "Create Order Link click pannurathukku munnaadi cart ku oru item add pannunga.";
    }
    return "Please add at least one item to the cart before creating the order link.";
  }

  function getParticipantCount(draft: ContextDraft) {
    const source = draft.participants || "";

    if (source.includes("Above 50")) return 60;
    if (source.includes("25 - 50")) return 40;
    if (source.includes("10 - 25")) return 20;
    if (source.includes("Under 10")) return 8;

    return 12;
  }

  function getGiftBoxItemCount(draft: ContextDraft) {
    const match = (draft.itemCount || "").match(/\d+/);
    return match ? Number(match[0]) : 3;
  }

  function getPlanSearchTerm(item: GuidedPlanItem | string) {
    const value = typeof item === "string" ? item : item.searchTerm || item.label;
    const normalized = value.toLowerCase();

    if (normalized.includes("cake")) return "cake";
    if (normalized.includes("flower") || normalized.includes("rose")) return "flowers";
    if (normalized.includes("chocolate")) return "chocolate";
    if (normalized.includes("perfume")) return "perfume";
    if (normalized.includes("sweet")) return "sweets";
    if (normalized.includes("decor")) return "decorations";
    if (normalized.includes("party")) return "party";
    if (normalized.includes("snack")) return "snacks";

    if (normalized.includes("card")) return "greeting card";

    return value.replace(/^\d+[\).:-]?\s*/, "").slice(0, 80) || "gift";
  }

  function getMoreSearchTerm(item: GuidedPlanItem, count: number) {
    const baseTerm = getPlanSearchTerm(item);
    const strictTerms: Record<string, string[]> = {
      cake: ["cake", "birthday cake", "chocolate cake", "celebration cake"],
      chocolate: ["chocolate", "chocolate box", "chocolate hamper", "chocolates"],
      flowers: ["flowers", "flower bouquet", "roses", "fresh flowers"],
      perfume: ["perfume", "fragrance", "perfume gift", "body spray"],
      snacks: ["snacks", "snack pack", "party snacks", "savory snacks"],
    };
    const options = strictTerms[baseTerm] ?? [baseTerm];

    return options[count % options.length];
  }

  function formatGuidedPlanItem(item: GuidedPlanItem) {
    return `${item.label} - ${item.quantity}`;
  }

  function getDefaultPlanItems(mode: string, draft: ContextDraft): GuidedPlanItem[] {
    if (mode.includes("Gift Box")) {
      const theme = draft.giftBoxTheme || draft.category || profile.category;
      const itemCount = getGiftBoxItemCount(draft);

      if (theme === "Flowers") {
        return [
          { label: "flowers", quantity: "1 bouquet", searchTerm: "flowers" },
          { label: "chocolates", quantity: `${Math.max(1, itemCount - 1)} boxes`, searchTerm: "chocolate" },
          { label: "card", quantity: "1 card", searchTerm: "greeting card" },
        ];
      }

      if (theme === "Perfume") {
        return [
          { label: "perfume", quantity: "1 bottle", searchTerm: "perfume" },
          { label: "chocolates", quantity: `${Math.max(1, itemCount - 1)} boxes`, searchTerm: "chocolate" },
          { label: "flowers", quantity: "1 small bouquet", searchTerm: "flowers" },
        ];
      }

      if (theme === "Party") {
        return [
          { label: "cake", quantity: "1kg", searchTerm: "cake" },
          { label: "party pack", quantity: `${itemCount} items`, searchTerm: "party pack" },
          { label: "chocolates", quantity: "1 box", searchTerm: "chocolate" },
        ];
      }

      return [
        { label: "chocolates", quantity: `${itemCount} items`, searchTerm: "chocolate" },
        { label: "flowers", quantity: "1 bouquet", searchTerm: "flowers" },
        { label: "cake", quantity: "1kg", searchTerm: "cake" },
      ];
    }

    const participants = getParticipantCount(draft);
    const cakeKg = Math.max(1, Math.ceil(participants / 12));

    return [
      { label: "cake", quantity: `${cakeKg}kg`, searchTerm: "cake" },
      { label: "flowers", quantity: "1-2 bouquets", searchTerm: "flowers" },
      { label: "chocolates", quantity: `${Math.ceil(participants / 8)} boxes`, searchTerm: "chocolate" },
      { label: "snacks", quantity: `${participants} servings`, searchTerm: "snacks" },
    ];
  }

  function normalizeGuidedPlanItems(
    items: string[],
    mode = activeMode,
    draft = contextDraft,
  ) {
    const fallback = getDefaultPlanItems(mode, draft);

    if (mode.includes("Event")) {
      return fallback;
    }

    return items.length > 0
      ? items.slice(0, 4).map((item, index) => ({
          label:
            item.replace(/^[-*\d.)\s]+/, "").split("-")[0].trim() ||
            fallback[index]?.label ||
            "gift",
          quantity: fallback[index]?.quantity || "1 item",
          searchTerm: fallback[index]?.searchTerm || getPlanSearchTerm(item),
        }))
      : fallback;
  }

  function getGuidedPlanReply(
    items: GuidedPlanItem[],
    index = 0,
    replyLanguage = language,
  ) {
    const nextItem = items[index]?.label ?? items[0]?.label ?? "gift";
    const itemList = items
      .map((item) => `- ${formatGuidedPlanItem(item)}`)
      .join("\n");

    if (replyLanguage === "Sinhala") {
      return `යෝජිත අයිතම ලැයිස්තුව:\n${itemList}\n\nමුලින්ම ${nextItem} සඳහා options පෙන්වන්නම්. ඊළඟ අයිතමයට යන්න Next item ඔබන්න.`;
    }

    if (replyLanguage === "Singlish") {
      return `Yojitha item list eka:\n${itemList}\n\nMulinnama ${nextItem} walata options pennannam. Ilanga item ekata yanna Next item obanna.`;
    }

    if (replyLanguage === "Tanglish") {
      return `Suggested item list:\n${itemList}\n\nMudhal la ${nextItem} ku options kaamikiren. Adutha item ku poganum na Next item use pannunga.`;
    }

    return `Suggested item list:\n${itemList}\n\nI will start by showing options for ${nextItem}. Use Next item to move through the list.`;
  }

  function getStepReply(item: GuidedPlanItem | string, isMore = false) {
    const label = typeof item === "string" ? item : formatGuidedPlanItem(item);

    if (isMore) {
      if (language === "Sinhala") return `${label} walata thawa options pennanawa.`;
      if (language === "Singlish") return `${label} walata thawa options pennanawa.`;
      if (language === "Tanglish") return `${label} ku innum sila options kaamikiren.`;
      return `I will show more options for ${label}.`;
    }

    if (typeof item !== "string") {
      if (language === "Sinhala") return `Dan ${label} walata cards pennanawa.`;
      if (language === "Singlish") return `Dan ${label} walata cards pennanawa.`;
      if (language === "Tanglish") return `Ippo ${label} ku cards kaatturen.`;
      return `Now I will suggest ${label}.`;
    }

    if (language === "Sinhala") return `දැන් ${item} සඳහා cards පෙන්වනවා.`;
    if (language === "Singlish") return `Dan ${item} walata cards pennanawa.`;
    if (language === "Tanglish") return `Ippo ${item} ku cards kaatturen.`;
    return `Now I will suggest ${item}.`;
  }

  function getImageSearchReply(data: ImageResponse) {
    const imageSummary = data.summary?.trim();

    if (data.fallback) {
      return text.relatedGiftsReply;
    }

    return imageSummary
      ? `${text.imageLooksLike} ${imageSummary}. ${text.relatedGiftsReply}`
      : text.relatedGiftsReply;
  }

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setGiftMessagePreferences((current) => ({
      ...current,
      language: nextLanguage,
    }));
    setCheckoutWarning((current) =>
      current ? getEmptyCartWarning(nextLanguage) : current,
    );
    setMessages((current) => {
      const starterContent = new Set(
        Object.values(starterMessagesByLanguage).map(
          ([message]) => message.content,
        ),
      );
      const modeIntroContent = new Set(
        languageOptions.flatMap((option) =>
          modes.map((mode) => getModeIntroMessage(mode.name, option)),
        ),
      );

      if (
        current.length === 1 &&
        current[0].role === "assistant" &&
        starterContent.has(current[0].content)
      ) {
        return starterMessagesByLanguage[nextLanguage];
      }

      if (
        current.length === 1 &&
        current[0].role === "assistant" &&
        modeIntroContent.has(current[0].content)
      ) {
        return [
          {
            ...current[0],
            content: getModeIntroMessage(activeMode, nextLanguage),
          },
        ];
      }

      return current;
    });
  }

  function renderInlineText(value: string) {
    return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      return <span key={index}>{part}</span>;
    });
  }

  function renderChatMessage(content: string) {
    const cleanedContent = stripModelThinking(content);
    const lines = cleanedContent
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    const cellsFromRow = (line: string) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
    const elements: ReactNode[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const nextLine = lines[index + 1];
      const isTableStart =
        line.includes("|") && Boolean(nextLine?.match(/^\|?[\s:-]+\|[\s|:-]+$/));

      if (isTableStart) {
        const headers = cellsFromRow(line);
        const rows: string[][] = [];
        index += 2;

        while (index < lines.length && lines[index].includes("|")) {
          rows.push(cellsFromRow(lines[index]));
          index += 1;
        }

        index -= 1;
        elements.push(
          <div key={`table-${index}`} className="max-w-full overflow-x-auto rounded-xl border border-[#d9cdea] bg-white">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-[#f6f4fb] text-[#3f246d]">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="border-b border-[#e8e2f2] px-3 py-2 font-black break-words [overflow-wrap:anywhere]">
                      {renderInlineText(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${rowIndex}-${cellIndex}`} className="border-b border-[#f0e9fb] px-3 py-2 align-top break-words [overflow-wrap:anywhere]">
                        {renderInlineText(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)/);
      const numberedMatch = line.match(/^\d+[.)]\s+(.+)/);

      if (bulletMatch || numberedMatch) {
        elements.push(
          <div key={`${line}-${index}`} className="flex min-w-0 gap-2 break-words [overflow-wrap:anywhere]">
            <span className="mt-[0.55rem] h-1.5 w-1.5 flex-none rounded-full bg-current opacity-60" />
            <span>{renderInlineText(bulletMatch?.[1] ?? numberedMatch?.[1] ?? line)}</span>
          </div>,
        );
      } else {
        elements.push(
          <p key={`${line}-${index}`} className="break-words [overflow-wrap:anywhere]">
            {renderInlineText(line)}
          </p>,
        );
      }
    }

    return <div className="grid min-w-0 gap-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{elements}</div>;
  }

  function renderCompareTool() {
    const productOne = compareRows[0]?.product;
    const productTwo = compareRows[1]?.product;
    const finalComparison =
      compareSuggestion && !isGenericCompareSuggestion(compareSuggestion)
        ? compareSuggestion
        : getLocalCompareSummary(productOne, productTwo);
    const criteriaRows = productOne && productTwo
      ? [
          ["ID", productOne.id, productTwo.id],
          ["Name", productOne.name, productTwo.name],
          [
            "Price",
            formatPrice(productOne.price, productOne.currency),
            formatPrice(productTwo.price, productTwo.currency),
          ],
          ["Description", productOne.description, productTwo.description],
        ]
      : [];

    return (
      <div className="grid gap-4">
        <form
          onSubmit={(event) => void handleCompareSubmit(event)}
          className="grid gap-3 rounded-[18px] border border-[#e8e2f2] bg-white p-4"
        >
          <div>
            <h2 className="text-lg font-black text-[#3f246d]">
              Product Compare
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#675f79]">
              Get product IDs from product cards in Smart Shopping mode.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold text-[#675f79]">
              Product ID 1
              <input
                value={compareIds.first}
                onChange={(event) =>
                  setCompareIds((current) => ({
                    ...current,
                    first: event.target.value,
                  }))
                }
                className="h-12 rounded-[14px] border border-[#e8e2f2] px-3 text-base text-[#161226] outline-none"
                placeholder="Enter product ID"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-[#675f79]">
              Product ID 2
              <input
                value={compareIds.second}
                onChange={(event) =>
                  setCompareIds((current) => ({
                    ...current,
                    second: event.target.value,
                  }))
                }
                className="h-12 rounded-[14px] border border-[#e8e2f2] px-3 text-base text-[#161226] outline-none"
                placeholder="Enter product ID"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={
              isCompareSubmitting ||
              !compareIds.first.trim() ||
              !compareIds.second.trim()
            }
            className="h-12 rounded-[14px] bg-[#ffdf00] px-5 text-sm font-black text-[#1a0f2e] disabled:opacity-50"
          >
            {isCompareSubmitting ? "Comparing..." : "Compare products"}
          </button>
        </form>

        {(!productOne || !productTwo) && compareSuggestion ? (
          <div className="rounded-[18px] border border-[#e8e2f2] bg-white p-4 text-sm leading-6 text-[#675f79]">
            {compareSuggestion}
          </div>
        ) : null}

        {productOne && productTwo ? (
          <div className="overflow-hidden rounded-[18px] border border-[#e8e2f2] bg-white">
            <div
              ref={compareTableTopScrollRef}
              className="overflow-x-scroll border-b border-[#f0e9fb] md:hidden"
              onScroll={(event) => {
                if (compareTableBottomScrollRef.current) {
                  compareTableBottomScrollRef.current.scrollLeft =
                    event.currentTarget.scrollLeft;
                }
              }}
            >
              <div className="h-4 min-w-[720px]" />
            </div>
            <div
              ref={compareTableBottomScrollRef}
              className="overflow-x-scroll pb-2"
              onScroll={(event) => {
                if (compareTableTopScrollRef.current) {
                  compareTableTopScrollRef.current.scrollLeft =
                    event.currentTarget.scrollLeft;
                }
              }}
            >
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-[#f6f4fb] text-[#3f246d]">
                  <tr>
                    <th className="w-[22%] p-3 font-black">Criteria</th>
                    <th className="w-[39%] p-3 font-black">Product 1</th>
                    <th className="w-[39%] p-3 font-black">Product 2</th>
                  </tr>
                </thead>
                <tbody>
                  {criteriaRows.map(([criteria, first, second]) => (
                    <tr key={criteria} className="border-t border-[#e8e2f2]">
                      <td className="p-3 align-top font-black text-[#3f246d]">
                        {criteria}
                      </td>
                      <td className="p-3 align-top leading-6 text-[#161226]">
                        {first}
                      </td>
                      <td className="p-3 align-top leading-6 text-[#161226]">
                        {second}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#e8e2f2]">
                    <td className="p-3 align-top font-black text-[#3f246d]">
                      Final comparison
                    </td>
                    <td
                      colSpan={2}
                      className="p-3 align-top leading-6 text-[#161226]"
                    >
                      {finalComparison}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderTrackingTool() {
    return (
      <div className="grid gap-4">
        <form
          onSubmit={(event) => void handleTrackingSubmit(event)}
          className="grid gap-3 rounded-[18px] border border-[#e8e2f2] bg-white p-4"
        >
          <div>
            <h2 className="text-lg font-black text-[#3f246d]">
              Order Tracking
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#675f79]">
              Enter the Kapruka order or tracking ID.
            </p>
          </div>
          <label className="grid gap-1 text-sm font-bold text-[#675f79]">
            Tracking ID
            <input
              value={trackingId}
              onChange={(event) => setTrackingId(event.target.value)}
              className="h-12 rounded-[14px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
              placeholder="Enter tracking ID"
            />
          </label>
          <button
            type="submit"
            disabled={isTrackingSubmitting || !trackingId.trim()}
            className="h-12 rounded-[14px] bg-[#ffdf00] px-5 text-sm font-black text-[#1a0f2e] disabled:opacity-50"
          >
            {isTrackingSubmitting ? "Checking..." : "Track order"}
          </button>
        </form>

        {trackingResult ? (
          <div className="grid gap-3 rounded-[18px] border border-[#e8e2f2] bg-white p-4">
            <div>
              <h3 className="text-sm font-black uppercase text-[#3f246d]">
                Tracking output
              </h3>
              <div className="mt-2 text-sm leading-6 text-[#161226]">
                {renderChatMessage(trackingResult)}
              </div>
            </div>
            <div className="rounded-[14px] bg-[#f6f4fb] p-3 text-sm leading-6 text-[#675f79]">
              <strong className="text-[#3f246d]">AI suggestion: </strong>
              {trackingSuggestion || "No AI suggestion returned."}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderGiftMessageTool() {
    return (
      <div className="grid min-h-0 gap-4 md:h-full md:grid-rows-[minmax(180px,1fr)_auto]">
        <section className="flex min-h-0 flex-col rounded-[18px] border border-[#e8e2f2] bg-white p-4">
          <div className="mb-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-black text-[#3f246d]">
              Gift Message
            </h2>
            <button
              type="button"
              onClick={() => void generateGiftMessage("")}
              disabled={isGiftMessageGenerating}
              className="h-10 w-full rounded-[12px] bg-[#ffdf00] px-4 text-sm font-black text-[#1a0f2e] disabled:opacity-50 sm:w-auto"
            >
              {isGiftMessageGenerating ? "Generating..." : "Generate default"}
            </button>
          </div>
          <textarea
            value={giftMessage}
            onChange={(event) => setGiftMessage(event.target.value)}
            className="min-h-[180px] w-full flex-1 resize-none rounded-[14px] border border-[#e8e2f2] bg-[#fbf9ff] p-4 text-base leading-7 text-[#161226] outline-none md:min-h-[140px]"
          />
        </section>

        <form
          onSubmit={(event) => void handleGiftMessageSubmit(event)}
          className="grid gap-3 rounded-[18px] border border-[#e8e2f2] bg-white p-4"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-bold text-[#675f79]">
              Language
              <select
                value={giftMessagePreferences.language}
                onChange={(event) =>
                  setGiftMessagePreferences((current) => ({
                    ...current,
                    language: event.target.value,
                  }))
                }
                className="h-11 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-[#161226] outline-none"
              >
                <option>English</option>
                <option>Sinhala</option>
                <option>Singlish</option>
                <option>Tanglish</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[#675f79]">
              Size
              <select
                value={giftMessagePreferences.size}
                onChange={(event) =>
                  setGiftMessagePreferences((current) => ({
                    ...current,
                    size: event.target.value,
                  }))
                }
                className="h-11 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-[#161226] outline-none"
              >
                <option>Short</option>
                <option>Medium</option>
                <option>Long</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[#675f79]">
              Tone
              <select
                value={giftMessagePreferences.tone}
                onChange={(event) =>
                  setGiftMessagePreferences((current) => ({
                    ...current,
                    tone: event.target.value,
                  }))
                }
                className="h-11 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-[#161226] outline-none"
              >
                <option>Warm</option>
                <option>Romantic</option>
                <option>Respectful</option>
                <option>Funny</option>
                <option>Formal</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-bold text-[#675f79]">
            Suggestions
            <textarea
              value={giftMessagePreferences.suggestions}
              onChange={(event) =>
                setGiftMessagePreferences((current) => ({
                  ...current,
                  suggestions: event.target.value,
                }))
              }
              rows={3}
              className="resize-none rounded-[12px] border border-[#e8e2f2] px-3 py-2 text-[#161226] outline-none"
              placeholder="Example: make it romantic, mention birthday, keep it simple..."
            />
          </label>
          <button
            type="submit"
            disabled={isGiftMessageGenerating}
            className="h-12 rounded-[14px] bg-[#3f246d] px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {isGiftMessageGenerating ? "Updating..." : "Update message"}
          </button>
        </form>
      </div>
    );
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!isSending) {
      return;
    }

    const messagesForLanguage = rotatingActivityMessages[language];
    let nextMessageIndex = 0;
    const intervalId = window.setInterval(() => {
      setActivityMessage(messagesForLanguage[nextMessageIndex]);
      nextMessageIndex = (nextMessageIndex + 1) % messagesForLanguage.length;
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [isSending, language]);

  useEffect(() => {
    if (isFormToolMode || isMobileViewport) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const container = chatScrollContainerRef.current;
      if (container) {
        container.scrollTo({
          behavior: "smooth",
          top: container.scrollHeight,
        });
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    activityMessage,
    chips,
    isFormToolMode,
    isMobileViewport,
    messages,
    recommendedProducts,
  ]);

  useEffect(() => {
    if (isFormToolMode || !isMobileViewport) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const container = chatScrollContainerRef.current;
      const latestMessage = latestMessageRef.current;

      if (!container || !latestMessage) {
        return;
      }

      const nextTop = latestMessage.offsetTop - container.offsetTop;
      container.scrollTo({
        behavior: "smooth",
        top: nextTop,
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isFormToolMode, isMobileViewport, messages]);

  useEffect(() => {
    const today = getLocalDateString();

    try {
      if (localStorage.getItem(INTRO_PANEL_STORAGE_KEY) === today) {
        return;
      }
    } catch {
      // If storage is unavailable, still show the welcome sheet for this load.
    }

    const showTimer = window.setTimeout(() => {
      setIsIntroPanelVisible(true);

      try {
        localStorage.setItem(INTRO_PANEL_STORAGE_KEY, today);
      } catch {
        // Ignore private browsing or storage quota errors.
      }
    }, 3000);

    return () => {
      window.clearTimeout(showTimer);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreChatState() {
      try {
        const storedState = await readStoredChatState();

        if (!isMounted) {
          return;
        }

        if (storedState) {
          const restoredMode = storedState.activeMode ?? "Smart Shopping";
          const restoredSessions = normalizeModeSessions(
            storedState.modeSessions ?? {},
          );
          const restoredSession =
            restoredSessions[restoredMode] ?? {
              chips: storedState.chips,
              contextDraft: storedState.contextDraft,
              conversationStage: storedState.conversationStage,
              extendedPreferences: normalizeExtendedPreferences(
                storedState.extendedPreferences,
                storedState.profile,
              ),
              fitReasons: storedState.fitReasons ?? {},
              input: storedState.input,
              messages: storedState.messages,
              pendingUserRequest: storedState.pendingUserRequest,
              profile: normalizeShoppingProfile(storedState.profile),
              recommendedProducts: storedState.recommendedProducts ?? [],
            };
          const shouldUseFreshStarterChips =
            restoredSession.conversationStage === "first-message" &&
            !restoredSession.messages.some((message) => message.role === "user");
          const sessionToApply = shouldUseFreshStarterChips
            ? {
                ...restoredSession,
                chips: starterChips,
              }
            : restoredSession;

          setActiveMode(restoredMode);
          setLanguage(storedState.language);
          setModeSessions(restoredSessions);
          setBuyBox(storedState.buyBox ?? []);
          applyModeSession(sessionToApply);
        }
      } catch (error) {
        if (isMounted) {
          setStatus(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsChatStateLoaded(true);
        }
      }
    }

    void restoreChatState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isChatStateLoaded) {
      return;
    }

    void writeStoredChatState({
      activeMode,
      chips,
      contextDraft,
      conversationStage,
      extendedPreferences,
      fitReasons,
      input,
      language,
      messages,
      buyBox,
      profile,
      recommendedProducts,
      modeSessions: {
        ...modeSessions,
        [activeMode]: {
          chips,
          contextDraft,
          conversationStage,
          extendedPreferences,
          fitReasons,
          input,
          messages,
          pendingUserRequest,
          profile,
          recommendedProducts,
        },
      },
      pendingUserRequest,
    });
  }, [
    activeMode,
    chips,
    contextDraft,
    conversationStage,
    extendedPreferences,
    fitReasons,
    input,
    isChatStateLoaded,
    language,
    messages,
    buyBox,
    modeSessions,
    pendingUserRequest,
    profile,
    recommendedProducts,
  ]);

  useEffect(() => {
    if (!isChatStateLoaded) {
      return;
    }

    if (initialProductsLoadedRef.current) {
      return;
    }

    if (recommendedProducts.length > 0) {
      initialProductsLoadedRef.current = true;
      window.setTimeout(() => setIsLoadingInitialProducts(false), 0);
      return;
    }

    initialProductsLoadedRef.current = true;
    let isMounted = true;

    async function loadInitialProducts() {
      const maxAttempts = 3;

      async function requestInitialProducts(attempt: number) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 7000);

        try {
          const response = await fetch("/api/ai/commerce", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cartIds: [],
              mode: "Smart Shopping",
              profile: normalizeShoppingProfile(initialShoppingProfile),
              query: "gift",
              task: "initial",
            }),
            signal: controller.signal,
          });
          const data = (await response.json()) as CommerceResponse & {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(data.error ?? "Kapruka MCP product load failed.");
          }

          if (!data.products || data.products.length === 0) {
            throw new Error(
              `Kapruka MCP returned no starter products on attempt ${attempt}.`,
            );
          }

          return data;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      try {
        let data: (CommerceResponse & { error?: string }) | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          if (!isMounted) {
            return;
          }

          setStatus(
            attempt === 1
              ? "Kapruka MCP is loading live starter products."
              : `Kapruka MCP returned empty/error. Retrying ${attempt}/${maxAttempts}.`,
          );

          try {
            data = await requestInitialProducts(attempt);
            break;
          } catch (error) {
            if (attempt === maxAttempts) {
              throw error;
            }
          }
        }

        if (!isMounted || !data) {
          return;
        }

        if (data.products && data.products.length > 0) {
          setRecommendedProducts(data.products);
        }

        if (data.recommendations) {
          setFitReasons(
            data.recommendations.reduce<Record<string, string>>(
              (nextReasons, recommendation) => {
                nextReasons[recommendation.id] =
                  `${recommendation.fitScore}% - ${recommendation.reason}`;
                return nextReasons;
              },
              {},
            ),
          );
        }

        if (data.delivery?.rate !== undefined) {
          setDeliveryFee(data.delivery.rate);
        }

        if (data.analytics) {
          setAnalytics((current) => ({
            buyBoxHealth: data.analytics?.buyBoxHealth ?? current.buyBoxHealth,
            conversionSignal:
              data.analytics?.conversionSignal ?? current.conversionSignal,
            nextBestAction:
              data.analytics?.nextBestAction ?? current.nextBestAction,
            risk: data.analytics?.risk ?? current.risk,
          }));
        }

        setStatus("Kapruka products ready.");
      } catch (error) {
        if (isMounted) {
          const message =
            error instanceof DOMException && error.name === "AbortError"
              ? "Kapruka products timed out after automatic retries."
              : getErrorMessage(error);
          setStatus(message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingInitialProducts(false);
        }
      }
    }

    void loadInitialProducts();

    return () => {
      isMounted = false;
    };
  }, [isChatStateLoaded, recommendedProducts.length]);

  function addMessage(message: ChatMessage) {
    if (message.role === "assistant") {
      playChatSound("receive");
    }
    setMessages((current) => [...current, message]);
  }

  function appendAssistantMessage(content: string) {
    if (!content.trim()) {
      return;
    }

    addMessage({
      role: "assistant",
      content,
    });
  }

  function markReplyGeneratedForCount(replyCount: number) {
    setExtendedPreferences((current) =>
      replyCount > current.lastRepliedCount
        ? { ...current, lastRepliedCount: replyCount }
        : current,
    );
  }

  function appendAssistantMessageForReplyCount(
    content: string,
    replyPreferences = extendedPreferences,
  ) {
    if (!content.trim()) {
      return;
    }

    if (
      replyPreferences.replyCount > 0 &&
      replyPreferences.replyCount <= replyPreferences.lastRepliedCount
    ) {
      return;
    }

    appendAssistantMessage(content);
    if (replyPreferences.replyCount > 0) {
      markReplyGeneratedForCount(replyPreferences.replyCount);
    }
  }

  function playChatSound(type: "receive" | "send") {
    if (typeof window === "undefined") {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    try {
      const context =
        chatSoundContextRef.current ?? new AudioContextCtor();

      chatSoundContextRef.current = context;

      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;
      const duration = type === "send" ? 0.08 : 0.12;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        type === "send" ? 660 : 520,
        startAt,
      );
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.03, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        startAt + duration,
      );

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    } catch {
      // Ignore audio playback failures so chat flow stays uninterrupted.
    }
  }

  function updateSelectedPreference(
    field: "budget" | "category" | "occasion" | "recipient",
    value: string,
  ) {
    setProfile((current) => ({ ...current, [field]: value }));
    const extendedField = field === "category" ? "giftType" : field;
    setExtendedPreferences((current) =>
      applyExtendedPreferenceUpdates(current, {
        [extendedField]: value,
      }),
    );
  }

  function addToBuyBox(product: Product) {
    setCheckoutWarning("");
    setBuyBox((current) =>
      current.some((item) => item.id === product.id)
        ? current
        : [...current, product],
    );
  }

  function removeFromBuyBox(productId: string) {
    setBuyBox((current) => current.filter((item) => item.id !== productId));
  }

  function applyCommerceResponse(
    data: CommerceResponse,
    applyPreferenceUpdates = false,
  ) {
    if (data.products) {
      setRecommendedProducts(data.products);
    }

    if (data.recommendations) {
      setFitReasons(
        data.recommendations.reduce<Record<string, string>>(
          (nextReasons, recommendation) => {
            nextReasons[recommendation.id] = `${recommendation.fitScore}% - ${recommendation.reason}`;
            return nextReasons;
          },
          {},
        ),
      );
    }

    if (data.chips) {
      setChips(data.chips);
    }

    if (data.analytics) {
      setAnalytics({
        buyBoxHealth: data.analytics.buyBoxHealth ?? analytics.buyBoxHealth,
        conversionSignal:
          data.analytics.conversionSignal ?? analytics.conversionSignal,
        nextBestAction:
          data.analytics.nextBestAction ?? analytics.nextBestAction,
        risk: data.analytics.risk ?? analytics.risk,
      });
    }

    if (data.delivery?.rate !== undefined) {
      setDeliveryFee(data.delivery.rate);
    }

    if (data.checkout?.checkout_url) {
      setCheckoutUrl(data.checkout.checkout_url);
    }

    if (data.giftMessage) {
      setGiftMessage(data.giftMessage);
    }

    if (applyPreferenceUpdates && data.preferences) {
      const nextPreferences = data.preferences;
      const profileUpdates = {
        budget: nextPreferences.budget,
        category: nextPreferences.category,
        occasion: nextPreferences.occasion,
        recipient: nextPreferences.recipient,
      };

      setProfile((current) => ({
        ...current,
        ...profileUpdates,
      }));
      setExtendedPreferences((current) =>
        mergeExtendedPreferencesWithProfile(
          current,
          profileUpdates,
          data.extendedPreferences,
        ),
      );
    } else if (data.extendedPreferences) {
      const { budget, giftType, occasion, recipient } = data.extendedPreferences;
      setExtendedPreferences((current) =>
        applyExtendedPreferenceUpdates(current, {
          budget,
          giftType,
          occasion,
          recipient,
        }),
      );
    }

  }

  async function runCommerce(
    query: string,
    mode = activeMode,
    profileOverride = profile,
    applyPreferenceUpdates = true,
    userMessage = query,
    preserveProfile = false,
    extendedPreferencesOverride = extendedPreferences,
  ) {
    const requestProfile = normalizeShoppingProfile(profileOverride);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 28000);
    const requestBody = JSON.stringify({
      cartIds: buyBox.map((product) => product.id),
      conversationHistory: messages
        .filter(
          (message) =>
            message.role === "user" || message.role === "assistant",
        )
        .slice(-3)
        .map(({ content, role }) => ({ content, role })),
      extendedPreferences: extendedPreferencesOverride,
      language,
      mode,
      profile: requestProfile,
      preserveProfile,
      query,
      task: getTaskForMode(mode),
      userMessage,
    });

    try {
      while (true) {
        let response: Response;

        try {
          response = await fetch("/api/ai/commerce", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: requestBody,
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("The request timed out. Please try again.");
          }

          throw error;
        }

        let data: (CommerceResponse & { error?: string }) | null = null;
        try {
          data = (await response.json()) as CommerceResponse & { error?: string };
        } catch {
          // Retry empty HTTP bodies until a valid response arrives or the
          // existing request deadline turns this into a visible timeout.
        }

        const errorMessage = data?.error ?? "";
        const isEmptyResponse =
          !data ||
          Object.keys(data).length === 0 ||
          /empty(?:\s+\w+)*\s+response/i.test(errorMessage);

        if (isEmptyResponse) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          continue;
        }

        if (!data) {
          continue;
        }

        if (!response.ok) {
          throw new Error(errorMessage || "Kapruka MCP commerce request failed.");
        }

        if (
          applyPreferenceUpdates &&
          !stripModelThinking(data.reply ?? "").trim()
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          continue;
        }

        applyCommerceResponse(data, applyPreferenceUpdates);
        return data;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function getContextDraftFromProfile(nextProfile: ShoppingProfile) {
    return {
      ...emptyContextDraft,
      budget: nextProfile.budget,
      category: nextProfile.category,
      occasion: nextProfile.occasion,
      recipient: nextProfile.recipient,
    };
  }

  function getContextQuestion(field: ContextField) {
    const overriddenQuestion = contextQuestionOverrides[language][field];

    if (overriddenQuestion) {
      return overriddenQuestion;
    }

    if (field === "category") {
      return contextQuestions[language][field] ?? giftTypeMessages[language];
    }

    return (
      contextQuestions[language][field] ??
      contextQuestions.English[field] ??
      contextFieldLabels[field]
    );
  }

  function mergeContextDraft(
    baseProfile: ShoppingProfile,
    draft: ContextDraft,
  ): ShoppingProfile {
    return {
      ...baseProfile,
      budget: draft.budget || baseProfile.budget,
      category:
        draft.category || draft.giftBoxTheme || draft.eventType || baseProfile.category,
      occasion: draft.occasion || draft.eventType || baseProfile.occasion,
      recipient: draft.recipient || draft.boxRecipient || baseProfile.recipient,
    };
  }

  function buildContextSummary(draft: ContextDraft) {
    const selectedContext = getContextFieldsForMode(activeMode)
      .map((field) => {
        const value = draft[field].trim();
        return value
          ? `${getContextFieldLabel(field)}: ${getOptionLabel(value)}`
          : null;
      })
      .filter((item): item is string => item !== null);

    return selectedContext.length > 0
      ? `Context selected: ${selectedContext.join(", ")}`
      : "Continue without context";
  }

  function getPreferenceDraftFromProfile(nextProfile: ShoppingProfile): ContextDraft {
    return getContextDraftFromProfile(nextProfile);
  }

  function buildPreferenceMessage(nextProfile: ShoppingProfile) {
    return buildContextSummary(getPreferenceDraftFromProfile(nextProfile));
  }

  async function analyzeFirstMessage(content: string) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 28000);
    const requestBody = JSON.stringify({
      context: {
        budget: profile.budget || null,
        category: profile.category || null,
        occasion: profile.occasion || null,
        recipient: profile.recipient || null,
      },
      message: content,
      selectedLanguage: language,
    });

    try {
      while (true) {
        let response: Response;
        try {
          response = await fetch("/api/ai/context-analysis", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: requestBody,
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("The request timed out. Please try again.");
          }

          throw error;
        }

        let data: ContextAnalysisResponse | null = null;
        try {
          data = (await response.json()) as ContextAnalysisResponse;
        } catch {
          // Retry an empty body within the same overall request deadline.
        }

        const errorMessage = data?.error ?? "";
        if (
          !data ||
          Object.keys(data).length === 0 ||
          /empty(?:\s+\w+)*\s+(?:analysis|response)/i.test(errorMessage)
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          continue;
        }

        if (!data) {
          continue;
        }

        if (!response.ok) {
          throw new Error(errorMessage || "Groq context analysis failed.");
        }

        return data;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function showContextPanel(
    nextProfile: ShoppingProfile,
    detectedLanguage = language,
  ) {
    setConversationStage("collecting-context");
    setContextDraft(getContextDraftFromProfile(nextProfile));
    setChips([]);
    addMessage({
      role: "assistant",
      content: getModeIntroMessage(activeMode, detectedLanguage),
      variant: "context-panel",
    });
    setStatus("Choose context chips or continue without context.");
  }

  async function answerWithCollectedContext(
    request: string,
    requestProfile: ShoppingProfile,
    requestDraft = contextDraft,
    requestExtendedPreferences = extendedPreferences,
  ) {
    setConversationStage("ready");
    setChips(starterChips);
    setStatus(
      "Groq is answering with the collected context. Kapruka MCP is searching products.",
    );
    const commerceData = await runCommerce(
      `${request}\n${buildContextSummary(requestDraft)}\nBudget: ${requestProfile.budget}\nRecipient: ${requestProfile.recipient}\nOccasion: ${requestProfile.occasion}\nGift type: ${requestProfile.category}`,
      activeMode,
      requestProfile,
      true,
      request,
      true,
      requestExtendedPreferences,
    );

    if (activeMode.includes("Event") || activeMode.includes("Gift Box")) {
      const planItems = normalizeGuidedPlanItems(
        commerceData.eventPlan ?? [],
        activeMode,
        requestDraft,
      );
      const firstItem = planItems[0] ?? "gift";

      setGuidedPlanItems(planItems);
      setGuidedPlanIndex(0);
      setGuidedMoreCount(0);
      await runCommerce(
        getPlanSearchTerm(firstItem),
        activeMode,
        requestProfile,
        false,
      );
      appendAssistantMessage(
        `${getCommerceReply(commerceData)}\n\n${getGuidedPlanReply(
          planItems,
          0,
          language,
        )}`,
      );
      setChips(getGuidedReplyChips());
      setStatus("Guided suggestions ready.");
      return;
    }

    appendAssistantMessageForReplyCount(
      getCommerceReply(commerceData),
      requestExtendedPreferences,
    );
    setStatus("Groq reply complete. Kapruka MCP commerce panels updated.");
  }

  async function handleFirstMessage(content: string) {
    setStatus("Groq is analyzing budget, recipient, and occasion.");
    let nextProfile: ShoppingProfile = profile;

    try {
      const analysis = await analyzeFirstMessage(content);
      nextProfile = {
        ...profile,
        budget: analysis.budget ?? profile.budget,
        category: analysis.category ?? profile.category,
        occasion: analysis.occasion ?? profile.occasion,
        recipient: analysis.recipient ?? profile.recipient,
      };
    } catch (error) {
      if (getRetryableFailureType(error)) {
        throw error;
      }

      setStatus(`${getErrorMessage(error)} Choose context manually.`);
    }

    setPendingUserRequest(content);
    if (activeMode.includes("Event") || activeMode.includes("Gift Box")) {
      const nextDraft = getContextDraftFromProfile(nextProfile);
      setProfile(nextProfile);
      setExtendedPreferences((current) =>
        syncExtendedPreferencesWithProfile(current, nextProfile),
      );
      setContextDraft(nextDraft);
      await answerWithCollectedContext(
        content,
        nextProfile,
        nextDraft,
        syncExtendedPreferencesWithProfile(extendedPreferences, nextProfile),
      );
      return;
    }

    const hasDetectedShoppingPreferences = Boolean(
      nextProfile.budget ||
        nextProfile.category ||
        nextProfile.occasion ||
        nextProfile.recipient,
    );

    if (hasDetectedShoppingPreferences) {
      setProfile(nextProfile);
      const nextExtendedPreferences = syncExtendedPreferencesWithProfile(
        extendedPreferences,
        nextProfile,
      );
      setExtendedPreferences(nextExtendedPreferences);
      await handleReadyMessage(
        content,
        nextProfile,
        nextExtendedPreferences,
        true,
      );
      return;
    }

    showContextPanel(nextProfile, language);
  }

  function selectContextOption(field: ContextField, value: string) {
    if (conversationStage !== "collecting-context" || isSending) {
      return;
    }

    setContextDraft((current) => ({
      ...current,
      [field]: current[field] === value ? "" : value,
    }));
  }

  async function submitContextPanel(useSelectedContext: boolean) {
    if (conversationStage !== "collecting-context" || isSending) {
      return;
    }

    const nextProfile = useSelectedContext
      ? mergeContextDraft(profile, contextDraft)
      : profile;
    const contextMessage = useSelectedContext
      ? buildContextSummary(contextDraft)
      : "Continue without context";
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: contextMessage },
    ];

    setProfile(nextProfile);
    const nextExtendedPreferences = syncExtendedPreferencesWithProfile(
      extendedPreferences,
      nextProfile,
    );
    setExtendedPreferences(nextExtendedPreferences);
    setMessages(nextMessages);
    setIsSending(true);
    setActivityMessage(text.processing);

    try {
      await answerWithCollectedContext(
        pendingUserRequest || contextMessage,
        nextProfile,
        contextDraft,
        nextExtendedPreferences,
      );
    } catch (error) {
      if (
        !addRetryFailure(
          error,
          pendingUserRequest || contextMessage,
          true,
        )
      ) {
        setStatus(getErrorMessage(error));
      }
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleReadyMessage(
    content: string,
    profileOverride = profile,
    extendedPreferencesOverride = extendedPreferences,
    enforceReplyCount = false,
  ) {
    setStatus("Groq is answering. Kapruka MCP is searching products.");
    const commerceData = await runCommerce(
      content,
      activeMode,
      profileOverride,
      true,
      content,
      false,
      extendedPreferencesOverride,
    );

    if (enforceReplyCount) {
      appendAssistantMessageForReplyCount(
        getCommerceReply(commerceData),
        extendedPreferencesOverride,
      );
    } else {
      appendAssistantMessage(getCommerceReply(commerceData));
    }
    setStatus("Groq chat complete. Kapruka MCP commerce panels updated.");
  }

  async function handleSidebarPreferenceSubmit() {
    if (isSending) {
      return;
    }

    const preferenceMessage = buildPreferenceMessage(profile);
    if (preferenceMessage === "Continue without context") {
      setStatus("Choose at least one preference before sending.");
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: preferenceMessage },
    ];

    setMessages(nextMessages);
    playChatSound("send");
    setPendingUserRequest(preferenceMessage);
    setIsSending(true);
    setActivityMessage(text.processing);

    try {
      await handleReadyMessage(
        preferenceMessage,
        profile,
        extendedPreferences,
        true,
      );
    } catch (error) {
      if (!addRetryFailure(error, preferenceMessage)) {
        setStatus(getErrorMessage(error));
      }
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleGuidedCustomMessage(content: string) {
    setStatus("Groq is answering and finding related guided options.");
    const commerceData = await runCommerce(content);
    appendAssistantMessage(getCommerceReply(commerceData));
    setChips(getGuidedReplyChips());
    setStatus("Related guided options loaded.");
  }

  async function handleNextGuidedItem() {
    if (isSending || guidedPlanItems.length === 0) {
      return;
    }

    const nextIndex = guidedPlanIndex + 1;

    if (nextIndex >= guidedPlanItems.length) {
      setChips(getGuidedReplyChips());
      setStatus("All guided item cards are shown.");
      return;
    }

    const nextItem = guidedPlanItems[nextIndex];
    setIsSending(true);
    setActivityMessage(text.processing);
    setGuidedPlanIndex(nextIndex);

    try {
      setRecommendedProducts([]);
      setFitReasons({});
      await runCommerce(getPlanSearchTerm(nextItem), activeMode, profile, false);
      setChips(getGuidedReplyChips());
      setStatus("Next guided item loaded.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handlePreviousGuidedItem() {
    if (isSending || guidedPlanItems.length === 0) {
      return;
    }

    const previousIndex = guidedPlanIndex - 1;

    if (previousIndex < 0) {
      setStatus("You are already at the first guided item.");
      return;
    }

    const previousItem = guidedPlanItems[previousIndex];
    setIsSending(true);
    setActivityMessage(text.processing);
    setGuidedPlanIndex(previousIndex);

    try {
      setRecommendedProducts([]);
      setFitReasons({});
      await runCommerce(
        getPlanSearchTerm(previousItem),
        activeMode,
        profile,
        false,
      );
      setChips(getGuidedReplyChips());
      setStatus("Previous guided item loaded.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleSuggestMoreGuidedItem() {
    if (isSending || guidedPlanItems.length === 0) {
      return;
    }

    const currentItem =
      guidedPlanItems[guidedPlanIndex] ?? guidedPlanItems[0];
    setIsSending(true);
    setActivityMessage(text.processing);

    try {
      const nextMoreCount = guidedMoreCount + 1;
      setGuidedMoreCount(nextMoreCount);
      setRecommendedProducts([]);
      setFitReasons({});
      await runCommerce(
        getMoreSearchTerm(currentItem, nextMoreCount),
        activeMode,
        profile,
        false,
      );
      setChips(getGuidedReplyChips());
      setStatus("More options loaded.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleSuggestMoreShopping() {
    if (isSending) {
      return;
    }

    if (!profile.budget) {
      setStatus("Choose a budget before requesting more products.");
      return;
    }

    if (recommendedProducts.length > 3) {
      setRecommendedProducts((current) => [
        ...current.slice(3),
        ...current.slice(0, 3),
      ]);
      addMessage({
        role: "assistant",
        content:
          language === "Singlish"
            ? "Thawa budget ekata galapena options pennanawa."
            : language === "Tanglish"
              ? "Unga budget ku set aagara innum sila options inga irukku."
            : language === "Sinhala"
              ? "ඔබේ අයවැයට ගැළපෙන තවත් විකල්ප පෙන්වන්නම්."
              : "Here are more options within your budget.",
      });
      setStatus("More budget-matched products shown.");
      return;
    }

    setIsSending(true);
    setActivityMessage(text.processing);
    try {
      const commerceData = await runCommerce(
        `${profile.category || "gift"} more options`,
        activeMode,
        profile,
        false,
        "Suggest more",
        true,
      );
      addMessage({
        role: "assistant",
        content: getCommerceReply(commerceData),
      });
      setStatus("More budget-matched products loaded.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  function handleChipClick(chip: string) {
    if (chip === "Previous item") {
      void handlePreviousGuidedItem();
      return;
    }

    if (chip === "Next item") {
      void handleNextGuidedItem();
      return;
    }

    if (chip === "Suggest more") {
      if (activeMode === "Smart Shopping") {
        void handleSuggestMoreShopping();
      } else {
        void handleSuggestMoreGuidedItem();
      }
      return;
    }

    void submitText(getLocalizedUserText(chip), starterChipGiftTypes[chip]);
  }

  async function handleRetryMessage(message: ChatMessage) {
    const retryText = message.retryText?.trim();
    if (!retryText || isSending) {
      return;
    }

    setMessages((current) =>
      current.map((item) =>
        item === message
          ? {
              ...item,
              retryContext: undefined,
              retryReason: undefined,
              retryText: undefined,
            }
          : item,
      ),
    );

    if (!message.retryContext) {
      await submitText(retryText);
      return;
    }

    setIsSending(true);
    setActivityMessage(text.processing);
    try {
      await answerWithCollectedContext(retryText, profile);
    } catch (error) {
      if (!addRetryFailure(error, retryText, true)) {
        setStatus(getErrorMessage(error));
      }
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function submitText(nextText: string, starterGiftType?: string) {
    const content = nextText.trim();
    if (!content || isSending) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages(nextMessages);
    playChatSound("send");
    setInput("");
    setIsSending(true);
    setActivityMessage(text.processing);

    try {
      if (starterGiftType) {
        const nextProfile = { ...profile, category: starterGiftType };
        const nextExtendedPreferences = {
          ...applyExtendedPreferenceUpdates(extendedPreferences, {
            giftType: starterGiftType,
          }),
        };
        setProfile(nextProfile);
        setExtendedPreferences(nextExtendedPreferences);
        setPendingUserRequest(content);

        if (conversationStage === "first-message") {
          showContextPanel(nextProfile, language);
        } else {
          const commerceData = await runCommerce(
            content,
            activeMode,
            nextProfile,
            false,
            content,
            true,
            nextExtendedPreferences,
          );
          appendAssistantMessage(getCommerceReply(commerceData));
        }
      } else if (conversationStage === "collecting-context") {
        setConversationStage("ready");
        await answerWithCollectedContext(
          pendingUserRequest || content,
          profile,
        );
      } else if (conversationStage === "first-message") {
        await handleFirstMessage(content);
      } else if (
        activeMode.includes("Event") ||
        activeMode.includes("Gift Box")
      ) {
        await handleGuidedCustomMessage(content);
      } else {
        await handleReadyMessage(content);
      }
    } catch (error) {
      if (!addRetryFailure(error, content)) {
        setStatus(getErrorMessage(error));
      }
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPromptPopupOpen(false);
    await submitText(input);
  }

  function handleSuggestedPromptClick(prompt: SuggestedPrompt) {
    if (prompt.action === "fill") {
      setInput(prompt.text);
      setIsPromptPopupOpen(false);
      return;
    }

    setIsPromptPopupOpen(false);
    composerInputRef.current?.focus();
  }

  async function handleCompareSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ids = [compareIds.first.trim(), compareIds.second.trim()].filter(Boolean);

    if (ids.length < 2 || isCompareSubmitting) {
      return;
    }

    setIsCompareSubmitting(true);
    setCompareRows([]);
    setCompareSuggestion("");
    setStatus("Kapruka MCP is loading product data for comparison.");

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 18000);
      const response = await fetch("/api/ai/commerce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          mode: "Product Compare",
          productIds: ids,
          profile: normalizeShoppingProfile(profile),
          query: ids.join(" "),
          task: "compare",
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const data = (await response.json()) as CommerceResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Product comparison failed.");
      }

      const recommendations = new Map(
        (data.recommendations ?? []).map((recommendation) => [
          recommendation.id,
          recommendation.reason,
        ]),
      );
      const rows = (data.products ?? []).slice(0, 2).map((product) => ({
        product,
        suggestion: recommendations.get(product.id) || data.reply || "",
      }));

      setCompareRows(rows);
      setCompareSuggestion(data.reply || "");
      setStatus(
        rows.length >= 2
          ? "Product comparison table ready."
          : (data.reply || "Product comparison table ready."),
      );
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Comparison timed out. Use real product IDs copied from Smart Shopping product cards."
          : getErrorMessage(error);
      setCompareSuggestion(message);
      setStatus(message);
    } finally {
      setIsCompareSubmitting(false);
    }
  }

  async function handleTrackingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = trackingId.trim();

    if (!id || isTrackingSubmitting) {
      return;
    }

    setIsTrackingSubmitting(true);
    setTrackingResult("");
    setTrackingSuggestion("");
    setStatus("Kapruka MCP is checking the order status.");

    try {
      const response = await fetch("/api/ai/commerce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          mode: "Order Tracking",
          profile: normalizeShoppingProfile(profile),
          query: id,
          task: "track",
        }),
      });
      const data = (await response.json()) as CommerceResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Order tracking failed.");
      }

      setTrackingResult(data.tracking || "");
      setTrackingSuggestion(data.reply || "");
      setStatus("Order tracking result ready.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsTrackingSubmitting(false);
    }
  }

  async function generateGiftMessage(suggestions?: string) {
    if (isGiftMessageGenerating) {
      return;
    }

    setIsGiftMessageGenerating(true);
    setStatus("Groq is generating a gift message.");

    try {
      const nextPreferences = {
        ...giftMessagePreferences,
        suggestions:
          suggestions !== undefined
            ? suggestions
            : giftMessagePreferences.suggestions,
      };
      const response = await fetch("/api/ai/commerce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          giftMessagePreferences: nextPreferences,
          language,
          mode: "Gift Message",
          profile: normalizeShoppingProfile(profile),
          query: nextPreferences.suggestions || "Generate a gift message",
          task: "giftMessage",
        }),
      });
      const data = (await response.json()) as CommerceResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Gift message generation failed.");
      }

      if (!data.giftMessage?.trim()) {
        throw new Error("No updated gift message was returned. Please try again.");
      }

      setGiftMessage(data.giftMessage);
      setStatus("Gift message ready.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsGiftMessageGenerating(false);
    }
  }

  async function handleGiftMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateGiftMessage(giftMessagePreferences.suggestions);
  }

  function handleModeChange(mode: string) {
    if (mode === activeMode) {
      setIsLeftPanelOpen(false);
      return;
    }

    const currentMode = activeMode;
    const currentSession = getCurrentModeSession();
    const nextSession = modeSessions[mode] ?? getDefaultModeSession(mode);

    setModeSessions((current) => ({
      ...current,
      [currentMode]: currentSession,
    }));
    setActiveMode(mode);
    applyModeSession(nextSession);
    setIsLeftPanelOpen(false);
    setStatus(`${mode} ready.`);

    if (mode.includes("Message")) {
      void generateGiftMessage("");
    }
  }

  async function handleClearHistory() {
    const nextSession = getDefaultModeSession(activeMode);
    const preservedProducts = recommendedProducts;

    setModeSessions({});
    applyModeSession({
      ...nextSession,
      fitReasons: {},
      recommendedProducts: preservedProducts,
    });
    resetToolPanels();
    setStatus("Chat history cleared.");

    try {
      await clearStoredChatState();
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  function openCheckoutModal() {
    if (buyBox.length === 0) {
      setCheckoutWarning(getEmptyCartWarning());
      setStatus("Add at least one live Kapruka product before checkout.");
      return;
    }

    setCheckoutWarning("");
    setCheckoutUrl("");
    setIsCheckoutModalOpen(true);
  }

  async function handleCreateOrderLink(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (isCheckoutCreating) {
      return;
    }

    if (buyBox.length === 0) {
      setCheckoutWarning(getEmptyCartWarning());
      setStatus("Add at least one live Kapruka product before checkout.");
      return;
    }

    const phoneValidation = getValidatedPhoneNumber(
      checkoutDetails.recipientPhone,
    );

    if (phoneValidation.error) {
      setCheckoutWarning(phoneValidation.error);
      setStatus(phoneValidation.error);
      return;
    }

    setIsCheckoutCreating(true);
    setCheckoutWarning("");
    setCheckoutUrl("");
    setStatus("Kapruka MCP is creating a guest-checkout link.");

    try {
      const response = await fetch("/api/ai/commerce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cartIds: buyBox.map((product) => product.id),
          checkout: {
            ...checkoutDetails,
            recipientPhone: phoneValidation.normalizedValue,
            giftMessage,
          },
          language,
          mode: activeMode,
          profile: normalizeShoppingProfile(profile),
          query: "Create Kapruka guest checkout link",
          task: "checkout",
        }),
      });
      const data = (await response.json()) as CommerceResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Kapruka checkout failed.");
      }

      applyCommerceResponse(data);
      if (data.checkout?.checkout_url) {
        setStatus("Kapruka MCP checkout link created.");
        setCheckoutWarning("");
      } else {
        const message = getCheckoutResponseMessage(data);
        setCheckoutWarning(message);
        setStatus(message);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setCheckoutWarning(message);
      setStatus(message);
    } finally {
      setIsCheckoutCreating(false);
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsComposerMenuOpen(false);
    const formData = new FormData();
    formData.append("image", file);
    setActivityMessage(text.uploadingImage);
    setIsImageProcessing(true);
    setStatus("Groq vision is analyzing the image.");

    try {
      const response = await fetch("/api/ai/image-analysis", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ImageResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Groq image analysis failed.");
      }

      const query = data.searchQuery || data.productHints?.join(" ") || "gift";
      addMessage({
        role: "assistant",
        content: getImageSearchReply(data),
      });
      await runCommerce(query, activeMode, profile, false);
      setStatus(
        data.fallback
          ? "Image upload used a best-effort fallback search. Kapruka MCP products updated."
          : "Groq image analysis complete. Kapruka MCP products updated.",
      );
    } catch (error) {
      const message = getErrorMessage(error);
      addMessage({
        role: "assistant",
        content: `Image upload did not complete: ${message}`,
      });
      setStatus(message);
    } finally {
      setActivityMessage("");
      setIsImageProcessing(false);
      event.target.value = "";
    }
  }

  async function startRecording() {
    if (isRecording) {
      return;
    }

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("Audio recording is not available in this browser.");
      return;
    }

    try {
      setIsComposerMenuOpen(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = stream;
      shouldSendRecordingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setIsRecording(false);
        setIsRecordingPaused(false);
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const file = new File([blob], "kapruka-voice.webm", {
          type: recorder.mimeType || "audio/webm",
        });
        mediaRecorderRef.current = null;

        if (shouldSendRecordingRef.current && blob.size > 0) {
          void transcribeVoice(file);
        } else {
          shouldSendRecordingRef.current = false;
          audioChunksRef.current = [];
          setActivityMessage("");
          setStatus("Voice recording stopped.");
        }
      };

      recorder.start();
      setIsRecording(true);
      setActivityMessage(text.recordingVoice);
      setStatus("Recording voice input.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  function toggleRecordingPause() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    if (recorder.state === "recording") {
      recorder.pause();
      setIsRecordingPaused(true);
      setActivityMessage("Voice recording paused.");
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      setIsRecordingPaused(false);
      setActivityMessage(text.recordingVoice);
    }
  }

  function discardRecording() {
    if (!mediaRecorderRef.current || !isRecording) {
      return;
    }

    setIsComposerMenuOpen(false);
    shouldSendRecordingRef.current = false;
    mediaRecorderRef.current.stop();
  }

  function sendRecording() {
    if (!mediaRecorderRef.current || !isRecording) {
      return;
    }

    setIsComposerMenuOpen(false);
    shouldSendRecordingRef.current = true;
    setIsVoiceProcessing(true);
    setActivityMessage(text.transcribingVoice);
    setStatus("Groq is transcribing the voice note.");
    mediaRecorderRef.current.stop();
  }

  async function transcribeVoice(file: File) {
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("language", "en");
    setIsVoiceProcessing(true);
    setActivityMessage(text.transcribingVoice);

    try {
      const response = await fetch("/api/ai/voice-messages", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as VoiceResponse;

      if (!response.ok) {
        if (data.retry) {
          addMessage({ role: "assistant", content: text.voiceRetry });
          setStatus(text.voiceRetry);
          return;
        }

        throw new Error(data.error ?? "Groq transcription failed.");
      }

      const transcript = data.transcript ?? "";
      if (!transcript) {
        addMessage({ role: "assistant", content: text.voiceRetry });
        setStatus(text.voiceRetry);
        return;
      }

      setInput("");
      await submitText(transcript);
      setStatus("Groq voice transcript processed.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      shouldSendRecordingRef.current = false;
      audioChunksRef.current = [];
      setActivityMessage("");
      setIsVoiceProcessing(false);
    }
  }

  async function speakMessage(messageText: string) {
    if (!messageText.trim() || isSpeaking) {
      return;
    }

    const spokenText = removeEmojiForSpeech(messageText).slice(0, 1200);

    if (!spokenText) {
      setStatus("There is no readable text after removing emojis.");
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setStatus("Read-aloud is not available in this browser.");
      return;
    }

    const femaleVoicePattern =
      /female|amy|aria|ava|emma|fiona|hazel|ivy|joanna|jenny|karen|kendra|kimberly|libby|maisie|michelle|moira|natasha|olivia|salli|samantha|sara|serena|shelley|sonia|susan|tessa|victoria|zira|google us english/i;
    const naturalVoicePattern = /enhanced|google|microsoft|natural|neural|premium/i;
    const speechSynthesis = window.speechSynthesis;
    const hasFemaleEnglishVoice = (voices: SpeechSynthesisVoice[]) =>
      voices.some(
        (voice) =>
          voice.lang.toLowerCase().startsWith("en") &&
          femaleVoicePattern.test(`${voice.name} ${voice.voiceURI}`),
      );

    speechSynthesis.cancel();
    setIsSpeaking(true);
    setStatus("Loading a female English voice.");

    let voices = speechSynthesis.getVoices();
    if (!hasFemaleEnglishVoice(voices)) {
      await new Promise<void>((resolve) => {
        const finishLoading = () => {
          window.clearTimeout(timeoutId);
          speechSynthesis.removeEventListener("voiceschanged", finishLoading);
          resolve();
        };
        const timeoutId = window.setTimeout(finishLoading, 1200);
        speechSynthesis.addEventListener("voiceschanged", finishLoading, {
          once: true,
        });
      });
      voices = speechSynthesis.getVoices();
    }

    const femaleEnglishVoices = voices.filter(
      (voice) =>
        voice.lang.toLowerCase().startsWith("en") &&
        femaleVoicePattern.test(`${voice.name} ${voice.voiceURI}`),
    );
    const getVoiceScore = (voice: SpeechSynthesisVoice) => {
      const locale = voice.lang.toLowerCase();
      const voiceIdentity = `${voice.name} ${voice.voiceURI}`;
      const localeScore = locale.startsWith("en-lk")
        ? 40
        : locale.startsWith("en-gb")
          ? 35
          : locale.startsWith("en-us")
            ? 30
            : locale.startsWith("en-in")
              ? 25
              : 10;

      return (
        localeScore +
        (femaleVoicePattern.test(voiceIdentity) ? 100 : 0) +
        (naturalVoicePattern.test(voiceIdentity) ? 10 : 0) +
        (voice.default ? 2 : 0)
      );
    };
    const preferredVoice = [...femaleEnglishVoices].sort(
      (firstVoice, secondVoice) =>
        getVoiceScore(secondVoice) - getVoiceScore(firstVoice),
    )[0];

    if (!preferredVoice) {
      setIsSpeaking(false);
      setStatus("No female English voice is installed in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);

    utterance.lang = preferredVoice.lang;
    utterance.rate = 0.96;
    utterance.pitch = 1.05;
    utterance.voice = preferredVoice;

    utterance.onend = () => {
      setIsSpeaking(false);
      setStatus("Finished reading the latest message.");
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setStatus("The browser could not read this message aloud.");
    };

    setStatus("Reading the latest message aloud.");
    speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    const container = productCarouselRef.current;

    if (!container) {
      setCanScrollProductCarouselLeft(false);
      setCanScrollProductCarouselRight(false);
      return;
    }

    const updateCarouselControls = () => {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const threshold = 8;

      setCanScrollProductCarouselLeft(container.scrollLeft > threshold);
      setCanScrollProductCarouselRight(maxScrollLeft - container.scrollLeft > threshold);
    };

    updateCarouselControls();
    container.addEventListener("scroll", updateCarouselControls, { passive: true });
    window.addEventListener("resize", updateCarouselControls);

    return () => {
      container.removeEventListener("scroll", updateCarouselControls);
      window.removeEventListener("resize", updateCarouselControls);
    };
  }, [visibleProducts.length, recommendedProducts.length, isLoadingInitialProducts]);

  function scrollProductCarousel(direction: "next" | "prev") {
    const container = productCarouselRef.current;

    if (!container) {
      return;
    }

    const distance = Math.max(container.clientWidth * 0.82, 220);

    container.scrollBy({
      behavior: "smooth",
      left: direction === "next" ? distance : -distance,
    });
  }

  function renderContextPanel(isActive: boolean) {
    const contextFields = getContextFieldsForMode(activeMode);
    const selectedContextFields = contextFields.filter((field) =>
      contextDraft[field].trim(),
    );
    const fieldsToAsk = contextFields.filter(
      (field) => !contextDraft[field].trim(),
    );
    const hasSelectedContext = selectedContextFields.length > 0;

    return (
      <div className="grid gap-4">
        <div>
          <h3 className="text-base font-black text-[#3f246d]">
            {text.contextTitle}
          </h3>
          {/*<p className="mt-1 text-sm leading-6 text-[#675f79]">*/}
          {/*  {text.contextIntro}*/}
          {/*</p>*/}
        </div>

        {selectedContextFields.length > 0 ? (
          <div className="rounded-[16px] border border-[#e8e2f2] bg-white p-3">
            <p className="text-xs font-black uppercase text-[#675f79]">
              {text.detectedContext}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedContextFields.map((field) => (
                <button
                  key={field}
                  type="button"
                  disabled={!isActive || isSending}
                  onClick={() => selectContextOption(field, contextDraft[field])}
                  className="rounded-full border border-[#3f246d] bg-[#3f246d] px-2.5 py-1.5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
                >
                  {getContextFieldLabel(field)}:{" "}
                  {getOptionLabel(contextDraft[field])}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {fieldsToAsk.length > 0 ? (
          <div className="grid gap-4">
            {fieldsToAsk.map((field) => (
              <fieldset key={field} className="grid gap-2">
                <legend className="text-sm font-black text-[#161226]">
                  {getContextQuestion(field)}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {contextFieldOptions[field].map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={false}
                      disabled={!isActive || isSending}
                      onClick={() => selectContextOption(field, option)}
                      className="rounded-full border border-[#e8e2f2] bg-white px-3 py-1.5 text-xs font-black text-[#3f246d] transition hover:border-[#3f246d] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {getOptionLabel(option)}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        ) : (
            <div />
          // <div className="rounded-[16px] border border-[#e8e2f2] bg-white p-3 text-sm font-bold text-[#675f79]">
          //   {/*{text.allContextDetected}*/}
          // </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            disabled={!isActive || isSending || !hasSelectedContext}
            onClick={() => void submitContextPanel(true)}
            className="h-12 rounded-[14px] bg-[#ffdf00] px-5 text-sm font-black text-[#1a0f2e] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSending ? text.sendingContext : text.sendContext}
          </button>
          <button
            type="button"
            disabled={!isActive || isSending}
            onClick={() => void submitContextPanel(false)}
            className="h-12 rounded-[14px] border border-[#e8e2f2] bg-white px-5 text-sm font-black text-[#3f246d] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {text.continueWithoutContext}
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#f6f4fb] text-[#161226]">
      {isIntroPanelVisible ? (
        <button
          type="button"
          aria-label="Close welcome panel"
          onClick={closeIntroPanel}
          className="fixed inset-x-0 bottom-0 top-[50vh] z-40 cursor-default bg-[#161226]/25 backdrop-blur-[2px]"
        />
      ) : null}
      <div
        className={`fixed inset-x-0 top-0 z-50 h-[75vh] w-screen transition-transform duration-700 ease-out md:h-[50vh] ${
          isIntroPanelVisible
            ? "translate-y-0"
            : "pointer-events-none -translate-y-full"
        }`}
      >
        <section className="h-full overflow-auto rounded-b-[30px] border-b border-white/45 bg-[linear-gradient(135deg,#3f246d_0%,#7b3fb1_34%,#f06aa8_66%,#ffdf00_100%)] p-[1px] shadow-[0_24px_70px_rgba(44,22,75,0.3)]">
          <div className="flex min-h-full items-center bg-[radial-gradient(circle_at_12%_20%,rgba(255,223,0,0.32),transparent_28%),radial-gradient(circle_at_88%_16%,rgba(240,106,168,0.28),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,244,251,0.82))] px-5 py-6 backdrop-blur md:px-8">
            <div className="mx-auto grid w-full max-w-6xl gap-5">
              <div className="min-w-0 pr-12">
                <p className="inline-flex rounded-full bg-[#ffdf00] px-3 py-1 text-xs font-black uppercase tracking-normal text-[#1a0f2e] shadow-[0_10px_24px_rgba(44,22,75,0.12)]">
                  Kapruka Genie is ready
                </p>
                <h2 className="mt-3 max-w-4xl text-4xl font-black leading-tight tracking-normal text-[#3f246d] md:text-6xl">
                  Shop smarter with live AI gifting support
                </h2>
                <p className="mt-3 max-w-3xl text-base font-bold leading-7 text-[#4d4261] md:text-lg">
                  Ask for gifts, compare products, plan events, write gift
                  messages, and create Kapruka checkout links from one guided
                  chat workspace.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={closeIntroPanel}
                  aria-label="Close welcome panel"
                  className="absolute right-4 top-4 grid h-10 w-10 cursor-pointer place-items-center rounded-[12px] border border-[#e8e2f2] bg-white text-[#3f246d] shadow-[0_12px_32px_rgba(44,22,75,0.08)]"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={closeIntroPanel}
                  className="h-12 cursor-pointer rounded-[14px] bg-[#3f246d] px-5 text-sm font-black text-white shadow-[0_12px_26px_rgba(63,36,109,0.28)] transition hover:bg-[#2f1957]"
                >
                  Chat now with Kapruka Genie
                </button>
                <Link
                  href="/features"
                  onClick={closeIntroPanel}
                  className="grid h-12 cursor-pointer place-items-center rounded-[14px] border border-[#e8e2f2] bg-white px-5 text-sm font-black text-[#3f246d] shadow-[0_12px_26px_rgba(44,22,75,0.1)] transition hover:bg-[#f6f4fb]"
                >
                  See features
                </Link>
                <Link
                  href="/demo-video"
                  onClick={closeIntroPanel}
                  className="grid h-12 cursor-pointer place-items-center rounded-[14px] bg-[#ffdf00] px-5 text-sm font-black text-[#1a0f2e] shadow-[0_12px_26px_rgba(255,223,0,0.3)] transition hover:bg-white"
                >
                  See demo video
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      {selectedProduct ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#161226]/45 px-4 py-6 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close product details"
            onClick={() => setSelectedProduct(null)}
            className="absolute inset-0 cursor-default"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-details-title"
            className="relative z-10 max-h-full w-full max-w-3xl overflow-auto rounded-[22px] border border-[#e8e2f2] bg-white shadow-[0_24px_70px_rgba(44,22,75,0.28)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e8e2f2] p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7b3fb1]">
                  Product details
                </p>
                <h2
                  id="product-details-title"
                  className="mt-1 text-xl font-black text-[#3f246d]"
                >
                  {selectedProduct.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-[12px] border border-[#e8e2f2] text-[#3f246d]"
                aria-label="Close product details"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,280px)_1fr]">
              <div className="relative aspect-square overflow-hidden rounded-[18px] bg-[#eee9f5]">
                <Image
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  fill
                  unoptimized
                  sizes="280px"
                  className="object-cover"
                />
              </div>
              <div className="grid content-start gap-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[14px] bg-[#f6f4fb] p-3">
                    <dt className="font-bold text-[#8a8299]">Product ID</dt>
                    <dd className="mt-1 break-all font-black text-[#3f246d]">
                      {selectedProduct.id}
                    </dd>
                  </div>
                  <div className="rounded-[14px] bg-[#f6f4fb] p-3">
                    <dt className="font-bold text-[#8a8299]">Category</dt>
                    <dd className="mt-1 font-black text-[#3f246d]">
                      {selectedProduct.category}
                    </dd>
                  </div>
                  <div className="rounded-[14px] bg-[#f6f4fb] p-3">
                    <dt className="font-bold text-[#8a8299]">Price</dt>
                    <dd className="mt-1 font-black text-[#3f246d]">
                      {formatPrice(
                        selectedProduct.price,
                        selectedProduct.currency,
                      )}
                    </dd>
                  </div>
                  <div className="rounded-[14px] bg-[#f6f4fb] p-3">
                    <dt className="font-bold text-[#8a8299]">Availability</dt>
                    <dd className="mt-1 font-black text-[#3f246d]">
                      {selectedProduct.stockLabel}
                    </dd>
                  </div>
                  <div className="rounded-[14px] bg-[#f6f4fb] p-3">
                    <dt className="font-bold text-[#8a8299]">Stock count</dt>
                    <dd className="mt-1 font-black text-[#3f246d]">
                      {selectedProduct.stock}
                    </dd>
                  </div>
                  <div className="rounded-[14px] bg-[#f6f4fb] p-3">
                    <dt className="font-bold text-[#8a8299]">Delivery</dt>
                    <dd className="mt-1 font-black text-[#3f246d]">
                      {selectedProduct.eta}
                    </dd>
                  </div>
                </dl>
                <div>
                  <h3 className="text-sm font-black text-[#3f246d]">
                    Description
                  </h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#675f79]">
                    {selectedProduct.description}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={isSelectedProductInCart}
                    onClick={() => addToBuyBox(selectedProduct)}
                    className="h-11 rounded-[12px] bg-[#ffdf00] px-4 text-sm font-black text-[#1a0f2e] disabled:cursor-default disabled:opacity-60"
                  >
                    {isSelectedProductInCart
                      ? "Added to Cart"
                      : text.addToBuyBox}
                  </button>
                  <a
                    href={selectedProduct.url}
                    target="_blank"
                    rel="noreferrer"
                    className="grid h-11 place-items-center rounded-[12px] border border-[#e8e2f2] px-4 text-sm font-black text-[#3f246d] transition hover:bg-[#f6f4fb]"
                  >
                    Open on Kapruka
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {isCheckoutModalOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#161226]/45 px-4 py-6 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close checkout details"
            onClick={() => setIsCheckoutModalOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <section className="relative z-10 max-h-full w-full max-w-2xl overflow-auto rounded-[22px] border border-[#e8e2f2] bg-white shadow-[0_24px_70px_rgba(44,22,75,0.28)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e8e2f2] p-5">
              <div>
                <h2 className="text-xl font-black text-[#3f246d]">
                  Checkout Details
                </h2>
                <p className="mt-1 text-sm font-bold text-[#675f79]">
                  Confirm delivery and recipient details before creating the
                  Kapruka checkout link.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="grid h-10 w-10 cursor-pointer place-items-center rounded-[12px] border border-[#e8e2f2] text-[#3f246d]"
                aria-label="Close checkout details"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>

            {checkoutUrl ? (
              <div className="grid gap-4 p-5 text-center">
                <div className="rounded-[18px] bg-[#f6f4fb] p-5">
                  <p className="text-sm font-black uppercase text-[#7b3fb1]">
                    Checkout link ready
                  </p>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#675f79]">
                    Open the Kapruka checkout page to complete payment.
                  </p>
                </div>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-12 cursor-pointer place-items-center rounded-[14px] bg-[#ffdf00] text-sm font-black text-[#1a0f2e] transition hover:bg-[#3f246d] hover:text-white"
                >
                  {text.openCheckout}
                </a>
              </div>
            ) : (
              <form
                onSubmit={(event) => void handleCreateOrderLink(event)}
                className="grid gap-4 p-5"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                    {text.recipientName}
                    <input
                      required
                      value={checkoutDetails.recipientName}
                      onChange={(event) =>
                        setCheckoutDetails((current) => ({
                          ...current,
                          recipientName: event.target.value,
                        }))
                      }
                      className="h-11 rounded-[12px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                    {text.recipientPhone}
                    <input
                      required
                      type="tel"
                      inputMode="tel"
                      minLength={7}
                      value={checkoutDetails.recipientPhone}
                      onChange={(event) => {
                        setCheckoutWarning("");
                        setCheckoutDetails((current) => ({
                          ...current,
                          recipientPhone: event.target.value,
                        }));
                      }}
                      className="h-11 rounded-[12px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
                      placeholder="Enter at least 7 digits"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-[#675f79] md:col-span-2">
                    {text.checkout}
                    <input
                      required
                      value={checkoutDetails.address}
                      onChange={(event) =>
                        setCheckoutDetails((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                      className="h-11 rounded-[12px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                    Delivery City
                    <select
                      required
                      value={profile.city}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          city: event.target.value,
                        }))
                      }
                      className="h-11 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-[#161226] outline-none"
                    >
                      <option value="">Select delivery city</option>
                      {deliveryCities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                    Location Type
                    <select
                      value={checkoutDetails.locationType}
                      onChange={(event) =>
                        setCheckoutDetails((current) => ({
                          ...current,
                          locationType: event.target.value,
                        }))
                      }
                      className="h-11 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-[#161226] outline-none"
                    >
                      <option value="">Optional</option>
                      {locationTypes.map((locationType) => (
                        <option key={locationType} value={locationType}>
                          {locationType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                    {text.date}
                    <input
                      required
                      type="date"
                      min={minimumDeliveryDate}
                      value={profile.date}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          date: getNonPastDate(event.target.value),
                        }))
                      }
                      className="h-11 rounded-[12px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                    {text.senderName}
                    <input
                        required
                      value={checkoutDetails.senderName}
                      onChange={(event) =>
                        setCheckoutDetails((current) => ({
                          ...current,
                          senderName: event.target.value,
                        }))
                      }
                      className="h-11 rounded-[12px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-bold text-[#675f79]">
                  {text.giftMessageLabel}
                  <textarea
                    value={giftMessage}
                    onChange={(event) => setGiftMessage(event.target.value)}
                    rows={3}
                    className="resize-none rounded-[12px] border border-[#e8e2f2] px-3 py-2 text-[#161226] outline-none"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isCheckoutCreating}
                  className="h-12 cursor-pointer rounded-[14px] bg-[#ffdf00] text-sm font-black text-[#1a0f2e] transition hover:bg-[#3f246d] hover:text-white disabled:cursor-wait disabled:opacity-70"
                >
                  {isCheckoutCreating ? "Processing..." : text.createOrderLink}
                </button>
                {checkoutWarning ? (
                  <p className="rounded-[12px] bg-[#fff5d5] px-3 py-2 text-sm font-semibold text-[#6f5200]">
                    {checkoutWarning}
                  </p>
                ) : null}
              </form>
            )}
          </section>
        </div>
      ) : null}
      <section className="flex h-full w-full flex-col gap-3 px-4 py-4">
        <div className="flex flex-none flex-col justify-between gap-1.5 md:flex-row md:items-end md:gap-3">
          <div className="flex w-full items-center justify-between gap-2 md:w-auto">
            <h1 className="mt-1 text-3xl font-black tracking-normal sm:text-4xl">
              <span className="text-[#3f246d]">Kapruka</span>{" "}
              <span className="text-[#d6a900] drop-shadow-[0_1px_0_rgba(26,15,46,0.32)]">Genie</span>
            </h1>
            <button
              type="button"
              onClick={() => setIsInfoMenuOpen(true)}
              className="mt-1 grid h-10 w-10 place-items-center rounded-[12px] border border-[#e8e2f2] bg-white text-[#3f246d] shadow-[0_12px_32px_rgba(44,22,75,0.05)] md:hidden"
              aria-label="Open information menu"
            >
              <Icon name="menu" className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
            <Link
              href="/features"
              className="hidden h-11 place-items-center rounded-[13px] border border-[#e8e2f2] bg-white px-4 text-sm font-black text-[#3f246d] shadow-[0_12px_32px_rgba(44,22,75,0.05)] xl:grid"
            >
              See features
            </Link>
            <Link
              href="/demo-video"
              className="hidden h-11 place-items-center rounded-[13px] bg-[#ffdf00] px-4 text-sm font-black text-[#1a0f2e] shadow-[0_12px_32px_rgba(44,22,75,0.05)] xl:grid"
            >
              See demo video
            </Link>
          </div>
          <div className="flex gap-2 xl:hidden">
            <button
              type="button"
              onClick={() => setIsLeftPanelOpen(true)}
              className="flex h-11 items-center gap-2 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d]"
            >
              <Icon name="menu" className="h-4 w-4" />
              Modes and Preferences
            </button>
            <button
              type="button"
              onClick={() => setIsBuyBoxOpen(true)}
              className="flex h-11 items-center gap-2 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d]"
            >
              <Icon name="cart" className="h-4 w-4" />
              {text.buyBox}
              <span className="grid min-w-5 place-items-center rounded-full bg-[#3f246d] px-1.5 py-0.5 text-[11px] leading-none text-white">
                {cartCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsInfoMenuOpen(true)}
              className="hidden h-11 w-11 place-items-center rounded-[12px] border border-[#e8e2f2] bg-white text-[#3f246d] shadow-[0_12px_32px_rgba(44,22,75,0.05)] md:grid xl:hidden"
              aria-label="Open information menu"
            >
              <Icon name="menu" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isInfoMenuOpen ? (
          <div className="fixed right-4 top-[76px] z-40 grid w-[min(280px,calc(100vw-32px))] gap-2 rounded-[18px] border border-[#e8e2f2] bg-white p-3 shadow-[0_18px_50px_rgba(44,22,75,0.18)] xl:hidden">
            <Link
              href="/features"
              onClick={() => setIsInfoMenuOpen(false)}
              className="grid h-11 place-items-center rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d]"
            >
              See features
            </Link>
            <Link
              href="/demo-video"
              onClick={() => setIsInfoMenuOpen(false)}
              className="grid h-11 place-items-center rounded-[12px] bg-[#ffdf00] px-3 text-sm font-black text-[#1a0f2e]"
            >
              See demo video
            </Link>
          </div>
        ) : null}

        {(isInfoMenuOpen || isLeftPanelOpen || isBuyBoxOpen) && (
          <button
            type="button"
            aria-label="Close panels"
            onClick={() => {
              setIsInfoMenuOpen(false);
              setIsLeftPanelOpen(false);
              setIsBuyBoxOpen(false);
            }}
            className={`fixed inset-0 z-30 xl:hidden ${
              isInfoMenuOpen && !isLeftPanelOpen && !isBuyBoxOpen
                ? "bg-transparent"
                : "bg-[#161226]/35"
            }`}
          />
        )}

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[260px_minmax(430px,1fr)_320px]">
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-[86vw] max-w-[340px] min-h-0 overflow-auto border-r border-[#e8e2f2] bg-white shadow-[0_12px_32px_rgba(44,22,75,0.18)] transition-transform xl:static xl:z-auto xl:w-auto xl:max-w-none xl:translate-x-0 xl:rounded-[18px] xl:border xl:shadow-[0_12px_32px_rgba(44,22,75,0.07)] ${
              isLeftPanelOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-[#e8e2f2] p-3 font-black">
              <span className="flex items-center gap-2">
                Modes and Preferences <Icon name="settings" className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => setIsLeftPanelOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#e8e2f2] xl:hidden"
                aria-label="Close menu"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-1 p-2">
              {modes
                .filter((mode) => mode.name !== "Analytics")
                .map((mode) => (
                <button
                  key={mode.name}
                  type="button"
                  onClick={() => void handleModeChange(mode.name)}
                  className={`flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-xs font-black transition ${
                    activeMode === mode.name
                      ? "bg-[#3f246d] text-white"
                      : "text-[#675f79] hover:bg-[#f6f4fb]"
                  }`}
                >
                  <Icon name={modeIcons[mode.name] ?? "sparkles"} />
                  {mode.name}
                </button>
              ))}
            </div>

            <div className="border-t border-[#e8e2f2] p-3">
              <h2 className="text-sm font-black">{text.userContext}</h2>
              <div className="mt-3 grid gap-3 text-sm">
                <label className="grid gap-1 font-bold text-[#675f79]">
                  {getContextFieldLabel("budget")}
                  <select
                    value={profile.budget}
                    onChange={(event) =>
                      updateSelectedPreference("budget", event.target.value)
                    }
                    className="rounded-[14px] border border-[#e8e2f2] bg-white px-3 py-2 text-[#161226] outline-none"
                  >
                    <option value="">{getContextFieldLabel("budget")}</option>
                    {budgetOptions.map((budget) => (
                      <option key={budget} value={budget}>
                        {getOptionLabel(budget)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 font-bold text-[#675f79]">
                  {getContextFieldLabel("recipient")}
                  <select
                    value={profile.recipient}
                    onChange={(event) =>
                      updateSelectedPreference("recipient", event.target.value)
                    }
                    className="rounded-[14px] border border-[#e8e2f2] bg-white px-3 py-2 text-[#161226] outline-none"
                  >
                    <option value="">{getContextFieldLabel("recipient")}</option>
                    {recipientOptions.map((recipient) => (
                      <option key={recipient} value={recipient}>
                        {getOptionLabel(recipient)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 font-bold text-[#675f79]">
                  {getContextFieldLabel("occasion")}
                  <select
                    value={profile.occasion}
                    onChange={(event) =>
                      updateSelectedPreference("occasion", event.target.value)
                    }
                    className="rounded-[14px] border border-[#e8e2f2] bg-white px-3 py-2 text-[#161226] outline-none"
                  >
                    <option value="">{getContextFieldLabel("occasion")}</option>
                    {occasionOptions.map((occasion) => (
                      <option key={occasion} value={occasion}>
                        {getOptionLabel(occasion)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 font-bold text-[#675f79]">
                  {getContextFieldLabel("category")}
                  <select
                    value={profile.category}
                    onChange={(event) =>
                      updateSelectedPreference("category", event.target.value)
                    }
                    className="rounded-[14px] border border-[#e8e2f2] bg-white px-3 py-2 text-[#161226] outline-none"
                  >
                    <option value="">{getContextFieldLabel("category")}</option>
                    {giftTypeOptions.map((giftType) => (
                      <option key={giftType} value={giftType}>
                        {getOptionLabel(giftType)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                disabled={
                  isSending ||
                  activeMode !== "Smart Shopping" ||
                  !(
                    profile.budget ||
                    profile.recipient ||
                    profile.occasion ||
                    profile.category
                  )
                }
                onClick={() => void handleSidebarPreferenceSubmit()}
                className="mt-4 h-11 w-full rounded-[14px] bg-[#ffdf00] px-4 text-sm font-black text-[#1a0f2e] disabled:cursor-not-allowed disabled:bg-[#ece7f5] disabled:text-[#8a8299] disabled:opacity-100"
              >
                {isSending ? text.sendingContext : text.sendContext}
              </button>
            </div>
          </aside>

          <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#e8e2f2] bg-[linear-gradient(180deg,#fff_0%,#fbf9ff_100%)] shadow-[0_12px_32px_rgba(44,22,75,0.07)]">
            <div className="flex items-center justify-between border-b border-[#e8e2f2] p-5 font-black">
              <span>{activeMode}</span>
              <div className="ml-auto flex items-center justify-end gap-1.5 md:gap-3 [&>span.text-sm]:hidden">
                <span className="sr-only">{text.language}</span>
                <label className="sr-only" htmlFor="chat-language">
                  {text.language}
                </label>
                <select
                  id="chat-language"
                  value={language}
                  onChange={(event) =>
                    handleLanguageChange(event.target.value as Language)
                  }
                  className="h-10 w-[92px] rounded-[12px] border border-[#e8e2f2] bg-white px-2 text-sm font-black text-[#3f246d] outline-none md:w-auto md:px-3"
                >
                  {languageOptions.map((option) => (
                    <option key={option} value={option}>
                      {languageLabels[option]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleClearHistory()}
                  className="grid h-9 w-9 place-items-center rounded-[12px] border border-[#e8e2f2] bg-white text-sm font-black text-[#3f246d] md:flex md:h-10 md:w-auto md:items-center md:gap-2 md:px-3"
                  title={text.clearHistory}
                  aria-label={text.clearHistory}
                >
                  <Icon name="trash" className="h-4 w-4" />
                  <span className="hidden md:inline">{text.clearHistory}</span>
                </button>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-[12px] text-[#18a058] md:h-auto md:w-auto md:gap-1 md:rounded-none md:text-[14px]"
                  title={text.active}
                  aria-label={text.active}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-[#18a058] md:hidden" />
                  <span className="hidden items-center gap-1 md:flex">
                    <Icon name="check" className="h-4 w-4" /> {text.active}
                  </span>
                </span>
              </div>
            </div>

            <div
              ref={chatScrollContainerRef}
              className="flex-1 overflow-auto p-4 sm:p-6"
            >
              {isCompareMode ? (
                renderCompareTool()
              ) : isTrackingMode ? (
                renderTrackingTool()
              ) : isGiftMessageMode ? (
                renderGiftMessageTool()
              ) : (
                <>
              <div className="space-y-3">
                {messages.map((message, index) => {
                  const isContextPanel = message.variant === "context-panel";
                  const isActiveContextPanel =
                    isContextPanel && conversationStage === "collecting-context";
                  const isLatestAssistantMessage =
                    message.role === "assistant" &&
                    index === latestAssistantMessageIndex;

                  return (
                    <div
                      key={`${message.role}-${index}`}
                      ref={index === messages.length - 1 ? latestMessageRef : null}
                      className={`flex min-w-0 items-end gap-2 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`min-w-0 rounded-[19px] break-words text-sm leading-6 shadow-[0_8px_18px_rgba(44,22,75,0.06)] [overflow-wrap:anywhere] ${
                          isContextPanel
                            ? "w-full max-w-[760px] rounded-bl-[5px] border border-[#e8e2f2] bg-[#fbf9ff] p-4"
                            : `w-fit max-w-[82%] px-4 py-3 ${
                                message.role === "user"
                                  ? "rounded-br-[5px] bg-[#3f246d] text-white"
                                  : "rounded-bl-[5px] bg-[#f0e9fb]"
                              }`
                        }`}
                      >
                        {isContextPanel ? (
                          renderContextPanel(isActiveContextPanel)
                        ) : (
                          <>
                            {renderChatMessage(message.content)}
                            {message.retryReason === "timeout" &&
                            message.retryText ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={isSending}
                                  onClick={() => void handleRetryMessage(message)}
                                  className="rounded-[10px] border border-[#3f246d] bg-white px-3 py-2 text-xs font-black text-[#3f246d] transition hover:bg-[#3f246d] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {getTryAgainLabel()}
                                </button>
                                {language !== "English" ? (
                                  <button
                                    type="button"
                                    disabled={isSending}
                                    onClick={() => handleLanguageChange("English")}
                                    className="rounded-[10px] border border-[#3f246d] bg-white px-3 py-2 text-xs font-black text-[#3f246d] transition hover:bg-[#3f246d] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {getSwitchToEnglishLabel()}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                      {isLatestAssistantMessage && language === "English" ? (
                        <button
                          type="button"
                          onClick={() => void speakMessage(message.content)}
                          disabled={isSpeaking}
                          className="grid h-9 w-9 flex-none place-items-center rounded-full border border-[#e8e2f2] bg-white text-[#3f246d] shadow-[0_6px_14px_rgba(44,22,75,0.08)] transition hover:border-[#3f246d] disabled:opacity-40"
                          title={readAloudTitle}
                          aria-label={readAloudTitle}
                        >
                          <Icon name="speaker" className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {activityMessage ? (
                  <div className="w-fit max-w-[82%] rounded-[19px] rounded-bl-[5px] bg-[#f0e9fb] px-4 py-3 text-sm font-bold leading-6 text-[#675f79] shadow-[0_8px_18px_rgba(44,22,75,0.06)]">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#3f246d]" />
                      {activityMessage}
                    </span>
                  </div>
                ) : null}
              </div>

              {!isGuidedMode ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {visibleReplyChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="rounded-full border border-[#e8e2f2] bg-white px-3 py-1.5 text-xs font-black text-[#3f246d] sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {getChipLabel(chip)}
                    </button>
                  ))}
                </div>
              ) : null}

              {shouldShowProductSuggestions ? (
              <div className="relative mt-5">
                {visibleProducts.length > 1 ? (
                  <div className="pointer-events-none absolute inset-x-2 top-[36%] z-10 flex -translate-y-1/2 items-center justify-between md:hidden">
                    <button
                      type="button"
                      onClick={() => scrollProductCarousel("prev")}
                      disabled={!canScrollProductCarouselLeft}
                      className="pointer-events-auto grid h-11 w-8 place-items-center rounded-full border border-white/55 bg-[#3f246d]/72 text-transparent text-lg font-black shadow-[0_14px_28px_rgba(26,15,46,0.22)] backdrop-blur-sm transition hover:scale-105 hover:bg-[#3f246d]/86 active:scale-95 disabled:cursor-default disabled:border-white/40 disabled:bg-[#cfc8dd]/72 disabled:opacity-100 disabled:hover:scale-100"
                      aria-label="Show previous product"
                    >
                      <span aria-hidden="true" className="text-white">
                        {"‹"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollProductCarousel("next")}
                      disabled={!canScrollProductCarouselRight}
                      className="pointer-events-auto grid h-11 w-8 place-items-center rounded-full border border-white/55 bg-[#3f246d]/72 text-transparent text-lg font-black shadow-[0_14px_28px_rgba(26,15,46,0.22)] backdrop-blur-sm transition hover:scale-105 hover:bg-[#3f246d]/86 active:scale-95 disabled:cursor-default disabled:border-white/40 disabled:bg-[#cfc8dd]/72 disabled:opacity-100 disabled:hover:scale-100"
                      aria-label="Show next product"
                    >
                      <span aria-hidden="true" className="text-white">
                        {"›"}
                      </span>
                    </button>
                  </div>
                ) : null}
              <div
                ref={productCarouselRef}
                className="grid auto-cols-[85%] grid-flow-col gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid-flow-row md:auto-cols-auto md:overflow-visible md:pb-0 md:grid-cols-3"
              >
                {recommendedProducts.length === 0 && isLoadingInitialProducts
                  ? [0, 1, 2].map((item) => (
                      <article
                        key={item}
                        className="snap-start overflow-hidden rounded-[20px] border border-[#e8e2f2] bg-white shadow-[0_10px_24px_rgba(44,22,75,0.07)] md:snap-none"
                      >
                        <div className="h-44 animate-pulse bg-[linear-gradient(90deg,#eee9f5_0%,#f8f5fc_45%,#eee9f5_100%)]" />
                        <div className="grid gap-3 p-3">
                          <div className="h-4 w-3/4 animate-pulse rounded-full bg-[#eee9f5]" />
                          <div className="h-3 w-1/3 animate-pulse rounded-full bg-[#f0e9fb]" />
                          <div className="grid gap-2">
                            <div className="h-3 animate-pulse rounded-full bg-[#f0e9fb]" />
                            <div className="h-3 w-5/6 animate-pulse rounded-full bg-[#f0e9fb]" />
                          </div>
                          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                            <div className="h-10 animate-pulse rounded-[10px] bg-[#ffdf00]/60" />
                            <div className="h-10 w-16 animate-pulse rounded-[10px] bg-[#eee9f5]" />
                          </div>
                        </div>
                      </article>
                    ))
                  : null}
                {recommendedProducts.length === 0 && !isLoadingInitialProducts ? (
                  <div className="rounded-[20px] border border-dashed border-[#e8e2f2] bg-white p-4 text-sm leading-6 text-[#675f79] md:col-span-3">
                    {text.initialEmpty}
                  </div>
                ) : null}
                {visibleProducts.map((product) => {
                  const isProductInCart = buyBox.some(
                    (item) => item.id === product.id,
                  );

                  return (
                    <article
                      key={product.id}
                      className="flex h-full snap-start flex-col overflow-hidden rounded-[20px] border border-[#e8e2f2] bg-white shadow-[0_10px_24px_rgba(44,22,75,0.07)] md:snap-none"
                    >
                      <div className="relative h-44 overflow-hidden bg-[#eee9f5]">
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          unoptimized
                          sizes="(min-width: 768px) 33vw, 100vw"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-black">{product.name}</h3>
                          <span className="rounded-lg bg-[#f6f4fb] px-2 py-1 text-[11px] font-black text-[#3f246d]">
                            {product.category}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] font-bold text-[#8a8299]">
                          ID: {product.id}
                        </p>
                        <p className="mt-2 h-[60px] overflow-hidden text-xs leading-5 text-[#675f79]">
                          {product.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="font-black text-[#3f246d]">
                            {formatPrice(product.price, product.currency)}
                          </span>
                          <span className="text-xs font-bold text-[#675f79]">
                            {product.stockLabel}
                          </span>
                        </div>
                        <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-3">
                          <button
                            type="button"
                            disabled={isProductInCart}
                            onClick={() => addToBuyBox(product)}
                            className="h-10 rounded-[10px] bg-[#ffdf00] text-sm font-black text-[#1a0f2e] disabled:cursor-default disabled:opacity-60"
                          >
                            {isProductInCart ? "Added to Cart" : text.addToBuyBox}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(product)}
                            className="grid h-10 place-items-center rounded-[10px] border border-[#e8e2f2] px-3 text-sm font-black text-[#3f246d]"
                          >
                            {text.productView}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              </div>
              ) : null}
              {isGuidedMode ? (
                <div className="mt-5 flex flex-wrap justify-center gap-2 border-t border-[#e8e2f2] pt-4">
                  {visibleReplyChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="rounded-full border border-[#e8e2f2] bg-white px-3 py-1.5 text-xs font-black text-[#3f246d] sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {getChipLabel(chip)}
                    </button>
                  ))}
                </div>
              ) : null}
                </>
              )}
            </div>

            {(isRecording || isVoiceProcessing || isImageProcessing) ? (
              <div className="absolute bottom-[88px] left-1/2 z-20 w-[min(92%,460px)] -translate-x-1/2 rounded-[16px] border border-[#e8e2f2] bg-white/95 px-4 py-3 text-sm font-black text-[#3f246d] shadow-[0_16px_40px_rgba(44,22,75,0.16)] backdrop-blur">
                {isRecording || isVoiceProcessing ? (
                  <p className="mb-2 rounded-[10px] bg-[#f0e9fb] px-3 py-2 text-xs font-bold text-[#675f79]">
                    {text.voiceEnglishOnly}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      isRecording ? "animate-pulse bg-[#e23b3b]" : "animate-pulse bg-[#3f246d]"
                    }`}
                  />
                  <span>
                    {isRecording
                      ? text.recordingVoice
                      : isVoiceProcessing
                        ? text.transcribingVoice
                        : text.uploadingImage}
                  </span>
                  {isRecording ? (
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={toggleRecordingPause}
                        className="h-9 rounded-[10px] border border-[#e8e2f2] bg-white px-3 text-xs font-black text-[#3f246d]"
                      >
                        {isRecordingPaused ? text.voiceResume : text.voicePause}
                      </button>
                      <button
                        type="button"
                        onClick={discardRecording}
                        className="h-9 rounded-[10px] border border-[#e8e2f2] bg-white px-3 text-xs font-black text-[#3f246d]"
                      >
                        {text.voiceStop}
                      </button>
                      <button
                        type="button"
                        onClick={sendRecording}
                        className="h-9 rounded-[10px] bg-[#ffdf00] px-3 text-xs font-black text-[#1a0f2e]"
                      >
                        {text.send}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!isFormToolMode && !isGuidedMode ? (
              <form
                onSubmit={(event) => void handleSubmit(event)}
                className="relative border-t border-[#e8e2f2] bg-white p-4"
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleImageChange(event)}
                  className="hidden"
                />
                {isComposerMenuOpen ? (
                  <div className="absolute bottom-[calc(100%+10px)] left-4 z-20 flex flex-col gap-2 rounded-[16px] border border-[#e8e2f2] bg-white p-2 shadow-[0_16px_40px_rgba(44,22,75,0.16)] md:hidden">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isRecording) {
                          void startRecording();
                        }
                      }}
                      disabled={isVoiceProcessing}
                      className={`flex h-11 items-center gap-2 rounded-[12px] px-3 text-sm font-black ${
                        isRecording
                          ? "bg-[#3f246d] text-white"
                          : "bg-[#f6f4fb] text-[#3f246d]"
                      } disabled:opacity-40`}
                    >
                      <Icon name="mic" className="h-4 w-4" />
                      <span>Voice</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex h-11 items-center gap-2 rounded-[12px] bg-[#f6f4fb] px-3 text-sm font-black text-[#3f246d]"
                    >
                      <Icon name="camera" className="h-4 w-4" />
                      <span>Image</span>
                    </button>
                  </div>
                ) : null}
                <div
                  ref={composerRef}
                  className="relative flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setIsComposerMenuOpen((current) => !current)}
                    className="grid h-12 w-12 place-items-center rounded-[15px] border border-[#e8e2f2] bg-white md:hidden"
                    aria-label="Open upload options"
                  >
                    <Icon name={isComposerMenuOpen ? "x" : "plus"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isRecording) {
                        void startRecording();
                      }
                    }}
                    disabled={isVoiceProcessing}
                    className={`hidden h-12 w-12 place-items-center rounded-[15px] border text-[0px] md:grid ${
                      isRecording
                        ? "border-[#3f246d] bg-[#3f246d] text-white"
                        : "border-[#e8e2f2] bg-white"
                    } disabled:opacity-40`}
                    title={text.voiceEnglishOnly}
                  >
                    <Icon name="mic" />
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="hidden h-12 w-12 place-items-center rounded-[15px] border border-[#e8e2f2] bg-white text-[0px] md:grid"
                    title="Upload image"
                  >
                    <Icon name="camera" />
                  </button>
                  <div className="relative min-w-0 flex-1">
                    {isPromptPopupOpen ? (
                      <div className="absolute bottom-[calc(100%+0.75rem)] left-[-3.5rem] right-[-3.5rem] z-20 rounded-[18px] border border-[#e8e2f2] bg-white p-2 shadow-[0_18px_40px_rgba(44,22,75,0.16)] md:left-0 md:right-0">
                        <div className="grid gap-2">
                          {suggestedPrompts.map((prompt) => (
                            <button
                              key={prompt.text}
                              type="button"
                              onClick={() => handleSuggestedPromptClick(prompt)}
                              className={`rounded-[14px] px-4 py-3 text-left text-sm transition ${
                                prompt.action === "custom"
                                  ? "border border-dashed border-[#d9d0ea] bg-[#faf8ff] text-[#5a5470]"
                                  : "bg-[#f6f1ff] text-[#1a0f2e] hover:bg-[#eee6ff]"
                              }`}
                            >
                              {prompt.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <input
                      ref={composerInputRef}
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value);
                        setIsPromptPopupOpen(false);
                      }}
                      onFocus={() => {
                        setIsComposerMenuOpen(false);
                        if (!input.trim()) {
                          setIsPromptPopupOpen(true);
                        }
                      }}
                      placeholder={text.askPlaceholder}
                      className="h-12 min-w-0 w-full rounded-[15px] border border-[#e8e2f2] px-4 outline-none disabled:bg-[#f6f4fb] disabled:text-[#675f79]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSending || input.trim().length === 0}
                    className="grid h-12 w-12 place-items-center rounded-[15px] bg-[#ffdf00] text-[#1a0f2e] disabled:opacity-50 md:hidden"
                    aria-label={isSending ? text.sending : text.send}
                  >
                    <Icon name="send" />
                  </button>
                  <button
                    type="submit"
                    disabled={isSending || input.trim().length === 0}
                    className="hidden h-12 rounded-[15px] bg-[#ffdf00] px-6 text-sm font-black text-[#1a0f2e] disabled:opacity-50 md:block"
                  >
                    {isSending ? text.sending : text.send}
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <aside
            className={`fixed inset-y-0 right-0 z-40 flex w-[88vw] max-w-[390px] min-w-0 flex-col overflow-hidden border-l border-[#e8e2f2] bg-white shadow-[0_12px_32px_rgba(44,22,75,0.18)] transition-transform xl:static xl:z-auto xl:h-full xl:w-auto xl:max-w-none xl:translate-x-0 xl:rounded-[18px] xl:border xl:shadow-[0_12px_32px_rgba(44,22,75,0.07)] ${
              isBuyBoxOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-[#e8e2f2] p-5 font-black">
              <span className="flex items-center gap-2">
                {text.buyBox} <Icon name="cart" className="h-5 w-5" />
                <span className="grid min-w-5 place-items-center rounded-full bg-[#3f246d] px-1.5 py-0.5 text-[11px] leading-none text-white">
                  {cartCount}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setIsBuyBoxOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#e8e2f2] xl:hidden"
                aria-label="Close cart"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <div className="grid gap-3 p-4">
              {buyBox.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[#e8e2f2] p-4 text-sm text-[#675f79]">
                  {text.addProducts}
                </div>
              ) : (
                buyBox.map((product) => (
                  <div
                    key={product.id}
                    className="flex gap-3 rounded-[18px] border border-[#e8e2f2] p-3"
                  >
                    <div className="relative h-12 w-12 flex-none overflow-hidden rounded-[14px] bg-[#f0e9fb]">
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        unoptimized
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-sm">{product.name}</strong>
                      <span className="block text-xs text-[#675f79]">
                        {formatPrice(product.price, product.currency)} -{" "}
                        {product.eta}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromBuyBox(product.id)}
                      className="h-8 w-8 rounded-lg border border-[#e8e2f2] text-sm font-black"
                    ><Icon name="trash" className="mx-auto h-4 w-4" /></button>
                  </div>
                ))
              )}
            </div>

            <div className="m-4 rounded-[22px] bg-[#3f246d] p-4 text-white">
              <div className="flex justify-between gap-3 text-sm">
                <span>{text.subtotal}</span>
                <strong>{formatPrice(totals.subtotal)}</strong>
              </div>
              <div className="mt-2 flex justify-between gap-3 text-sm">
                <span>{text.delivery}</span>
                <strong>{formatPrice(totals.delivery)}</strong>
              </div>
              <div className="mt-3 flex justify-between gap-3 text-xl font-black">
                <span>{text.total}</span>
                <strong>{formatPrice(totals.total)}</strong>
              </div>
              <button
                type="button"
                onClick={openCheckoutModal}
                className="mt-4 h-12 w-full cursor-pointer rounded-[14px] bg-[#ffdf00] text-sm font-black text-[#1a0f2e] transition hover:bg-white"
              >
                {text.createOrderLink}
              </button>
              {checkoutWarning ? (
                <p className="mt-2 text-xs font-semibold text-[#ffe082]">
                  {checkoutWarning}
                </p>
              ) : null}
            </div>
            </div>

          </aside>
        </div>
      </section>
    </main>
  );
}
