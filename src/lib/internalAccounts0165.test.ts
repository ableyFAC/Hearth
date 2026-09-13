import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Migration 0165 (internal / test accounts) can't be exercised from a unit
// test: it is two columns, two SECURITY DEFINER helpers, one RLS policy, three
// triggers and nine re-created objects, all of which only exist inside
// Postgres. Same approach and the same limits as
// src/lib/proLeadDiscount0149.test.ts and src/lib/hardening0132.test.ts:
// reading the SQL as text pins the shape - the columns, the locked-list entry,
// the predicate in every read path, the guard in every money function, and
// that the grant posture is "grant nothing" - but it is not a substitute for
// running it against the live database. See the migration's own VERIFY section
// and docs/INTERNAL-ACCOUNTS.md for the queries that do that.
//
// CRLF: this repo checks out with CRLF line endings (core.autocrlf=true), so
// every multi-line assertion here compares against NORMALISED text. Single-
// line toContain() calls are unaffected either way.

const repoFile = (rel: string) =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));

const read = (rel: string) =>
  readFileSync(repoFile(rel), "utf8").replace(/\r\n/g, "\n");

const MIGRATION = "supabase/migrations/0165_internal_accounts.sql";
const PASTE_ME = "supabase/PASTE-ME-0165-internal-accounts-2026-09-12.sql";

const sql = read(MIGRATION);
const paste = read(PASTE_ME);

// Both files must carry every rule: the migration is the record, the PASTE-ME
// is what actually reaches the live database.
const BOTH = [
  ["0165", sql],
  ["PASTE-ME", paste],
] as const;

