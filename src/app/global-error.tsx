"use client";

// Renders only when the root layout itself throws, so it must supply its own
// <html>/<body>. Kept dependency-free and inline-styled since the app chrome
// and stylesheet may be unavailable at this point.
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
          fontFamily: "Georgia, 'Times New Roman', serif",
          background: "#f4ead7",
          color: "#2b2620",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
            The Coherence Thesis hit an unexpected error
          </h1>
          <p style={{ marginBottom: "1.5rem", lineHeight: 1.6 }}>
            Your reading progress is stored locally and was not affected.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "0.5rem",
              border: "1px solid #77542a",
              background: "#77542a",
              color: "#f4ead7",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
