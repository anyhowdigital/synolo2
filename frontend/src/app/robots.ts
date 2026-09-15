import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/login", "/register", "/terms", "/privacy"], disallow: ["/api/", "/p/", "/print/", "/dashboard", "/invoices", "/customers", "/products", "/expenses", "/reports", "/settings", "/account", "/billing", "/mydata", "/quotes", "/recurring"] }],
  };
}
