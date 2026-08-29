import type { TFunction } from "i18next";
import type { IconType } from "react-icons";
import {
  FiArrowRight,
  FiCalendar,
  FiDownload,
  FiExternalLink,
  FiGithub,
  FiHeart,
  FiLinkedin,
  FiMail,
  FiMapPin,
  FiPhone,
  FiSend,
  FiShoppingCart,
  FiStar,
  FiYoutube,
} from "react-icons/fi";

/** Curated react-icons/fi set offered for button blocks. */
const BUTTON_ICON_DATA: { value: string; labelKey: string; Icon: IconType }[] = [
  { value: "FiArrowRight", labelKey: "enum.icon.arrow", Icon: FiArrowRight },
  { value: "FiDownload", labelKey: "enum.icon.download", Icon: FiDownload },
  {
    value: "FiExternalLink",
    labelKey: "enum.icon.externalLink",
    Icon: FiExternalLink,
  },
  { value: "FiMail", labelKey: "enum.icon.mail", Icon: FiMail },
  { value: "FiSend", labelKey: "enum.icon.send", Icon: FiSend },
  { value: "FiPhone", labelKey: "enum.icon.phone", Icon: FiPhone },
  { value: "FiCalendar", labelKey: "enum.icon.calendar", Icon: FiCalendar },
  { value: "FiMapPin", labelKey: "common.location", Icon: FiMapPin },
  { value: "FiShoppingCart", labelKey: "enum.icon.shop", Icon: FiShoppingCart },
  { value: "FiStar", labelKey: "enum.icon.star", Icon: FiStar },
  { value: "FiHeart", labelKey: "enum.icon.heart", Icon: FiHeart },
  { value: "FiGithub", labelKey: "enum.platform.github", Icon: FiGithub },
  { value: "FiLinkedin", labelKey: "enum.platform.linkedin", Icon: FiLinkedin },
  { value: "FiYoutube", labelKey: "enum.platform.youtube", Icon: FiYoutube },
];

export function getButtonIconOptions(
  t: TFunction,
): { value: string; label: string; Icon: IconType }[] {
  return BUTTON_ICON_DATA.map(({ value, labelKey, Icon }) => ({
    value,
    label: t(labelKey),
    Icon,
  }));
}

const BUTTON_ICONS_BY_NAME = new Map(
  BUTTON_ICON_DATA.map((option) => [option.value, option.Icon]),
);

export function getButtonIcon(name: string | null | undefined): IconType | undefined {
  if (!name) {
    return undefined;
  }
  return BUTTON_ICONS_BY_NAME.get(name);
}

/** Accent palette offered for button blocks (tailwind color tokens). */
const BUTTON_ACCENT_DATA: { value: string; labelKey: string; hex: string }[] = [
  { value: "violet", labelKey: "enum.accent.violet", hex: "#8b5cf6" },
  { value: "fuchsia", labelKey: "enum.accent.fuchsia", hex: "#d946ef" },
  { value: "cyan", labelKey: "enum.accent.cyan", hex: "#06b6d4" },
  { value: "teal", labelKey: "enum.accent.teal", hex: "#14b8a6" },
  { value: "emerald", labelKey: "enum.accent.emerald", hex: "#10b981" },
  { value: "amber", labelKey: "enum.accent.amber", hex: "#f59e0b" },
  { value: "rose", labelKey: "enum.accent.rose", hex: "#f43f5e" },
  { value: "zinc", labelKey: "enum.accent.zinc", hex: "#71717a" },
];

export function getButtonAccents(
  t: TFunction,
): { value: string; label: string; hex: string }[] {
  return BUTTON_ACCENT_DATA.map(({ value, labelKey, hex }) => ({
    value,
    label: t(labelKey),
    hex,
  }));
}

const ACCENT_HEX_BY_TOKEN = new Map(
  BUTTON_ACCENT_DATA.map((accent) => [accent.value, accent.hex]),
);

/** Resolve an accent token or raw hex to a usable CSS color. Defaults to violet. */
export function resolveAccentColor(accent: string | null | undefined): string {
  if (!accent) {
    return "#8b5cf6";
  }
  if (accent.startsWith("#")) {
    return accent;
  }
  return ACCENT_HEX_BY_TOKEN.get(accent) ?? "#8b5cf6";
}
