// Shared closing CTA for the public /guides pages. Every guide page ends with
// the same pitch: the ranges above are national/typical, Hearth's answer is
// specific to the visitor's own home, and it's free to get. Keep this in
// lockstep across all guide pages rather than letting each page drift.
export default function GuideCta() {
  return (
    <section className="mt-12 rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">
        Get the answer for YOUR home
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
        Everything above is a general, national range. Hearth knows your
        home&apos;s actual age, size, and systems, and turns that into a
        house-specific answer, free.
      </p>
      <a
        href="/get-started"
        className="btn-primary mt-5 inline-block px-6 py-2.5"
      >
        Get started free
      </a>
    </section>
  );
}
