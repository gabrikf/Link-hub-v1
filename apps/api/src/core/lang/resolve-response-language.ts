import {
  DEFAULT_UI_LANGUAGE,
  parseAcceptLanguage,
  type UiLanguage,
} from "@repo/schemas";

import { detectLanguage } from "./detect-language.js";

/**
 * Everything that can have an opinion about which language an AI answer should
 * be written in, in one bag so the precedence lives in exactly one place.
 *
 * Every field is optional and nullable because every one of them genuinely can
 * be missing: a request may carry no user text, an untouched account has no
 * stored preference (`null` means "follow the device"), and a machine client
 * sends no `Accept-Language` at all.
 */
export type ResponseLanguageSources = {
  /** The user's own text for this request, if this request has any. */
  userText?: string | null;
  /** The stored preference; null means "follow the device". */
  preference?: UiLanguage | null;
  /** Raw inbound Accept-Language header. */
  acceptLanguage?: string | null;
};

/**
 * The language the model should answer in.
 *
 * Precedence, strongest first:
 *
 * 1. **A confident detection from the user's own text.** Someone who wrote
 *    their resume in Portuguese wants it summarised in Portuguese, even if they
 *    never opened the settings screen. This wins over the stored preference on
 *    purpose: the preference is about the interface chrome, the text in hand is
 *    direct evidence about this specific piece of content. It only ever fires
 *    when `detectLanguage` is confident — see that module for why it abstains
 *    so readily.
 * 2. **The stored preference**, which is the user's explicit choice.
 * 3. **`Accept-Language`**, the device's choice, for an account that has not
 *    expressed one.
 * 4. **`en-US`**, the source language of the product.
 *
 * Always returns a valid `UiLanguage` and never throws — a request must not be
 * able to fail because a header was malformed or a resume was unreadable.
 */
export const resolveResponseLanguage = (
  sources: ResponseLanguageSources,
): UiLanguage => {
  const detected = detectLanguage(sources.userText);
  if (detected) {
    return detected;
  }

  if (sources.preference) {
    return sources.preference;
  }

  return parseAcceptLanguage(sources.acceptLanguage) ?? DEFAULT_UI_LANGUAGE;
};

/**
 * How each locale is named to a model. English names, because the instruction
 * itself is written in English and a prompt that switches script mid-sentence
 * is measurably worse at being followed.
 *
 * The region is stated rather than dropped: "Portuguese" invites European
 * Portuguese, and "Spanish" invites Latin American Spanish. Both read as
 * foreign to the audience these locales were chosen for.
 */
const LANGUAGE_NAMES: Record<UiLanguage, string> = {
  "en-US": "English",
  "pt-BR": "Brazilian Portuguese",
  "es-ES": "European Spanish",
};

/**
 * One sentence to append to a system prompt.
 *
 * Deliberately scoped to "natural-language output" and nothing else. Several
 * prompts in this codebase return structured JSON whose enum values are wire
 * values matched against a schema, and whose retrieval labels are pinned to
 * English on purpose (see D6 in the feature's DEFINITION-OF-DONE). An
 * instruction that said "answer in Portuguese" without that qualifier would
 * invite the model to translate `full-time` into `tempo integral` and break the
 * parse.
 */
export const languageInstruction = (language: UiLanguage): string =>
  `Write all natural-language prose in your response in ${LANGUAGE_NAMES[language]} (${language}), regardless of the language of the input; leave structured field names, enum values and identifiers exactly as specified.`;
