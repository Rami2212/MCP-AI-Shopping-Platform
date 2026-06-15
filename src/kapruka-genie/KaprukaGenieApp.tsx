"use client";

import Image from "next/image";
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
import { formatPrice, Product } from "@/lib/productCatalog";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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
  | "search"
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
  eventPlan?: string[];
  giftMessage?: string;
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

type CompareRow = {
  product: Product;
  suggestion: string;
};

type GuidedPlanItem = {
  label: string;
  quantity: string;
  searchTerm: string;
};

type GiftMessagePreferences = {
  language: string;
  size: string;
  suggestions: string;
  tone: string;
};

type ImageResponse = {
  error?: string;
  productHints?: string[];
  searchQuery?: string;
  summary?: string;
  visibleText?: string[];
};

type VoiceResponse = {
  error?: string;
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

type Language = "English" | "Sinhala" | "Singlish";

type ShoppingProfile = {
  budget: string;
  category: string;
  city: string;
  date: string;
  interests: string;
  occasion: string;
  recipient: string;
};

type ContextAnalysisResponse = {
  budget?: string | null;
  error?: string;
  missingFields?: RequiredField[];
  occasion?: string | null;
  recipient?: string | null;
};

type StoredChatState = {
  chips: string[];
  contextDraft: ContextDraft;
  conversationStage: "first-message" | "collecting-context" | "ready";
  input: string;
  language: Language;
  messages: ChatMessage[];
  pendingUserRequest: string;
  profile: ShoppingProfile;
  activeMode?: string;
  modeSessions?: Record<string, ModeSession>;
};

type ModeSession = {
  chips: string[];
  contextDraft: ContextDraft;
  conversationStage: "first-message" | "collecting-context" | "ready";
  input: string;
  messages: ChatMessage[];
  pendingUserRequest: string;
  profile: ShoppingProfile;
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
      "Hello! ආයුබෝවන්! Ayubowan! I am Kapruka Genie. Tell me what you are looking for, and I will guide the gift details.",
  },
];

const starterChips = [
  "Find a gift",
  "Find a cake",
  "Find flowers",
  "Find chocolates",
  "Find perfume",
  "Same-day delivery",
];

const languageOptions: Language[] = ["English", "Sinhala", "Singlish"];

const languageLabels: Record<Language, string> = {
  English: "English",
  Sinhala: "සිංහල",
  Singlish: "Singlish",
};

const starterMessagesByLanguage: Record<Language, ChatMessage[]> = {
  English: starterMessages,
  Sinhala: [
    {
      role: "assistant",
      content:
        "Ayubowan! මම Kapruka Genie. ඔබට අවශ්‍ය gift එක කියන්න, මම details guide කරන්නම්.",
    },
  ],
  Singlish: [
    {
      role: "assistant",
      content:
        "Ayubowan! Mama Kapruka Genie. Oyata ona gift eka kiyanna, mama details guide karannam.",
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
];

const recipientOptions = ["Male", "Female", "Child", "Couple"];

const occasionOptions = ["Birthday", "Anniversary", "Wedding", "Graduation"];

const giftTypeOptions = ["Flowers", "Electronics", "Perfumes", "Fashion", "Food"];

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
    budget: "ඔබගේ budget එක මොකක්ද?",
    occasion: "මේ තෑග්ග දෙන්නේ මොන අවස්ථාවකටද?",
    recipient: "තෑග්ග ලැබෙන්නේ කාටද?",
  },
  Singlish: {
    boxRecipient: "Gift box eka kaatada?",
    budget: "Budget eka mokakda?",
    category: "Mokak wage gift type ekak balannada?",
    eventType: "Event type eka mokakda?",
    giftBoxTheme: "Gift box theme eka mokakda?",
    itemCount: "Box ekata items keeyak oneda?",
    occasion: "Me gift eka mona occasion ekakatada?",
    participants: "Participants keedenek innawada?",
    recipient: "Gift eka denna one kaatada?",
    venue: "Event eka koheda thiyenne?",
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
    category: "Mokak wage gift type ekak balannada?",
    eventType: "Event type eka mokakda?",
    giftBoxTheme: "Gift box theme eka mokakda?",
    itemCount: "Box ekata items keeyak oneda?",
    participants: "Participants keedenek innawada?",
    venue: "Event eka koheda thiyenne?",
  },
};

