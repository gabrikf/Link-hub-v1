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
export const BUTTON_ICON_OPTIONS: { value: string; label: string; Icon: IconType }[] = [
  { value: "FiArrowRight", label: "Arrow", Icon: FiArrowRight },
  { value: "FiDownload", label: "Download", Icon: FiDownload },
  { value: "FiExternalLink", label: "External link", Icon: FiExternalLink },
  { value: "FiMail", label: "Mail", Icon: FiMail },
  { value: "FiSend", label: "Send", Icon: FiSend },
  { value: "FiPhone", label: "Phone", Icon: FiPhone },
  { value: "FiCalendar", label: "Calendar", Icon: FiCalendar },
  { value: "FiMapPin", label: "Location", Icon: FiMapPin },
  { value: "FiShoppingCart", label: "Shop", Icon: FiShoppingCart },
  { value: "FiStar", label: "Star", Icon: FiStar },
  { value: "FiHeart", label: "Heart", Icon: FiHeart },
  { value: "FiGithub", label: "GitHub", Icon: FiGithub },
  { value: "FiLinkedin", label: "LinkedIn", Icon: FiLinkedin },
  { value: "FiYoutube", label: "YouTube", Icon: FiYoutube },
];

const BUTTON_ICONS_BY_NAME = new Map(
  BUTTON_ICON_OPTIONS.map((option) => [option.value, option.Icon]),
);

export function getButtonIcon(name: string | null | undefined): IconType | undefined {
  if (!name) {
    return undefined;
  }
  return BUTTON_ICONS_BY_NAME.get(name);
}

/** Accent palette offered for button blocks (tailwind color tokens). */
export const BUTTON_ACCENTS: { value: string; label: string; hex: string }[] = [
  { value: "violet", label: "Violet", hex: "#8b5cf6" },
  { value: "fuchsia", label: "Fuchsia", hex: "#d946ef" },
  { value: "cyan", label: "Cyan", hex: "#06b6d4" },
  { value: "teal", label: "Teal", hex: "#14b8a6" },
  { value: "emerald", label: "Emerald", hex: "#10b981" },
  { value: "amber", label: "Amber", hex: "#f59e0b" },
  { value: "rose", label: "Rose", hex: "#f43f5e" },
  { value: "zinc", label: "Zinc", hex: "#71717a" },
];

const ACCENT_HEX_BY_TOKEN = new Map(
  BUTTON_ACCENTS.map((accent) => [accent.value, accent.hex]),
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
