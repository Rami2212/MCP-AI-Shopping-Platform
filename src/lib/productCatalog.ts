export type Product = {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  price: number;
  currency: string;
  stock: number;
  stockLabel: string;
  eta: string;
  description: string;
  url: string;
};

export type KaprukaSearchProduct = {
  id?: unknown;
  name?: unknown;
  summary?: unknown;
  price?: unknown;
  in_stock?: unknown;
  stock_level?: unknown;
  image_url?: unknown;
  category?: unknown;
  url?: unknown;
};

const FALLBACK_PRODUCT_IMAGE = "/product-images/gift-box.svg";

export const starterProducts: Product[] = [
  {
    id: "starter-chocolate-hamper",
    name: "Chocolate Gift Hamper",
    imageUrl: "/product-images/chocolate-hamper.svg",
    category: "Food",
    price: 4500,
    currency: "LKR",
    stock: 1,
    stockLabel: "In stock",
    eta: "Delivery checked by Kapruka MCP",
    description: "A ready-to-gift chocolate selection for birthdays and thanks.",
    url: "https://www.kapruka.com",
  },
  {
    id: "starter-rose-bouquet",
    name: "Rose Bouquet",
    imageUrl: "/product-images/rose-bouquet.svg",
    category: "Flowers",
    price: 6200,
    currency: "LKR",
    stock: 1,
    stockLabel: "In stock",
    eta: "Delivery checked by Kapruka MCP",
    description: "Fresh roses for romantic, anniversary, and celebration moments.",
    url: "https://www.kapruka.com",
  },
  {
    id: "starter-perfume-set",
    name: "Perfume Gift Set",
    imageUrl: "/product-images/perfume-set.svg",
    category: "Perfumes",
    price: 9500,
    currency: "LKR",
    stock: 1,
    stockLabel: "In stock",
    eta: "Delivery checked by Kapruka MCP",
    description: "A premium fragrance pick when the recipient likes personal gifts.",
    url: "https://www.kapruka.com",
  },
  {
    id: "starter-chocolate-cake",
    name: "Chocolate Celebration Cake",
    imageUrl: "/product-images/chocolate-cake.svg",
    category: "Bakery",
    price: 3900,
    currency: "LKR",
    stock: 1,
    stockLabel: "In stock",
    eta: "Delivery checked by Kapruka MCP",
    description: "A classic cake option for birthdays, office treats, and family events.",
    url: "https://www.kapruka.com",
  },
  {
    id: "starter-watch",
    name: "Elegant Watch",
    imageUrl: "/product-images/watch.svg",
    category: "Fashion",
    price: 7800,
    currency: "LKR",
    stock: 1,
    stockLabel: "In stock",
    eta: "Delivery checked by Kapruka MCP",
    description: "A polished everyday accessory for fashion-forward gifting.",
    url: "https://www.kapruka.com",
  },
  {
    id: "starter-party-pack",
    name: "Birthday Party Pack",
    imageUrl: "/product-images/party-pack.svg",
    category: "Events",
    price: 5200,
    currency: "LKR",
    stock: 1,
    stockLabel: "In stock",
    eta: "Delivery checked by Kapruka MCP",
    description: "A practical party bundle for quick celebration planning.",
    url: "https://www.kapruka.com",
  },
];

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getCategoryName(value: unknown) {
  const category = getRecord(value);
  return getString(category?.name) ?? "Kapruka";
}

function getPrice(value: unknown) {
  const price = getRecord(value);
  return {
    amount: getNumber(price?.amount) ?? 0,
    currency: getString(price?.currency) ?? "LKR",
  };
}

function getStockLabel(product: KaprukaSearchProduct) {
  const inStock = product.in_stock === true;
  const stockLevel = getString(product.stock_level);

  if (!inStock) {
    return "Out of stock";
  }

  return stockLevel ? `In stock (${stockLevel})` : "In stock";
}

export function toProduct(product: KaprukaSearchProduct): Product | null {
  const id = getString(product.id);
  const name = getString(product.name);

  if (!id || !name) {
    return null;
  }

  const price = getPrice(product.price);

  return {
    id,
    name,
    imageUrl: getString(product.image_url) ?? FALLBACK_PRODUCT_IMAGE,
    category: getCategoryName(product.category),
    price: price.amount,
    currency: price.currency,
    stock: product.in_stock === true ? 1 : 0,
    stockLabel: getStockLabel(product),
    eta: "Delivery checked by Kapruka MCP",
    description: getString(product.summary) ?? "Live Kapruka catalog item.",
    url: getString(product.url) ?? "https://www.kapruka.com",
  };
}

export function formatPrice(value: number, currency = "LKR") {
  const safeValue = Number.isFinite(value) ? value : 0;

  if (currency === "LKR") {
    return `Rs. ${safeValue.toLocaleString("en-US")}`;
  }

  return `${currency} ${safeValue.toLocaleString("en-US")}`;
}