const giftTypeMessages: Record<Language, string> = {
  English: "Thanks. What type of gift would you like to explore?",
  Sinhala: "ස්තුතියි. ඔබ බලන්න කැමති තෑගි වර්ගය තෝරන්න.",
  Singlish: "Thanks. mokak wage gift type ekak balannada?",
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

const initialShoppingProfile: ShoppingProfile = {
  budget: "",
  category: "",
  city: "Colombo",
  date: "2026-06-15",
  interests: "premium gifts, useful items",
  occasion: "",
  recipient: "",
};

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
      "I detected details from your first message and only need anything missing before answering it.",
    contextTitle: "Set shopping context",
    createOrderLink: "Create Order Link",
    date: "Date",
    detectedContext: "Detected context",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    eventPrompt: "Let us plan the event. Add the event details below.",
    giftBoxPrompt: "Let us build the gift box. Add the gift box details below.",
    giftMessageLabel: "Gift message",
    initialEmpty: "Kapruka MCP products will appear here after a search.",
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
    sendContext: "Send Context",
    sending: "Sending",
    sendingContext: "Sending Context",
    senderName: "Sender name",
    subtotal: "Subtotal",
    trackingPrompt: "Enter your Kapruka order number and I will check the latest status.",
    transcribingVoice: "Transcribing voice note...",
    total: "Total",
    uploadingImage: "Processing image...",
    useContextCard: "Use the context card above...",
    userContext: "Preferences",
    voicePause: "Pause",
    voiceResume: "Resume",
    voiceStop: "Stop",
  },
  Sinhala: {
    active: "සක්‍රිය",
    addProducts: "Order link එකකට products එකතු කරන්න.",
    addToBuyBox: "Cart එකට එකතු කරන්න",
    allContextDetected: "ඔබගේ message එකෙන් අවශ්‍ය context හමු වුණා.",
    askPlaceholder: "Genieගෙන් search, compare, plan, checkout අහන්න...",
    buyBox: "Cart",
    checkout: "Delivery address",
    city: "නගරය",
    continueWithoutContext: "Context නැතුව ඉදිරියට",
    contextIntro:
      "ඔබගේ පළමු message එකෙන් හමු වූ details පාවිච්චි කරලා, අඩු දේවල් විතරක් අහනවා.",
    contextTitle: "Shopping context තෝරන්න",
    createOrderLink: "Order Link හදන්න",
    date: "දිනය",
    detectedContext: "හමු වූ context",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    initialEmpty: "Search එකකට පස්සේ Kapruka MCP products මෙතැන පෙන්වයි.",
    initialLoading: "Products load වෙනවා...",
    language: "භාෂාව",
    modes: "Agent Modes",
    openCheckout: "Checkout අරින්න",
    productView: "බලන්න",
    recipientName: "Recipient name",
    recipientPhone: "Recipient phone",
    send: "යවන්න",
    sendContext: "Context යවන්න",
    sending: "යවමින්",
    sendingContext: "Context යවමින්",
    senderName: "Sender name",
    subtotal: "Subtotal",
    total: "Total",
    useContextCard: "ඉහළ context card එක භාවිත කරන්න...",
    userContext: "Preferences",
  },
  Singlish: {
    active: "Active",
    addProducts: "Cart order link ekak hadanna products add karanna.",
    addToBuyBox: "Cart ekata add karanna",
    allContextDetected: "Oyageda message eken needed context tika detect una.",
    askPlaceholder: "Genie gen search, compare, plan, checkout ahanna...",
    buyBox: "Cart",
    checkout: "Delivery address",
    city: "City eka",
    clearHistory: "History clear karanna",
    comparePrompt: "Product IDs 2k hari 3k hari denna. Mama table ekakin compare karannam.",
    continueWithoutContext: "Context nathuwa continue",
    contextIntro:
      "Oyage message eken details detect kala.",
    contextTitle: "Shopping context set karanna",
    createOrderLink: "Order Link hadanna",
    date: "Date eka",
    detectedContext: "Detected context",
    delivery: "Delivery",
    deliveryInstructions: "Delivery instructions",
    eventPrompt: "Event eka plan karamu. Pahala details tika denna.",
    giftBoxPrompt: "Gift box eka hadamu. Pahala details tika denna.",
    giftMessageLabel: "Gift message",
    initialEmpty: "Search ekakata passe Kapruka MCP products methana pennanawa.",
    initialLoading: "Products load wenawa...",
    language: "Language",
    modes: "Agent Modes",
    openCheckout: "Checkout open karanna",
    productView: "Balanna",
    recipientName: "Recipient name",
    recipientPhone: "Recipient phone",
    relatedGiftsReply: "Mama oyata related gifts pennannam.",
    send: "Send",
    sendContext: "Context send karanna",
    sending: "Sending",
    sendingContext: "Context sending",
    senderName: "Sender name",
    subtotal: "Subtotal",
    trackingPrompt: "Kapruka order number eka denna. Mama latest status eka balannam.",
    total: "Total",
    useContextCard: "Uda context card eka use karanna...",
    userContext: "Preferences",
  },
};

const copyOverrides: Record<Language, Partial<Required<(typeof copy)["English"]>>> = {
  English: {},
  Sinhala: {
    addProducts: "Cart order link එකක් හදන්න products එකතු කරන්න.",
    addToBuyBox: "Cart එකට එකතු කරන්න",
    buyBox: "Cart",
    clearHistory: "History clear කරන්න",
    comparePrompt: "Product IDs 2ක් හෝ 3ක් දෙන්න. මම table එකකින් compare කරන්නම්.",
    contextIntro: "ඔබ දුන් details අනුව අඩු තොරතුරු ටික පමණක් තෝරන්න.",
    contextTitle: "Context තෝරන්න",
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
    useContextCard: "ඉහළ context card එක භාවිතා කරන්න...",
    userContext: "Preferences",
    voicePause: "Pause",
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
    voiceResume: "Resume",
    voiceStop: "Stop",
  },
};

const starterChipLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Build a gift box": "Gift box එකක් හදන්න",
    "Compare products": "Products compare කරන්න",
    "Find a gift": "Gift එකක් හොයන්න",
    "Plan an event": "Event එකක් plan කරන්න",
    "Track an order": "Order track කරන්න",
    "Write a gift message": "Gift message ලියන්න",
  },
  Singlish: {
    "Build a gift box": "Gift box hadanna",
    "Compare products": "Products compare karanna",
    "Find a gift": "Gift ekak hoyanna",
    "Plan an event": "Event ekak plan karanna",
    "Track an order": "Order track karanna",
    "Write a gift message": "Gift message liyanna",
  },
};

