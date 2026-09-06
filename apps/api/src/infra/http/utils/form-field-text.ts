/**
 * The text form of a form field that arrived typed as `unknown`, or `null` when
 * the value has no meaningful text form.
 *
 * Multipart parts and querystring entries are `unknown` at the type level: a
 * real field is a string, but nothing in the type says so. `String(value)` on
 * an object yields the literal `"[object Object]"`, and every caller here then
 * parses that as if the user had typed it — a skills list becomes
 * `["[object Object]"]`, a JSON field becomes garbage. Returning `null` for the
 * shapes that have no text form keeps that out of the parsers while leaving a
 * genuine string, number or boolean field behaving exactly as before.
 */
export function formFieldText(raw: unknown): string | null {
  if (typeof raw === "string") {
    return raw;
  }

  if (
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    typeof raw === "bigint"
  ) {
    return String(raw);
  }

  return null;
}
