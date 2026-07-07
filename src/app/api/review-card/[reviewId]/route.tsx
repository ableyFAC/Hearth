import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";

export const runtime = "nodejs";

// Review share card: an image a pro can post when a homeowner leaves them a
// strong review. Modeled directly on src/app/api/win-card/[leadId]/route.tsx:
// same 1200x630 size, same warm hearth palette, same "no more homeowner data
// than the win card already shows" rule. The only homeowner detail here is a
// first name (never a last name, never an address or city), read off
// contractor_leads.homeowner_name - the same contact snapshot column the win
// card's ownership check reads from, never the homeowner's account name.
//
// Ratings below 4 never render: a pro sharing a 2-star review makes no sense,
// so anything under 4 stars 404s exactly like an unowned or missing review.

const size = { width: 1200, height: 630 };

// Warm hearth palette (tailwind.config.ts), copied from win-card so both
// share cards read as the same product.
const HEARTH_50 = "#fbf7f2";
const HEARTH_100 = "#f3e9dd";
const HEARTH_500 = "#a9743f";
const HEARTH_700 = "#73482b";
const HEARTH_900 = "#4f3324";
const STONE_300 = "#d6d3d1";
const AMBER_500 = "#f59e0b";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill={filled ? AMBER_500 : STONE_300}
    >
      <path d="M12 2l2.9 6.26 6.85.79-5.07 4.67 1.35 6.77L12 17.1l-6.03 3.39 1.35-6.77-5.07-4.67 6.85-.79L12 2z" />
    </svg>
  );
}

function Wordmark() {
  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        right: 64,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 9999,
          backgroundColor: HEARTH_500,
        }}
      />
      <div style={{ fontSize: 34, fontWeight: 700, color: HEARTH_700 }}>
        Hearth
      </div>
    </div>
  );
}

// First name only: split on whitespace and keep the first token. A blank or
// missing name (an older lead, or contact fields left empty) degrades to a
// generic, still-honest label rather than guessing at a name.
function firstNameOnly(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "A happy customer";
  return trimmed.split(/\s+/)[0];
}

// First ~140 characters of the review comment, cut cleanly and marked with an
// ellipsis so the card never reads as if it were the whole review. Slicing by
// code POINT (Array.from), not code unit: a .slice() at a raw string index can
// split an emoji's surrogate pair in half, which corrupts the rendered card.
function excerpt(comment: string | null, max = 140): string | null {
  const trimmed = (comment ?? "").trim();
  if (!trimmed) return null;
  const points = Array.from(trimmed);
  if (points.length <= max) return trimmed;
  return `${points.slice(0, max).join("").trimEnd()}…`;
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { reviewId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contractor = await getCurrentContractor();
  if (!contractor) {
    return NextResponse.json({ error: "Not a contractor" }, { status: 403 });
  }

  const { data: review } = await supabase
    .from("reviews")
    .select("id, lead_id, contractor_id, rating, comment")
    .eq("id", params.reviewId)
    .maybeSingle();

  if (!review) return notFound();
  // Ownership: only the contractor this review is about can render its card.
  // reviews RLS already limits reads this way, but the check is repeated here
  // explicitly (same pattern as win-card) rather than trusted implicitly.
  if (review.contractor_id !== contractor.id) return notFound();
  // Only 4 and 5 star reviews get a share card at all.
  if (review.rating < 4) return notFound();

  // The reviewer's first name comes off the lead's snapshot contact field,
  // never the homeowner's account: reviews carries no name of its own.
  const { data: leadRow } = await supabase
    .from("contractor_leads")
    .select("homeowner_name")
    .eq("id", review.lead_id)
    .maybeSingle();
  const reviewerFirstName = firstNameOnly(leadRow?.homeowner_name);
  const reviewExcerpt = excerpt(review.comment);

  // logo_url and slug are 0033/0043 columns not present in the generated
  // Contractor type (database.types.ts is not regenerated here), so they are
  // read off an any cast, same pattern as win-card and PublicPageCard.tsx.
  const extra = contractor as any;
  const logoUrl: string | null = extra.logo_url ?? null;
  const slug: string | null = extra.slug ?? null;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const publicPageUrl = `${site}/p/${slug ?? contractor.id}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 80px",
          background: `linear-gradient(135deg, ${HEARTH_100} 0%, ${HEARTH_50} 55%, #ffffff 100%)`,
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <Wordmark />

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              width={84}
              height={84}
              style={{ borderRadius: 16, objectFit: "cover" }}
            />
          )}
          <div
            style={{
              fontSize: contractor.name.length > 28 ? 46 : 56,
              fontWeight: 700,
              color: HEARTH_900,
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            {contractor.name}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 28 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} filled={i < review.rating} />
          ))}
        </div>

        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: HEARTH_700,
            marginTop: 16,
          }}
        >
          {review.rating}-star review on Hearth
        </div>

        {reviewExcerpt && (
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: HEARTH_900,
              lineHeight: 1.3,
              marginTop: 28,
              maxWidth: 1000,
              wordBreak: "break-word",
            }}
          >
            &ldquo;{reviewExcerpt}&rdquo;
          </div>
        )}

        <div
          style={{
            fontSize: 30,
            color: HEARTH_700,
            fontWeight: 600,
            marginTop: 24,
          }}
        >
          - {reviewerFirstName}
        </div>

        <div style={{ fontSize: 28, color: HEARTH_700, marginTop: 40 }}>
          {publicPageUrl}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 14,
            backgroundColor: HEARTH_500,
          }}
        />
      </div>
    ),
    size
  );
}