const starterChipOverrides: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Find a cake": "Cake එකක් හොයන්න",
    "Find chocolates": "Chocolate හොයන්න",
    "Find flowers": "Flowers හොයන්න",
    "Find perfume": "Perfume හොයන්න",
    "Same-day delivery": "Same-day delivery",
  },
  Singlish: {
    "Find a cake": "Cake ekak hoyanna",
    "Find chocolates": "Chocolate hoyanna",
    "Find flowers": "Flowers hoyanna",
    "Find perfume": "Perfume hoyanna",
    "Same-day delivery": "Same-day delivery",
  },
};

const optionLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Above Rs. 10,000": "Rs. 10,000 ට වැඩි",
    Anniversary: "Anniversary",
    Birthday: "Birthday",
    Child: "ළමයෙක්",
    Couple: "Couple",
    Electronics: "Electronics",
    Fashion: "Fashion",
    Female: "කාන්තාවක්",
    Flowers: "Flowers",
    Food: "Food",
    Graduation: "Graduation",
    Male: "පුරුෂයෙක්",
    Perfumes: "Perfumes",
    "Rs. 2,500 - 5,000": "Rs. 2,500 - 5,000",
    "Rs. 5,000 - 10,000": "Rs. 5,000 - 10,000",
    "Under Rs. 2,500": "Rs. 2,500 ට අඩු",
    Wedding: "Wedding",
  },
  Singlish: {
    "Above Rs. 10,000": "Rs. 10,000 ta wedi",
    Anniversary: "Anniversary",
    Birthday: "Birthday",
    Child: "Child",
    Couple: "Couple",
    Electronics: "Electronics",
    Fashion: "Fashion",
    Female: "Female",
    Flowers: "Flowers",
    Food: "Food",
    Graduation: "Graduation",
    Male: "Male",
    Perfumes: "Perfumes",
    "Rs. 2,500 - 5,000": "Rs. 2,500 - 5,000",
    "Rs. 5,000 - 10,000": "Rs. 5,000 - 10,000",
    "Under Rs. 2,500": "Rs. 2,500 ta adu",
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
};

