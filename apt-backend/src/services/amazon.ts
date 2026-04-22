const SCRAPE_DO_TOKEN = process.env.SCRAPE_DO_TOKEN;
const BASE_URL = "https://api.scrape.do/plugin/amazon/pdp";

export interface AmazonProduct {
  asin: string;
  is_sponsored: boolean;
  brand: string;
  name: string;
  url: string;
  thumbnail: string;
  rating: number;
  total_ratings: number;
  price: number;
  list_price: number;
  currency: string;
  currency_symbol: string;
  is_prime: boolean;
  shipping_info: string[];
  more_buying_choices: {
    heading: string;
    offer_text: string;
    offer_link: string;
  };
  images: { url: string; width: number; height: number }[];
  best_seller_rankings: { category: string; rank: number }[];
  technical_details: Record<string, string>;
  status: string;
  errorMessage: string | null;
  html?: string;
}

export async function getProductDetails(
  asin: string,
  geocode: string = "us",
  zipcode: string = "10001",
  includeHtml: boolean = false
): Promise<AmazonProduct> {
  if (!SCRAPE_DO_TOKEN) {
    throw new Error("SCRAPE_DO_TOKEN environment variable is not set");
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("token", SCRAPE_DO_TOKEN);
  url.searchParams.set("asin", asin);
  url.searchParams.set("geocode", geocode.toUpperCase());
  url.searchParams.set("zipcode", zipcode);
  if (includeHtml) {
    url.searchParams.set("include_html", "true");
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Scrape.do API error: ${response.status} ${response.statusText}`);
  }

  const data: AmazonProduct = await response.json();

  if (data.status === "error") {
    throw new Error(data.errorMessage || "Unknown API error");
  }

  return data;
}
