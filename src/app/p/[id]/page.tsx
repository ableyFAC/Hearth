import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JOB_CATEGORIES, labelFor, iconFor } from "@/lib/constants";

// Public, shareable business page for a pro: /p/<contractor_id> or, once
// migration 0043 lands, /p/<slug>. No account needed. Data comes from the
// public_pro_profile RPC (0033, extended with 'slug' in 0043), which returns
// only safe fields: name, categories, the REAL rating/reviews (same math and
// ordering as everywhere else, membership never touches them), and, for Pro
// members, logo + about + "on file" booleans. Never contact info.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type PublicReview = {
  rating: number;
  comment: string | null;
  created_at: string;
};

type PublicProjectPhoto = {
  url: string;
  // Already gated in the RPC: collapses to false unless the pro is a member,
  // same m.live gate as logo/about.
  is_before: boolean;
};

type PublicProject = {
  title: string;
  category: string | null;
  description: string | null;
  months: string | null;
  photos: PublicProjectPhoto[];
};

type PublicProfile = {
  id: string;
  // Optional: absent until migration 0043 runs (0033's payload has no slug).
  slug?: string | null;
  name: string;
  categories: string[];
  created_at: string;
  rating: number | null;
  review_count: number;
  member: boolean;
  logo_url: string | null;
  about: string | null;
  has_license: boolean;
  has_insurance: boolean;
  // Optional: absent until migration 0055 runs. Real CSLB verification
  // timestamp, only ever set on an actually-confirmed license (0055) - never
  // gated behind Pro membership, unlike has_license/has_insurance above.
  license_verified_at?: string | null;
  // Optional: absent until migration 0057 runs. Real Checkr background
  // check timestamp, only ever set on a 'clear' result (0057) - never gated
  // behind Pro membership, same reasoning as license_verified_at. A
  // 'consider' or in-progress check is never exposed here at all: it is
  // indistinguishable from having never started one.
  background_checked_at?: string | null;
  reviews: PublicReview[];
  // Optional: absent until migration 0045 runs (older payloads have no
  // projects key).
  projects?: PublicProject[];
};

// cache(): generateMetadata and the page body both call this, so per-request
// memoization keeps it at one RPC round-trip (same pattern as subscription.ts).
const loadProfile = cache(
  async (
    id: string
  ): Promise<{ profile: PublicProfile | null; unavailable: boolean }> => {
    const supabase = createClient();
    // Cast: the generated types don't know this RPC (database.types.ts is not
    // regenerated here).
    const { data, error } = await (supabase.rpc as any)("public_pro_profile", {
      p_contractor: id,
    });
    // A missing function (migration 0033 not applied yet) must degrade to a
    // soft "not ready" page, never a crash.
    if (error) return { profile: null, unavailable: true };
    return {
      profile: (data as PublicProfile | null) ?? null,
      unavailable: false,
    };
  }
);

// The [id] segment accepts BOTH a raw contractor UUID and a slug (0043).
// UUID-shaped params skip the lookup entirely, so UUID URLs keep working even
// before the slug migration runs. Non-UUID params resolve through the
// public_pro_id_for_slug RPC; if that function doesn't exist yet (pre-0043),
// slug URLs soft-fail to the "not ready" card instead of crashing.
const resolveContractorId = cache(
  async (
    param: string
  ): Promise<{ id: string | null; unavailable: boolean }> => {
    if (UUID_RE.test(param)) return { id: param, unavailable: false };
    const supabase = createClient();
    // Cast: the generated types don't know this RPC (database.types.ts is not
    // regenerated here).
    const { data, error } = await (supabase.rpc as any)(
      "public_pro_id_for_slug",
      { p_slug: param }
    );
    if (error) return { id: null, unavailable: true };
    return { id: (data as string | null) ?? null, unavailable: false };
  }
);