// The text of one function, from its CREATE to its closing $$;.
function bodyOf(text: string, name: string, marker = "$$;"): string {
  const start = text.indexOf(`function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = text.indexOf(marker, start);
  expect(end, name).toBeGreaterThan(start);
  return text.slice(start, end);
}

// The predicate every contractor-facing read path uses, and the one every
// lead-facing read path uses. Exactly two shapes across the whole migration -
// if a third appears, someone has hand-rolled a variant and it needs review.
const CONTRACTOR_PREDICATE =
  "coalesce(c.is_internal, false) = public.is_internal_user(auth.uid())";
const LEAD_PREDICATE =
  "public.is_internal_user(pr.user_id) = public.is_internal_user(auth.uid())";

describe("migration 0165: the columns", () => {
  it("adds is_internal to both tables, not null, defaulting to false", () => {
    for (const [name, text] of BOTH) {
      expect(text, name).toContain(
        "alter table public.users\n  add column if not exists is_internal boolean not null default false;"
      );
      expect(text, name).toContain(
        "alter table public.contractors\n  add column if not exists is_internal boolean not null default false;"
      );
    }
  });

  it("indexes both partially, so each holds only the internal rows", () => {
    for (const [name, text] of BOTH) {
      expect(text, name).toContain("create index if not exists users_is_internal_idx");
      expect(text, name).toContain(
        "create index if not exists contractors_is_internal_idx"
      );
      // `where is_internal`, twice - one per index.
      expect(text.match(/^\s+where is_internal;$/gm)?.length, name).toBe(2);
    }
  });

  // The control the whole feature rests on. An account that could clear its
  // own flag would walk straight back into the real marketplace, so NOTHING is
  // granted on either column - contractors.is_internal is private purely
  // because 0069/0085 revoked the table-level privileges, and users.is_internal
  // is guarded by 0139's trigger instead.
  it("grants nothing on either new column", () => {
    for (const [name, text] of BOTH) {
      expect(text, name).not.toMatch(/grant\s+select\s*\([^)]*is_internal/i);
      expect(text, name).not.toMatch(/grant\s+update\s*\([^)]*is_internal/i);
      expect(text, name).not.toMatch(/grant\s+insert\s*\([^)]*is_internal/i);
      expect(text, name).not.toMatch(
        /grant\s+(select|insert|update|all)[^;]*on\s+public\.(users|contractors)\s+to/i
      );
    }
  });
});

describe("migration 0165: users.is_internal is service-role only", () => {
  it("joins 0139's LOCKED list", () => {
    for (const [name, text] of BOTH) {
      const body = bodyOf(text, "enforce_users_column_lock", "\n$$;");
      expect(body, name).toContain("    'is_internal'\n  ];");
    }
  });

  it("keeps every entry 0139 already locked", () => {
    const body = bodyOf(sql, "enforce_users_column_lock", "\n$$;");
    for (const col of [
      "id",
      "email",
      "created_at",
      "free_doc_reads_used",
      "free_inspection_reads_used",
      "free_quote_used_at",
      "free_plan_used_at",
      "sms_consent",
      "sms_consent_at",
      "referral_code",
      "referred_by",
    ]) {
      expect(body, col).toContain(`'${col}',`);
    }
  });

  it("keeps 0139's service-role escape hatch and its 42501 raise", () => {
    const body = bodyOf(sql, "enforce_users_column_lock", "\n$$;");
    expect(body).toContain("if v_role = 'service_role'");
    expect(body).toContain(
      "or current_user in ('service_role', 'postgres', 'supabase_admin',"
    );
    expect(body).toContain("using errcode = '42501';");
    // The trigger itself must be re-armed, or re-creating the function guards
    // nothing.
    expect(sql).toContain("drop trigger if exists users_column_lock on public.users;");
    expect(sql).toContain("  before update on public.users");
  });
});

describe("migration 0165: the helpers", () => {
  it("are security definer, stable, search_path-pinned and coalesce to false", () => {
    for (const fn of ["is_internal_user", "is_internal_contractor"]) {
      const body = bodyOf(sql, fn, "\n$$;");
      expect(body, fn).toContain("security definer");
      expect(body, fn).toContain("stable");
      expect(body, fn).toContain("set search_path = public");
      // A missing row (and a null argument, i.e. an anonymous caller) must
      // read as NOT internal - that is what keeps the public pages showing
      // real pros only.
      expect(body, fn).toContain("  select coalesce(");
      expect(body, fn).toContain("    false\n  );");
    }
  });

  it("strip the default PUBLIC execute grant before granting authenticated", () => {
    // 0123's lesson: revoking from anon alone leaves the PUBLIC grant standing.
    for (const [name, text] of BOTH) {
      expect(text, name).toContain(
        "revoke execute on function public.is_internal_user(uuid) from public;"
      );
      expect(text, name).toContain(
        "revoke execute on function public.is_internal_contractor(uuid) from public;"
      );
      expect(text, name).toContain(
        "grant execute on function public.is_internal_user(uuid) to authenticated;"
      );
      expect(text, name).not.toContain(
        "grant execute on function public.is_internal_user(uuid) to anon;"
      );
    }
  });
});

describe("migration 0165: contractors.is_internal follows the owning user", () => {
  it("stamps a new contractors row on INSERT", () => {
    expect(sql).toContain(
      "drop trigger if exists contractors_internal_follows_user on public.contractors;"
    );
    expect(sql).toContain("  before insert on public.contractors");
    const body = bodyOf(sql, "contractors_set_internal_from_user", "\n$$;");
    expect(body).toContain("new.is_internal := public.is_internal_user(new.user_id);");
    expect(body).toContain("security definer");
  });

  it("propagates a flip on users.is_internal to that account's contractors rows", () => {
    expect(sql).toContain(
      "drop trigger if exists users_internal_propagates on public.users;"
    );
    expect(sql).toContain("  after update of is_internal on public.users");
    const body = bodyOf(sql, "users_propagate_internal", "\n$$;");
    expect(body).toContain("update public.contractors");
    expect(body).toContain("set is_internal = new.is_internal");
    expect(body).toContain("where user_id = new.id");
  });
});

describe("migration 0165: every read path carries the predicate", () => {
  it("open_jobs_for_me matches the lead owner's flag against the caller's", () => {
    for (const [name, text] of BOTH) {
      const body = bodyOf(text, "open_jobs_for_me", "\n  limit 200;");
      expect(body, name).toContain(`and ${LEAD_PREDICATE}`);
    }
  });

  it("my_direct_requests carries the same lead predicate", () => {
    for (const [name, text] of BOTH) {
      const body = bodyOf(text, "my_direct_requests", "\n  limit 200;");
      expect(body, name).toContain(`and ${LEAD_PREDICATE}`);
    }
  });

  it("browse_pros, public_pro_profile and contractor_reviews carry the contractor predicate", () => {
    for (const [name, text] of BOTH) {
      expect(bodyOf(text, "browse_pros", "\n  limit 200;"), name).toContain(
        `and ${CONTRACTOR_PREDICATE}`
      );
      expect(bodyOf(text, "public_pro_profile", "\n$$;"), name).toContain(
        `and ${CONTRACTOR_PREDICATE};`
      );
      expect(bodyOf(text, "contractor_reviews", "\n  limit 100;"), name).toContain(
        `and ${CONTRACTOR_PREDICATE}`
      );
    }
  });

  // The one surface that is a policy rather than a function. The first arm -
  // the pro reading their OWN row - must stay untouched, or an internal pro
  // gets bounced to /pro/onboarding on every page load.
  it("the contractors read policy narrows only the related-to-me arm", () => {
    for (const [name, text] of BOTH) {
      expect(text, name).toContain(
        'drop policy if exists "contractors read" on public.contractors;'
      );
      expect(text, name).toContain(
        [
          "  using (",
          "    user_id = auth.uid()",
          "    or (",
          "      public.contractor_related_to_me(id)",
          "      and coalesce(is_internal, false) = public.is_internal_user(auth.uid())",
          "    )",
          "  );",
        ].join("\n")
      );
    }
  });

  it("keeps every pre-existing gate in the read paths it re-created", () => {
    // A re-create that quietly dropped one of these would be the real danger
    // of this migration, so each function is spot-checked for the guard its
    // own source migration added.
    const board = bodyOf(sql, "open_jobs_for_me", "\n  limit 200;");
    expect(board).toContain("and pr.user_id is distinct from auth.uid()"); // 0161
    expect(board).toContain("and c.serves_orange_county = true"); // 0076
    expect(board).toContain(
      "and public.launch_city_for_zip(pr.zip) = any (c.launch_cities)"
    ); // 0124
    expect(board).toContain("from user_blocks b"); // 0138
    expect(board).toContain("homeowner_display"); // 0155

    const profile = bodyOf(sql, "public_pro_profile", "\n$$;");
    expect(profile).toContain("'banner_url',   c.banner_url,"); // 0155
    expect(profile).toContain("'owner_name',   c.owner_name,"); // 0141
    expect(profile).toContain("'about',        case when m.live then c.about end,");
    expect(profile).toContain("and coalesce(c.serves_orange_county, false)");
  });
});

describe("migration 0165: every money function carries the guard", () => {
  // Placement is the load-bearing part: a refused pairing must move no money.
  it("apply_to_lead refuses before any wallet read or write", () => {
    for (const [name, text] of BOTH) {
      const body = bodyOf(text, "apply_to_lead", "\nend; $$;");
      expect(body, name).toContain(
        [
          "  if public.is_internal_user(v_owner)",
          "     is distinct from public.is_internal_contractor(v_contractor) then",
          "    raise exception 'This job is not available to you.'",
          "      using hint = 'internal_account';",
          "  end if;",
        ].join("\n")
      );
      const guard = body.indexOf("is_internal_contractor(v_contractor)");
      const wallet = body.indexOf("get_or_create_wallet(v_contractor)");
      const insert = body.indexOf("insert into lead_applications");
      expect(guard, name).toBeGreaterThan(-1);
      expect(guard, name).toBeLessThan(wallet);
      expect(guard, name).toBeLessThan(insert);
    }
  });

  it("unlock_direct_request refuses before get_or_create_wallet", () => {
    for (const [name, text] of BOTH) {
      const body = bodyOf(text, "unlock_direct_request", "\nend; $$;");
      expect(body, name).toContain("using hint = 'internal_account';");
      expect(body, name).toContain("  v_owner uuid;");
      const guard = body.indexOf("is_internal_contractor(v_contractor)");
      const wallet = body.indexOf("get_or_create_wallet(v_contractor)");
      expect(guard, name).toBeGreaterThan(-1);
      expect(guard, name).toBeLessThan(wallet);
    }
  });

  it("choose_applicant refuses before the lead is locked and before any write", () => {
    for (const [name, text] of BOTH) {
      const body = bodyOf(text, "choose_applicant", "\nend; $$;");
      expect(body, name).toContain(
        [
          "  if public.is_internal_user(auth.uid())",
          "     is distinct from public.is_internal_contractor(v_contractor) then",
          "    raise exception 'That pro is not available for this job.'",
          "      using hint = 'internal_account';",
          "  end if;",
        ].join("\n")
      );
      const guard = body.indexOf("is_internal_contractor(v_contractor)");
      const lock = body.indexOf("from contractor_leads where id = v_lead for update;");
      const write = body.indexOf("update contractor_leads\n     set contractor_id");
      expect(guard, name).toBeGreaterThan(-1);
      expect(guard, name).toBeLessThan(lock);
      expect(guard, name).toBeLessThan(write);
    }
  });

  it("keeps every pre-existing money gate it re-created", () => {
    const apply = bodyOf(sql, "apply_to_lead", "\nend; $$;");
    expect(apply).toContain("raise exception 'You cannot apply to your own job.';"); // 0161
    expect(apply).toContain("raise exception 'Insurance required for big jobs';"); // 0153
    expect(apply).toContain("public.has_open_chargeback(v_contractor)"); // 0132
    expect(apply).toContain("public.blocked_between(auth.uid(), v_owner)"); // 0138
    expect(apply).toContain("raise exception 'Job is full';");
    expect(apply).toContain("v_discount_kind"); // 0149

    const unlock = bodyOf(sql, "unlock_direct_request", "\nend; $$;");
    expect(unlock).toContain("raise exception 'Insurance required for big jobs';");
    expect(unlock).toContain("perform set_config('hearth.lead_write', 'on', true);");

    const choose = bodyOf(sql, "choose_applicant", "\nend; $$;");
    expect(choose).toContain("'apply_credit_back'"); // 0107
    expect(choose).toContain("'first_apply_guarantee'"); // 0041 double-refund guard
    expect(choose).toContain("raise exception 'This job has already been assigned';");
  });

  // The message must not be usable to probe which accounts are internal, so it
  // is the same vague wording blocking already uses; the machine marker rides
  // in HINT instead.
  it("says nothing about why, and puts the marker in HINT", () => {
    expect(sql).not.toMatch(/raise exception '[^']*internal[^']*'/i);
    expect(sql.match(/using hint = 'internal_account';/g)?.length).toBe(3);
  });
});

describe("migration 0165: the precheck refuses a database that is behind", () => {
  it("fingerprints each latest body before replacing it", () => {
    for (const [name, text] of BOTH) {
      expect(text, name).toContain("%pr.user_id is distinct from auth.uid()%"); // 0161
      expect(text, name).toContain("%You cannot apply to your own job.%"); // 0161
      expect(text, name).toContain("%Insurance required for big jobs%"); // 0153
      expect(text, name).toContain("%banner_url%"); // 0155
      expect(text, name).toContain("proname = 'enforce_users_column_lock'"); // 0139
    }
  });

  it("the PASTE-ME refuses to run out of order and re-checks the column locks", () => {
    expect(paste).toContain("contractors_stripe_account_id_uidx"); // 0164 must be in
    expect(paste).toContain("from information_schema.table_privileges");
    expect(paste).toContain("and grantee in ('authenticated', 'anon')");
    expect(paste).toContain("tgname = 'users_column_lock'");
  });

  it("the PASTE-ME ends with a verbatim copy of the migration", () => {
    expect(paste.endsWith(sql)).toBe(true);
  });
});

describe("0165 app side: the admin-client surfaces filter explicitly", () => {
  // RLS and the RPCs cover every SESSION-client read. These three read through
  // the service-role admin client, which bypasses RLS and never sees the
  // policy or the RPC predicates, so each one has to filter by hand.
  it("the sitemap excludes internal pros, with a pre-0165 retry", () => {
    const src = read("src/app/sitemap.ts");
    expect(src).toContain('.eq("is_internal", false)');
    expect(src).toContain("isMissingSchemaError");
    // The retry must drop the filter rather than the whole pro section, or a
    // pre-0165 database publishes a sitemap with no /p/ pages in it at all.
    expect(src).toContain("if (error && isMissingSchemaError(error)) {");
  });

  it("the new-lead fan-out matches the pro's flag against the poster's", () => {
    const src = read("src/lib/proAlerts.ts");
    expect(src).toContain('import { isInternalUser } from "@/lib/internalAccounts";');
    expect(src).toContain(
      "const posterIsInternal = await isInternalUser(lead.posterUserId ?? null);"
    );
    expect(src).toContain("(c) => Boolean(c.is_internal) === posterIsInternal");
    // The column has to be selected, and the pre-0165 retry has to survive.
    expect(src).toContain("launch_cities, is_internal");
  });

  it("requestProAction refuses a cross-internal direct request", () => {
    const src = read("src/app/(app)/contractors/actions.ts");
    expect(src).toContain("isInternalUser(user.id)");
    expect(src).toContain("isInternalContractor(pro.id)");
    expect(src).toContain("if (homeownerIsInternal !== proIsInternal) {");
    // Deliberately the SAME message the block check returns, so it cannot be
    // used to tell a block apart from a test account.
    expect(
      src.match(/That pro isn't available for direct requests right now\./g)?.length
    ).toBeGreaterThanOrEqual(3);
  });

  it("both new-lead nudges apply the same pairing rule", () => {
    const src = read("src/app/(app)/contractors/actions.ts");
    expect(
      src.match(
        /if \(internalMatches\.has\(match\.user_id\) !== posterIsInternal\) return \[\];/g
      )?.length
    ).toBe(2);
  });
});
