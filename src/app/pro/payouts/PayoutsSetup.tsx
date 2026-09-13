"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/platform";
import {
  createAccountSessionAction,
  refreshPayoutStatusAction,
  startHostedPayoutOnboardingAction,
} from "./actions";

// The interactive half of /pro/payouts: the thing that actually collects bank
// details. Everything above it on the page (the heading, the status card, the
// requirement list) is server-rendered.
//
// TWO WAYS IN, AND THE SECOND ONE IS ALWAYS AVAILABLE:
//
//   1. EMBEDDED (the default on the web). Stripe's account-onboarding
//      component, rendered inside OakTend so the pro never leaves. It needs
//      connect.js from Stripe's CDN, the publishable key, and a fresh
//      AccountSession client secret per load.
//   2. HOSTED (always). A single-use account link to a page on Stripe. This
//      is the ONLY option inside the native app shell - a third-party script
//      driving an embedded iframe inside a Capacitor WebView is a bad bet on
//      a phone - and it is the fallback for every way the embedded path can
//      fail: no publishable key, connect.js refusing to load (an offline
//      pro, an ad blocker, a CSP that has not been updated), or the account
//      session erroring.
//
// So there is never a dead end: whatever goes wrong with 1, the button for 2
// is on screen. It also stays visible UNDER a working embedded component, as
// a quiet link, because some people simply prefer a full page.
//
// Nothing here ever sees a bank number. Stripe's component and Stripe's hosted
// page collect those directly; OakTend only ever learns the four booleans the
// webhook mirrors back.

type Loader = (typeof import("@stripe/connect-js"))["loadConnectAndInitialize"];

// The app's filled-CTA color (oak-600, tailwind.config.ts - the color
// .btn-primary paints), so Stripe's component does not land on the page in
// somebody else's blue.
const BRAND_PRIMARY = "#8a6a3c";

/** The plain "do it on Stripe instead" button. Also the whole UI on native. */
function HostedButton({ label }: { label: string }) {
  return (
    <form action={startHostedPayoutOnboardingAction}>
      <button type="submit" className="btn-primary text-sm">
        {label}
      </button>
    </form>
  );
}

export default function PayoutsSetup({
  ctaLabel,
}: {
  /** "Add where you get paid" / "Continue" / "Fix now", decided server-side. */
  ctaLabel: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Native app shell. Starts false on the server AND on the client's first
  // paint, flips in an effect after mount - the standard browser-only-API
  // pattern this repo already uses in PlanToggle.tsx, so the server HTML and
  // the first client render cannot disagree. A web visitor never moves it.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  // The connect.js instance, once it exists. `null` means "not yet"; `failed`
  // is the terminal state that drops us to the hosted button for good.
  const [connectInstance, setConnectInstance] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);
  // The two components are imported lazily, together with connect.js, so a
  // pro who never opens this page pays nothing for them.
  const [ui, setUi] = useState<null | {
    Provider: React.ComponentType<any>;
    Onboarding: React.ComponentType<any>;
  }>(null);
  // Strict mode double-invokes effects in development; one init is enough.
  const started = useRef(false);

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const onExit = useCallback(() => {
    // The pro closed or finished the component. Stripe's webhook is the
    // authority and usually beats this, but "usually" is not good enough for
    // the screen they are looking at: pull the account and re-render.
    startTransition(async () => {
      await refreshPayoutStatusAction();
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (isNative || failed || started.current) return;
    if (!publishableKey) {
      // No key in this environment: the embedded path cannot work at all.
      // Not an error worth showing - the hosted button does the same job.
      setFailed(true);
      return;
    }
    started.current = true;
    let cancelled = false;

    (async () => {
      try {
        const [{ loadConnectAndInitialize }, react] = await Promise.all([
          import("@stripe/connect-js"),
          import("@stripe/react-connect-js"),
        ]);
        const instance = (loadConnectAndInitialize as Loader)({
          publishableKey,
          fetchClientSecret: async () => {
            const r = await createAccountSessionAction();
            if ("error" in r) throw new Error(r.error);
            return r.clientSecret;
          },
          appearance: { variables: { colorPrimary: BRAND_PRIMARY } },
        });
        if (cancelled) return;
        setUi({
          Provider: react.ConnectComponentsProvider,
          Onboarding: react.ConnectAccountOnboarding,
        });
        setConnectInstance(instance);
      } catch (err) {
        // A blocked CDN, an offline pro, a rejected account session. The
        // hosted button below is the answer to all of them.
        console.error("connect.js init failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNative, failed, publishableKey]);

  // Nothing to set up: this component is not rendered for "ready" or
  // "unavailable" (the page decides), so every path below is a real CTA.
  if (isNative || failed || !connectInstance || !ui) {
    return (
      <div className="space-y-2">
        <HostedButton label={ctaLabel} />
        {!isNative && failed && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            This opens a secure page on Stripe.
          </p>
        )}
      </div>
    );
  }

  const { Provider, Onboarding } = ui;
  return (
    <div className="space-y-4">
      <Provider connectInstance={connectInstance}>
        <Onboarding onExit={onExit} />
      </Provider>
      {/* Always here, under a working component: some people would simply
          rather do this on a page of its own, and a pro who gets stuck inside
          the embedded flow needs a way out that is not the back button. */}
      <form action={startHostedPayoutOnboardingAction}>
        <button
          type="submit"
          className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          Prefer a separate page? Continue on Stripe
        </button>
      </form>
    </div>
  );
}
