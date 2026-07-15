"use client";

// Last-resort error boundary: catches crashes in the root layout itself,
// which the regular app/error.tsx cannot (it renders inside that layout).
// Must render its own <html> and <body>, and can't rely on Tailwind or any
// shared component: if the layout crashed, none of that is guaranteed to
// load. Inline styles only, on purpose.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#fafaf9",
          color: "#1c1917",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <p style={{ fontSize: "32px", margin: 0 }} aria-hidden>
            🏡
          </p>
          <h1
            style={{
              margin: "16px 0 0",
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            Something went sideways
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "14px",
              color: "#57534e",
              lineHeight: 1.5,
            }}
          >
            Your data is safe. Trying again usually clears it up; if it keeps
            happening, give it a minute and come back.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#ffffff",
              // hearth-600 from tailwind.config.ts, hard-coded since
              // Tailwind may not have loaded here.
              backgroundColor: "#915d32",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