// Canonical path prefers the slug form once the profile has one; the UUID
// form stays valid but points search engines at the single slug URL.
function canonicalPath(profile: PublicProfile): string {
  return `/p/${profile.slug ?? profile.id}`;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = await resolveContractorId(params.id);
  if (!id) return { title: "Hearth" };
  const { profile } = await loadProfile(id);
  if (!profile) return { title: "Hearth" };

  const title = `${profile.name} on Hearth`;
  const description =
    profile.review_count > 0 && profile.rating != null
      ? `${profile.name} is rated ${profile.rating} from ${profile.review_count} verified review${profile.review_count === 1 ? "" : "s"} on Hearth. See reviews and services.`
      : `Reviews and services for ${profile.name}, a home service pro on Hearth.`;
  const url = `${SITE_URL}${canonicalPath(profile)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Hearth",
      type: "website",
      // og:image comes from the colocated opengraph-image.tsx route; Next
      // wires it up automatically for this segment.
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// JSON-LD for Google review-star rich results. Hearth hosts third-party
// reviews, so LocalBusiness + AggregateRating markup is eligible (a pro's own
// site would not be). Every number mirrors the page render EXACTLY: same
// rating value, same review_count, same per-review ratings and dates, in the
// same order. The RPC exposes no address fields and no reviewer names, so we
// emit neither (authors become a generic label rather than invented names).
function buildJsonLd(profile: PublicProfile): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: profile.name,
    url: `${SITE_URL}${canonicalPath(profile)}`,
  };
  if (profile.review_count > 0 && profile.rating != null) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: profile.rating,
      reviewCount: profile.review_count,
      bestRating: 5,
      worstRating: 1,
    };
    jsonLd.review = profile.reviews.slice(0, 10).map((r) => ({
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      // Same YYYY-MM-DD the page renders next to each review.
      datePublished: r.created_at.slice(0, 10),
      // The RPC intentionally exposes no reviewer identity.
      author: { "@type": "Person", name: "Verified Hearth homeowner" },
      ...(r.comment ? { reviewBody: r.comment } : {}),
    }));
  }
  return jsonLd;
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="text-amber-500" aria-hidden>
      {"★".repeat(full)}
      <span className="text-stone-300">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function NotReadyCard() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="h-20 bg-gradient-to-br from-hearth-100 via-hearth-50 to-stone-100" />
        <div className="px-6 pb-8 pt-2">
          <p className="text-3xl" aria-hidden>
            🏡
          </p>
          <h1 className="mt-3 text-xl font-semibold text-stone-900">
            This page is not ready yet
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            The pro&apos;s public page is still being set up. Please check back
            soon.
          </p>
        </div>
      </div>
      <a
        href="/pros"
        className="mt-6 inline-block text-sm font-medium text-hearth-700 hover:underline"
      >
        Powered by Hearth
      </a>
    </main>
  );
}

export default async function PublicProPage({
  params,
}: {
  params: { id: string };
}) {
  const { id, unavailable: slugUnavailable } = await resolveContractorId(
    params.id
  );
  // Slug resolver RPC missing (pre-0043): soft-fail slug URLs only.
  if (slugUnavailable) return <NotReadyCard />;
  // Unknown slug: a real 404, not a soft state.
  if (!id) notFound();

  const { profile, unavailable } = await loadProfile(id);

  if (unavailable) return <NotReadyCard />;

  if (!profile) notFound();

  const hasRating = profile.review_count > 0 && profile.rating != null;
  const showBadge =
    profile.member && (profile.has_license || profile.has_insurance);
  const badgeLabel =
    profile.has_license && profile.has_insurance
      ? "License and insurance on file"
      : profile.has_license
        ? "License on file"
        : "Insurance on file";
  const about = profile.member ? (profile.about ?? "").trim() : "";
  // Guard: the RPC only includes 'projects' once migration 0045 has run, so
  // older payloads simply render no section.
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  // Real CSLB verification (0055): free feature, not gated behind Pro
  // membership like showBadge/badgeLabel above. A 'failed' or 'pending'
  // check is never shown publicly at all - this page only ever renders the
  // positive, confirmed case, straight off a real timestamp.
  const licenseVerifiedAt = profile.license_verified_at ?? null;
  const licenseVerifiedLabel = licenseVerifiedAt
    ? new Date(licenseVerifiedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  // Real Checkr background check (0057): same rules as license_verified_at
  // above - free feature, not gated on membership, and a 'consider' or
  // in-progress check is never shown publicly (indistinguishable from
  // 'none'). This page only ever renders the positive, confirmed case.
  const backgroundCheckedAt = profile.background_checked_at ?? null;
  const backgroundCheckedLabel = backgroundCheckedAt
    ? new Date(backgroundCheckedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-10">
      {/* Structured data for review-star rich results. "<" is escaped to its
          unicode form so review text can never close the script tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(profile)).replace(
            /</g,
            "\\u003c"
          ),
        }}
      />
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="h-20 bg-gradient-to-br from-hearth-100 via-hearth-50 to-stone-100" />
        <div className="px-6 pb-6">
          {/* Logo (Pro members) or a neutral monogram */}
          <div className="-mt-8 mb-4">
            {profile.member && profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.logo_url}
                alt={`${profile.name} logo`}
                className="h-16 w-16 rounded-2xl bg-white object-cover shadow-sm ring-2 ring-white"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-xl font-semibold text-stone-400 shadow-sm ring-2 ring-white">
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-stone-900">{profile.name}</h1>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {hasRating ? (
              <span className="font-medium text-stone-700">
                <Stars rating={profile.rating!} />{" "}
                <span className="tabular-nums">{profile.rating}</span>
                <span className="font-normal text-stone-400">
                  {" "}
                  · {profile.review_count} review
                  {profile.review_count === 1 ? "" : "s"}
                </span>
              </span>
            ) : (
              <span className="text-stone-400">No reviews yet</span>
            )}
          </div>

          {showBadge && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15l2 2 4-4" />
                </svg>
                {badgeLabel}
              </span>
              <p className="mt-1 text-[11px] text-stone-400">
                Details provided by the business. Not independently verified by
                Hearth.
              </p>
            </div>
          )}

          {(licenseVerifiedLabel || backgroundCheckedLabel) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {licenseVerifiedLabel && (
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    License verified
                  </span>
                  <p className="mt-1 text-[11px] text-stone-400">
                    Checked against the CSLB public database on {licenseVerifiedLabel}.
                  </p>
                </div>
              )}
              {backgroundCheckedLabel && (
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Background checked
                  </span>
                  <p className="mt-1 text-[11px] text-stone-400">
                    Background check run by Checkr on {backgroundCheckedLabel}.
                  </p>
                </div>
              )}
            </div>
          )}

          {profile.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs font-medium text-stone-600"
                >
                  {iconFor(JOB_CATEGORIES, c)} {labelFor(JOB_CATEGORIES, c)}
                </span>
              ))}
            </div>
          )}

          {about && (
            <section className="mt-5 border-t border-stone-100 pt-4">
              <h2 className="text-sm font-semibold text-stone-900">About</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-stone-600">
                {about}
              </p>
            </section>
          )}

          {/* Projects: the pro's own portfolio albums (0045). Deliberately a
              separate section from Reviews; nothing here feeds rating math. */}
          {projects.length > 0 && (
            <section className="mt-5 border-t border-stone-100 pt-4">
              <h2 className="text-sm font-semibold text-stone-900">
                Projects
              </h2>
              <p className="mt-0.5 text-[11px] text-stone-400">
                Photos provided by the business.
              </p>
              <ul className="mt-2 space-y-4">
                {projects.map((p, i) => {
                  // Before/After chips only make sense when a pair exists;
                  // for non-members the RPC collapses is_before to false, so
                  // free pros' photos show without badges.
                  const hasPair = p.photos.some((ph) => ph.is_before);
                  return (
                    <li
                      key={i}
                      className="rounded-xl border border-stone-100 bg-stone-50/50 p-3"
                    >
                      {p.photos.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto">
                          {p.photos.map((ph, j) => (
                            <div key={j} className="relative flex-none">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={ph.url}
                                alt={`${p.title} photo ${j + 1}`}
                                className="h-24 w-24 rounded-lg border border-stone-200 object-cover"
                              />
                              {hasPair && (
                                <span
                                  className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                    ph.is_before
                                      ? "bg-stone-900/70 text-white"
                                      : "bg-emerald-600/90 text-white"
                                  }`}
                                >
                                  {ph.is_before ? "Before" : "After"}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p
                        className={`text-sm font-medium text-stone-900 ${p.photos.length > 0 ? "mt-2" : ""}`}
                      >
                        {p.title}
                      </p>
                      {(p.category || p.months) && (
                        <p className="mt-0.5 text-xs text-stone-400">
                          {p.category
                            ? `${iconFor(JOB_CATEGORIES, p.category)} ${labelFor(JOB_CATEGORIES, p.category)}`
                            : ""}
                          {p.category && p.months ? " · " : ""}
                          {p.months ?? ""}
                        </p>
                      )}
                      {p.description && (
                        <p className="mt-1 whitespace-pre-line text-sm text-stone-600">
                          {p.description}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="mt-5 border-t border-stone-100 pt-4">
            <h2 className="text-sm font-semibold text-stone-900">
              Reviews
              {profile.review_count > 0 && (
                <span className="ml-1 font-normal text-stone-400">
                  ({profile.review_count})
                </span>
              )}
            </h2>
            {profile.reviews.length === 0 ? (
              <p className="mt-1 text-sm text-stone-400">
                No reviews yet. Reviews come from real Hearth jobs only.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-stone-100">
                {profile.reviews.map((r, i) => (
                  <li key={i} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">
                        <Stars rating={r.rating} />
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {r.created_at.slice(0, 10)}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="mt-1 text-sm text-stone-600">{r.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-stone-500">
        <a href="/pros" className="hover:text-hearth-700 hover:underline">
          <span aria-hidden>🏡</span> Powered by Hearth
        </a>
      </p>
    </main>
  );
}