const dynamicChipLabels: Record<Language, Record<string, string>> = {
  English: {},
  Sinhala: {
    "Check delivery": "Delivery check කරන්න",
    Chocolate: "Chocolate",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link හදන්න",
    "More like this": "මේ වගේ තවත්",
    Perfume: "Perfume",
    Roses: "Roses",
    Watch: "Watch",
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
};

const commonChipLabels: Record<Language, Record<string, string>> = {
  English: {
    "Next item": "Next item",
    "Suggest more": "Suggest more",
  },
  Sinhala: {
    "Check delivery": "Delivery check කරන්න",
    Chocolate: "චොකලට්",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link හදන්න",
    "Enter order number": "Order number එක දාන්න",
    "More like this": "මේ වගේ තවත්",
    "Open checkout": "Checkout අරින්න",
    Perfume: "සුවඳ විලවුන්",
    Roses: "රෝස මල්",
    "Search more products": "තව products හොයන්න",
    "Search products": "Products හොයන්න",
    "Track another order": "තව order එකක් track කරන්න",
    "Track order": "Order track කරන්න",
    Watch: "ඔරලෝසුව",
  },
  Singlish: {
    "Check delivery": "Delivery check karanna",
    Chocolate: "Chocolate",
    "Colombo delivery": "Colombo delivery",
    "Create order link": "Order link hadanna",
    "Enter order number": "Order number eka danna",
    "More like this": "Me wage thawa",
    "Open checkout": "Checkout open karanna",
    Perfume: "Perfume",
    Roses: "Roses",
    "Search more products": "Thawa products hoyanna",
    "Search products": "Products hoyanna",
    "Track another order": "Thawa order ekak track karanna",
    "Track order": "Order track karanna",
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
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.5-2 5 5",
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function getTaskForMode(mode: string) {
  if (mode.includes("Event")) return "eventPlan";
  if (mode.includes("Gift Box")) return "giftBox";
  if (mode.includes("Compare")) return "compare";
  if (mode.includes("Tracking")) return "track";
  if (mode.includes("Message")) return "giftMessage";
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

export function KaprukaGenieApp() {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const shouldSendRecordingRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const playbackUrlRef = useRef<string | null>(null);
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
    instructions: "",
    recipientName: "",
    recipientPhone: "",
    senderName: "",
  });
  const [profile, setProfile] =
    useState<ShoppingProfile>(initialShoppingProfile);
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
  const [activityMessage, setActivityMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [isChatStateLoaded, setIsChatStateLoaded] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isBuyBoxOpen, setIsBuyBoxOpen] = useState(false);
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
  const [giftMessagePreferences, setGiftMessagePreferences] =
    useState<GiftMessagePreferences>({
      language: "English",
      size: "Short",
      suggestions: "",
      tone: "Warm",
    });
  const [isGiftMessageGenerating, setIsGiftMessageGenerating] = useState(false);

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
  const visibleProducts = recommendedProducts.slice(0, 3);
  const isCompareMode = activeMode.includes("Compare");
  const isTrackingMode = activeMode.includes("Tracking");
  const isGiftMessageMode = activeMode.includes("Message");
  const isFormToolMode = isCompareMode || isTrackingMode || isGiftMessageMode;

  function getChipLabel(chip: string) {
    return (
      starterChipOverrides[language][chip] ??
      starterChipLabels[language][chip] ??
      commonChipLabels[language][chip] ??
      dynamicChipLabels[language][chip] ??
      contextOptionLabels[language][chip] ??
      optionLabels[language][chip] ??
      chip
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
        input: "",
        messages: starterMessagesByLanguage[language],
        pendingUserRequest: "",
        profile: initialShoppingProfile,
      };
    }

    const needsContext = mode.includes("Event") || mode.includes("Gift Box");

    return {
      chips: [],
      contextDraft: emptyContextDraft,
      conversationStage: needsContext ? "collecting-context" : "ready",
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
      profile,
    };
  }

  function getCurrentModeSession(): ModeSession {
    return {
      chips,
      contextDraft,
      conversationStage,
      input,
      messages,
      pendingUserRequest,
      profile,
    };
  }

  function applyModeSession(session: ModeSession) {
    setChips(session.chips);
    setContextDraft(session.contextDraft);
    setConversationStage(session.conversationStage);
    setInput(session.input);
    setMessages(session.messages);
    setPendingUserRequest(session.pendingUserRequest);
    setProfile(session.profile);
  }

  function resetToolPanels() {
    setCompareRows([]);
    setCompareSuggestion("");
    setTrackingResult("");
    setTrackingSuggestion("");
    setGuidedPlanItems([]);
    setGuidedPlanIndex(0);
  }

  function getProductCardsUpdatedReply(data: CommerceResponse) {
    if (data.reply?.toLowerCase().startsWith("no products match")) {
      return data.reply;
    }

    if (!data.products || data.products.length === 0) {
      if (language === "Sinhala") return "Product cards හමු වුණේ නැහැ.";
      if (language === "Singlish") return "Product cards hambune naha.";
      return "I could not find matching product cards.";
    }

    if (language === "Sinhala") return "Product cards update කළා.";
    if (language === "Singlish") return "Product cards update kala.";
    return "I updated the product cards.";
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
      const theme = draft.giftBoxTheme || profile.category;
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

  function normalizeGuidedPlanItems(items: string[], mode = activeMode) {
    const fallback = getDefaultPlanItems(mode, contextDraft);

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

  function getGuidedPlanReply(items: GuidedPlanItem[], index = 0) {
    const nextItem = items[index]?.label ?? items[0]?.label ?? "gift";
    const nextItemLabel = nextItem;
    const list = items
      .slice(0, 5)
      .map((item) => `- ${formatGuidedPlanItem(item)}`)
      .join("\n");

    if (language === "Sinhala") {
      return `ඔබට අවශ්‍ය විය හැකි දේ: ${list}. මුලින්ම ${nextItem} suggest කරන්නම්.`;
    }

    if (language === "Singlish") {
      return `Oyata one wenna puluwan dewal:\n${list}\nMulinnama ${nextItemLabel} suggest karannam.`;
    }

    return `This is what you might need:\n${list}\nFirst I will suggest ${nextItemLabel}.`;
  }

  function getStepReply(item: GuidedPlanItem | string, isMore = false) {
    const label = typeof item === "string" ? item : formatGuidedPlanItem(item);

    if (isMore) {
      if (language === "Sinhala") return `${label} walata thawa options pennanawa.`;
      if (language === "Singlish") return `${label} walata thawa options pennanawa.`;
      return `I will show more options for ${label}.`;
    }

    if (typeof item !== "string") {
      if (language === "Sinhala") return `Dan ${label} walata cards pennanawa.`;
      if (language === "Singlish") return `Dan ${label} walata cards pennanawa.`;
      return `Now I will suggest ${label}.`;
    }

    if (language === "Sinhala") return `දැන් ${item} සඳහා cards පෙන්වනවා.`;
    if (language === "Singlish") return `Dan ${item} walata cards pennanawa.`;
    return `Now I will suggest ${item}.`;
  }

  function getNeutralGuidedReply() {
    if (language === "Sinhala") return "Hari, ekata galapena options pennanawa.";
    if (language === "Singlish") return "Hari, ekata galapena options pennanawa.";
    return "Sure, I will show related options";
  }

  function getImageSearchReply(data: ImageResponse) {
    const imageSummary = data.summary?.trim();

    return imageSummary
      ? `${text.imageLooksLike} ${imageSummary}. ${text.relatedGiftsReply}`
      : text.relatedGiftsReply;
  }

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage);
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
                className="h-12 rounded-[14px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
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
                className="h-12 rounded-[14px] border border-[#e8e2f2] px-3 text-[#161226] outline-none"
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
            <div className="overflow-x-auto">
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
      <div className="grid h-full min-h-0 grid-rows-[minmax(180px,1fr)_auto] gap-4">
        <section className="min-h-0 rounded-[18px] border border-[#e8e2f2] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-[#3f246d]">
              Gift Message
            </h2>
            <button
              type="button"
              onClick={() => void generateGiftMessage("")}
              disabled={isGiftMessageGenerating}
              className="h-10 rounded-[12px] bg-[#ffdf00] px-4 text-sm font-black text-[#1a0f2e] disabled:opacity-50"
            >
              {isGiftMessageGenerating ? "Generating..." : "Generate default"}
            </button>
          </div>
          <textarea
            value={giftMessage}
            onChange={(event) => setGiftMessage(event.target.value)}
            className="h-[calc(100%-3.25rem)] min-h-[140px] w-full resize-none rounded-[14px] border border-[#e8e2f2] bg-[#fbf9ff] p-4 text-base leading-7 text-[#161226] outline-none"
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
    let isMounted = true;

    async function restoreChatState() {
      try {
        const storedState = await readStoredChatState();

        if (!isMounted) {
          return;
        }

        if (storedState) {
          const restoredMode = storedState.activeMode ?? "Smart Shopping";
          const restoredSessions = storedState.modeSessions ?? {};
          const restoredSession =
            restoredSessions[restoredMode] ?? {
              chips: storedState.chips,
              contextDraft: storedState.contextDraft,
              conversationStage: storedState.conversationStage,
              input: storedState.input,
              messages: storedState.messages,
              pendingUserRequest: storedState.pendingUserRequest,
              profile: storedState.profile,
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
      input,
      language,
      messages,
      modeSessions: {
        ...modeSessions,
        [activeMode]: {
          chips,
          contextDraft,
          conversationStage,
          input,
          messages,
          pendingUserRequest,
          profile,
        },
      },
      pendingUserRequest,
      profile,
    });
  }, [
    activeMode,
    chips,
    contextDraft,
    conversationStage,
    input,
    isChatStateLoaded,
    language,
    messages,
    modeSessions,
    pendingUserRequest,
    profile,
  ]);

  useEffect(() => {
    if (initialProductsLoadedRef.current) {
      return;
    }

    initialProductsLoadedRef.current = true;
    let isMounted = true;

    async function loadInitialProducts() {
      setStatus("Kapruka MCP is loading live starter products.");

      try {
        const response = await fetch("/api/ai/commerce", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cartIds: [],
            mode: "Smart Shopping",
            profile: initialShoppingProfile,
            query: "gift",
            task: "initial",
          }),
        });
        const data = (await response.json()) as CommerceResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Kapruka MCP product load failed.");
        }

        if (!isMounted) {
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

        setStatus("Live Kapruka MCP starter products ready.");
      } catch (error) {
        if (isMounted) {
          setStatus(getErrorMessage(error));
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
  }, []);

  function addMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function addToBuyBox(product: Product) {
    setBuyBox((current) =>
      current.some((item) => item.id === product.id)
        ? current
        : [...current, product],
    );
  }

  function removeFromBuyBox(productId: string) {
    setBuyBox((current) => current.filter((item) => item.id !== productId));
  }

  function applyCommerceResponse(data: CommerceResponse) {
    if (data.products && data.products.length > 0) {
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

    if (data.chips && data.chips.length > 0) {
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
  }

  async function runCommerce(
    query: string,
    mode = activeMode,
    profileOverride = profile,
  ) {
    const response = await fetch("/api/ai/commerce", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cartIds: buyBox.map((product) => product.id),
        language,
        mode,
        profile: profileOverride,
        query,
        task: getTaskForMode(mode),
      }),
    });
    const data = (await response.json()) as CommerceResponse & { error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? "Kapruka MCP commerce request failed.");
    }

    applyCommerceResponse(data);
    return data;
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

  async function analyzeFirstMessage(content: string) {
    const response = await fetch("/api/ai/context-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          budget: profile.budget || null,
          occasion: profile.occasion || null,
          recipient: profile.recipient || null,
        },
        message: content,
      }),
    });
    const data = (await response.json()) as ContextAnalysisResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "Groq context analysis failed.");
    }

    return data;
  }

  function showContextPanel(nextProfile: ShoppingProfile) {
    setConversationStage("collecting-context");
    setContextDraft(getContextDraftFromProfile(nextProfile));
    setChips([]);
    addMessage({
      role: "assistant",
      content: getModeIntroMessage(activeMode),
      variant: "context-panel",
    });
    setStatus("Choose context chips or continue without context.");
  }

  async function answerWithCollectedContext(
    request: string,
    requestProfile: ShoppingProfile,
  ) {
    setConversationStage("ready");
    setChips(starterChips);
    setStatus(
      "Groq is answering with the collected context. Kapruka MCP is searching products.",
    );
    const commerceData = await runCommerce(
      `${request}\n${buildContextSummary(contextDraft)}\nBudget: ${requestProfile.budget}\nRecipient: ${requestProfile.recipient}\nOccasion: ${requestProfile.occasion}\nGift type: ${requestProfile.category}`,
      activeMode,
      requestProfile,
    );

    if (activeMode.includes("Event") || activeMode.includes("Gift Box")) {
      const planItems = normalizeGuidedPlanItems(
        commerceData.eventPlan ?? [],
        activeMode,
      );
      const firstItem = planItems[0] ?? "gift";

      setGuidedPlanItems(planItems);
      setGuidedPlanIndex(0);
      setGuidedMoreCount(0);
      await runCommerce(getPlanSearchTerm(firstItem), activeMode, requestProfile);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: getGuidedPlanReply(planItems, 0),
        },
      ]);
      setChips(["Next item", "Suggest more"]);
      setStatus("Guided suggestions ready.");
      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: getProductCardsUpdatedReply(commerceData),
      },
    ]);
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
        occasion: analysis.occasion ?? profile.occasion,
        recipient: analysis.recipient ?? profile.recipient,
      };
    } catch (error) {
      setStatus(`${getErrorMessage(error)} Choose context manually.`);
    }

    setPendingUserRequest(content);
    showContextPanel(nextProfile);
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
    setMessages(nextMessages);
    setIsSending(true);
    setActivityMessage(text.processing);

    try {
      await answerWithCollectedContext(
        pendingUserRequest || contextMessage,
        nextProfile,
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleReadyMessage(content: string) {
    setStatus("Groq is answering. Kapruka MCP is searching products.");
    const commerceData = await runCommerce(content);

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: getProductCardsUpdatedReply(commerceData),
      },
    ]);
    setStatus("Groq chat complete. Kapruka MCP commerce panels updated.");
  }

  async function handleGuidedCustomMessage(content: string) {
    setStatus("Kapruka MCP is finding related guided options.");
    await runCommerce(content);
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: getNeutralGuidedReply(),
      },
    ]);
    setChips(["Next item", "Suggest more"]);
    setStatus("Related guided options loaded.");
  }

  async function handleNextGuidedItem() {
    if (isSending || guidedPlanItems.length === 0) {
      return;
    }

    const nextIndex = guidedPlanIndex + 1;

    if (nextIndex >= guidedPlanItems.length) {
      setChips(["Next item", "Suggest more"]);
      addMessage({
        role: "assistant",
        content:
          language === "Singlish"
            ? "Checklist eke okkoma item cards pennuwa."
            : language === "Sinhala"
              ? "Checklist item cards සියල්ල පෙන්වා අවසන්."
              : "I have shown the checklist item cards.",
      });
      return;
    }

    const nextItem = guidedPlanItems[nextIndex];
    setIsSending(true);
    setActivityMessage(text.processing);
    setGuidedPlanIndex(nextIndex);

    try {
      await runCommerce(getPlanSearchTerm(nextItem));
      addMessage({
        role: "assistant",
        content: getStepReply(nextItem),
      });
      setChips(["Next item", "Suggest more"]);
      setStatus("Next guided item loaded.");
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
      await runCommerce(getMoreSearchTerm(currentItem, nextMoreCount));
      addMessage({
        role: "assistant",
        content: getStepReply(currentItem, true),
      });
      setChips(["Next item", "Suggest more"]);
      setStatus("More options loaded.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  function handleChipClick(chip: string) {
    if (chip === "Next item") {
      void handleNextGuidedItem();
      return;
    }

    if (chip === "Suggest more") {
      void handleSuggestMoreGuidedItem();
      return;
    }

    void submitText(getLocalizedUserText(chip));
  }

  async function submitText(nextText: string) {
    const content = nextText.trim();
    if (!content || isSending) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setActivityMessage(text.processing);

    try {
      if (conversationStage === "collecting-context") {
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
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitText(input);
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
          profile,
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
        suggestion:
          recommendations.get(product.id) ||
          data.reply ||
          "AI suggestion unavailable.",
      }));

      setCompareRows(rows);
      setCompareSuggestion(data.reply ?? "");
      setStatus(
        rows.length >= 2
          ? "Product comparison table ready."
          : (data.reply ?? "Could not match two products for comparison."),
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
          profile,
          query: id,
          task: "track",
        }),
      });
      const data = (await response.json()) as CommerceResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Order tracking failed.");
      }

      setTrackingResult(data.tracking ?? "No tracking update returned.");
      setTrackingSuggestion(data.reply ?? "");
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
          profile,
          query: nextPreferences.suggestions || "Generate a gift message",
          task: "giftMessage",
        }),
      });
      const data = (await response.json()) as CommerceResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Gift message generation failed.");
      }

      setGiftMessage(data.giftMessage || giftMessage);
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

    setModeSessions({});
    applyModeSession(nextSession);
    resetToolPanels();
    setStatus("Chat history cleared.");

    try {
      await clearStoredChatState();
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function handleCreateOrderLink() {
    if (buyBox.length === 0) {
      setStatus("Add at least one live Kapruka product before checkout.");
      return;
    }

    setActivityMessage(text.processing);
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
            giftMessage,
          },
          language,
          mode: activeMode,
          profile,
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
      addMessage({
        role: "assistant",
        content:
          "Kapruka MCP created a guest-checkout link. Open it from the Cart to complete payment in the browser.",
      });
      setStatus("Kapruka MCP checkout link created.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

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
      await runCommerce(query);
      setStatus("Groq image analysis complete. Kapruka MCP products updated.");
    } catch (error) {
      setStatus(getErrorMessage(error));
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

    shouldSendRecordingRef.current = false;
    mediaRecorderRef.current.stop();
  }

  function sendRecording() {
    if (!mediaRecorderRef.current || !isRecording) {
      return;
    }

    shouldSendRecordingRef.current = true;
    setIsVoiceProcessing(true);
    setActivityMessage(text.transcribingVoice);
    setStatus("Groq is transcribing the voice note.");
    mediaRecorderRef.current.stop();
  }

  async function transcribeVoice(file: File) {
    const formData = new FormData();
    formData.append("audio", file);
    if (language === "Sinhala") {
      formData.append("language", "si");
    }
    setIsVoiceProcessing(true);
    setActivityMessage(text.transcribingVoice);

    try {
      const response = await fetch("/api/ai/voice-messages", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as VoiceResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Groq transcription failed.");
      }

      const transcript = data.transcript ?? "";
      if (!transcript) {
        throw new Error("Groq returned an empty transcript.");
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

  async function speakLastReply() {
    const lastReply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant")?.content;

    if (!lastReply || isSpeaking) {
      return;
    }

    setIsSpeaking(true);
    setActivityMessage(text.processing);
    setStatus("Groq is generating voice output.");

    try {
      const response = await fetch("/api/ai/voice-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: lastReply.slice(0, 1000) }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Groq speech request failed.");
      }

      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current);
      }

      const audioUrl = URL.createObjectURL(await response.blob());
      playbackUrlRef.current = audioUrl;
      new Audio(audioUrl).play();
      setStatus("Groq voice reply generated.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setActivityMessage("");
      setIsSpeaking(false);
    }
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
          <p className="mt-1 text-sm leading-6 text-[#675f79]">
            {text.contextIntro}
          </p>
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
                  className="rounded-full border border-[#3f246d] bg-[#3f246d] px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="rounded-full border border-[#e8e2f2] bg-white px-4 py-2 text-sm font-black text-[#3f246d] transition hover:border-[#3f246d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {getOptionLabel(option)}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#e8e2f2] bg-white p-3 text-sm font-bold text-[#675f79]">
            {text.allContextDetected}
          </div>
        )}

        <div className="grid gap-2 border-t border-[#e8e2f2] pt-4 sm:grid-cols-[1fr_auto]">
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
      <section className="flex h-full w-full flex-col gap-3 px-4 py-4">
        <div className="flex flex-none flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="mt-1 text-3xl font-black tracking-normal sm:text-4xl">
              <span className="text-[#3f246d]">Kapruka</span>{" "}
              <span className="text-[#ffdf00] drop-shadow-[0_1px_0_rgba(26,15,46,0.35)]">Genie</span>
            </h1>
          </div>
          <div className="rounded-[18px] border border-[#e8e2f2] bg-white px-4 py-3 text-sm font-bold text-[#3f246d] shadow-[0_12px_32px_rgba(44,22,75,0.07)]">
            {status}
          </div>
          <div className="flex gap-2 xl:hidden">
            <button
              type="button"
              onClick={() => setIsLeftPanelOpen(true)}
              className="flex h-11 items-center gap-2 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d]"
            >
              <Icon name="menu" className="h-4 w-4" />
              {text.modes}
            </button>
            <button
              type="button"
              onClick={() => setIsBuyBoxOpen(true)}
              className="flex h-11 items-center gap-2 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d]"
            >
              <Icon name="cart" className="h-4 w-4" />
              {text.buyBox}
            </button>
          </div>
        </div>

        {(isLeftPanelOpen || isBuyBoxOpen) && (
          <button
            type="button"
            aria-label="Close panels"
            onClick={() => {
              setIsLeftPanelOpen(false);
              setIsBuyBoxOpen(false);
            }}
            className="fixed inset-0 z-30 bg-[#161226]/35 xl:hidden"
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
                {text.modes} <Icon name="settings" className="h-4 w-4" />
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
                      setProfile((current) => ({
                        ...current,
                        budget: event.target.value,
                      }))
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
                      setProfile((current) => ({
                        ...current,
                        recipient: event.target.value,
                      }))
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
                      setProfile((current) => ({
                        ...current,
                        occasion: event.target.value,
                      }))
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
              </div>
            </div>
          </aside>

          <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#e8e2f2] bg-[linear-gradient(180deg,#fff_0%,#fbf9ff_100%)] shadow-[0_12px_32px_rgba(44,22,75,0.07)]">
            <div className="flex items-center justify-between border-b border-[#e8e2f2] p-5 font-black">
              <span>{activeMode}</span>
              <div className="flex items-center gap-3 [&>span.text-sm]:hidden">
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
                  className="h-10 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d] outline-none"
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
                  className="flex h-10 items-center gap-2 rounded-[12px] border border-[#e8e2f2] bg-white px-3 text-sm font-black text-[#3f246d]"
                  title={text.clearHistory}
                >
                  <Icon name="trash" className="h-4 w-4" />
                  <span>{text.clearHistory}</span>
                </button>
                <span className="flex items-center gap-1 text-[14px] text-[#18a058]">
                  <Icon name="check" className="h-4 w-4" /> {text.active}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6">
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

                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`min-w-0 rounded-[19px] break-words text-sm leading-6 shadow-[0_8px_18px_rgba(44,22,75,0.06)] [overflow-wrap:anywhere] ${
                        isContextPanel
                          ? "w-full max-w-[760px] rounded-bl-[5px] border border-[#e8e2f2] bg-[#fbf9ff] p-4"
                          : `w-fit max-w-[82%] px-4 py-3 ${
                              message.role === "user"
                                ? "ml-auto rounded-br-[5px] bg-[#3f246d] text-white"
                                : "rounded-bl-[5px] bg-[#f0e9fb]"
                            }`
                      }`}
                    >
                      {isContextPanel
                        ? renderContextPanel(isActiveContextPanel)
                        : renderChatMessage(message.content)}
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

              <div className="mt-5 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className="rounded-full border border-[#e8e2f2] bg-white px-4 py-2 text-sm font-black text-[#3f246d]"
                  >
                    {getChipLabel(chip)}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {recommendedProducts.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-[#e8e2f2] bg-white p-4 text-sm leading-6 text-[#675f79] md:col-span-3">
                    {isLoadingInitialProducts
                      ? text.initialLoading
                      : text.initialEmpty}
                  </div>
                ) : null}
                {visibleProducts.map((product) => (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-[20px] border border-[#e8e2f2] bg-white shadow-[0_10px_24px_rgba(44,22,75,0.07)]"
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
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-black">{product.name}</h3>
                        <span className="rounded-lg bg-[#f6f4fb] px-2 py-1 text-[11px] font-black text-[#3f246d]">
                          {product.category}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] font-bold text-[#8a8299]">
                        ID: {product.id}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[#675f79]">
                        {fitReasons[product.id] ?? product.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="font-black text-[#3f246d]">
                          {formatPrice(product.price, product.currency)}
                        </span>
                        <span className="text-xs font-bold text-[#675f79]">
                          {product.stockLabel}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => addToBuyBox(product)}
                          className="h-10 rounded-[10px] bg-[#ffdf00] text-sm font-black text-[#1a0f2e]"
                        >
                          {text.addToBuyBox}
                        </button>
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="grid h-10 place-items-center rounded-[10px] border border-[#e8e2f2] px-3 text-sm font-black text-[#3f246d]"
                        >
                          {text.productView}
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
                </>
              )}
            </div>

            {(isRecording || isVoiceProcessing || isImageProcessing) ? (
              <div className="absolute bottom-[88px] left-1/2 z-20 w-[min(92%,460px)] -translate-x-1/2 rounded-[16px] border border-[#e8e2f2] bg-white/95 px-4 py-3 text-sm font-black text-[#3f246d] shadow-[0_16px_40px_rgba(44,22,75,0.16)] backdrop-blur">
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

            {!isFormToolMode ? (
              <form
                onSubmit={(event) => void handleSubmit(event)}
                className="flex flex-wrap gap-2 border-t border-[#e8e2f2] bg-white p-4"
              >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => void handleImageChange(event)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  if (!isRecording) {
                    void startRecording();
                  }
                }}
                disabled={isVoiceProcessing}
                className={`grid h-12 w-12 place-items-center rounded-[15px] border text-[0px] ${
                  isRecording
                    ? "border-[#3f246d] bg-[#3f246d] text-white"
                    : "border-[#e8e2f2] bg-white"
                } disabled:opacity-40`}
                title="Voice input"
              >
                <Icon name="mic" />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="grid h-12 w-12 place-items-center rounded-[15px] border border-[#e8e2f2] bg-white text-[0px]"
                title="Upload image"
              >
                <Icon name="camera" />
              </button>
              <button
                type="button"
                onClick={() => void speakLastReply()}
                disabled={isSpeaking}
                className="grid h-12 w-12 place-items-center rounded-[15px] border border-[#e8e2f2] bg-white text-[0px] disabled:opacity-40"
                title="Voice reply"
              >
                <Icon name="speaker" />
              </button>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={text.askPlaceholder}
                className="h-12 min-w-0 flex-1 basis-full rounded-[15px] border border-[#e8e2f2] px-4 outline-none disabled:bg-[#f6f4fb] disabled:text-[#675f79] md:basis-auto"
              />
                <button
                  type="submit"
                  disabled={isSending || input.trim().length === 0}
                  className="h-12 rounded-[15px] bg-[#ffdf00] px-6 text-sm font-black text-[#1a0f2e] disabled:opacity-50"
                >
                  {isSending ? text.sending : text.send}
                </button>
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
              <div className="mt-4 grid gap-2">
                <input
                  value={checkoutDetails.recipientName}
                  onChange={(event) =>
                    setCheckoutDetails((current) => ({
                      ...current,
                      recipientName: event.target.value,
                    }))
                  }
                  placeholder={text.recipientName}
                  className="h-10 rounded-[11px] border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/65"
                />
                <input
                  value={checkoutDetails.recipientPhone}
                  onChange={(event) =>
                    setCheckoutDetails((current) => ({
                      ...current,
                      recipientPhone: event.target.value,
                    }))
                  }
                  placeholder={text.recipientPhone}
                  className="h-10 rounded-[11px] border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/65"
                />
                <input
                  value={checkoutDetails.address}
                  onChange={(event) =>
                    setCheckoutDetails((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  placeholder={text.checkout}
                  className="h-10 rounded-[11px] border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/65"
                />
                <input
                  value={profile.city}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                  placeholder={text.city}
                  className="h-10 rounded-[11px] border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/65"
                />
                <input
                  type="date"
                  value={profile.date}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  className="h-10 rounded-[11px] border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/65"
                />
                <input
                  value={checkoutDetails.senderName}
                  onChange={(event) =>
                    setCheckoutDetails((current) => ({
                      ...current,
                      senderName: event.target.value,
                    }))
                  }
                  placeholder={text.senderName}
                  className="h-10 rounded-[11px] border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/65"
                />
                <textarea
                  value={checkoutDetails.instructions}
                  onChange={(event) =>
                    setCheckoutDetails((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                  placeholder={text.deliveryInstructions}
                  rows={2}
                  className="resize-none rounded-[11px] border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/65"
                />
                <textarea
                  value={giftMessage}
                  onChange={(event) => setGiftMessage(event.target.value)}
                  placeholder={text.giftMessageLabel}
                  rows={3}
                  className="resize-none rounded-[11px] border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/65"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCreateOrderLink()}
                className="mt-4 h-12 w-full rounded-[14px] bg-[#ffdf00] text-sm font-black text-[#1a0f2e]"
              >
                {text.createOrderLink}
              </button>
              {checkoutUrl ? (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 grid h-11 place-items-center rounded-[14px] border border-white/20 text-sm font-black text-white"
                >
                  {text.openCheckout}
                </a>
              ) : null}
            </div>
            </div>

          </aside>
        </div>
      </section>
    </main>
  );
}
