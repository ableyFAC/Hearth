import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

// Sitemap for crawlers: the public landing pages plus every pro's public
// page (/p/..., anon-readable by design). The contractors table is NOT
// publicly readable, so the list comes from the service-role admin client;
// only id/slug ever leave the query, both of which are already public via
// the /p/ pages themselves. Slug URLs are preferred (0043); rows without a
// slug (pre-migration) fall back to their UUID URL.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/pros`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  try {
    const admin = createAdminClient();
    // Cast: the generated types predate the slug column (0043) and
    // database.types.ts is not regenerated here.
    const { data, error } = await (admin.from("contractors") as any)
      .select("id, slug")
      .order("created_at", { ascending: true })
      .limit(5000);
    if (!error && Array.isArray(data)) {
      for (const row of data as { id: string; slug: string | null }[]) {
        entries.push({
          url: `${SITE_URL}/p/${row.slug ?? row.id}`,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // Env/DB hiccup: still serve the static entries rather than 500 the
    // sitemap route.
  }

  return entries;
}
