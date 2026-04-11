import type { LinkIcon } from "@repo/schemas";
import type { IconType } from "react-icons";
import {
  FaBehance,
  FaDiscord,
  FaDribbble,
  FaFacebook,
  FaGithub,
  FaInstagram,
  FaLinkedin,
  FaMedium,
  FaPinterest,
  FaReddit,
  FaSnapchat,
  FaSoundcloud,
  FaSpotify,
  FaTelegram,
  FaTiktok,
  FaTwitch,
  FaWhatsapp,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { FiGlobe, FiLink2 } from "react-icons/fi";

export type LinkIconOption = {
  value: LinkIcon;
  label: string;
  Icon: IconType;
  color: string;
  backgroundColor: string;
};

export const LINK_ICON_OPTIONS: LinkIconOption[] = [
  {
    value: "youtube",
    label: "YouTube",
    Icon: FaYoutube,
    color: "#FF0000",
    backgroundColor: "#FF000020",
  },
  {
    value: "instagram",
    label: "Instagram",
    Icon: FaInstagram,
    color: "#E4405F",
    backgroundColor: "#E4405F20",
  },
  {
    value: "x-twitter",
    label: "X (Twitter)",
    Icon: FaXTwitter,
    color: "var(--link-icon-x-twitter-fg)",
    backgroundColor: "var(--link-icon-x-twitter-bg)",
  },
  {
    value: "linkedin",
    label: "LinkedIn",
    Icon: FaLinkedin,
    color: "#0A66C2",
    backgroundColor: "#0A66C220",
  },
  {
    value: "github",
    label: "GitHub",
    Icon: FaGithub,
    color: "var(--link-icon-github-fg)",
    backgroundColor: "var(--link-icon-github-bg)",
  },
  {
    value: "tiktok",
    label: "TikTok",
    Icon: FaTiktok,
    color: "var(--link-icon-tiktok-fg)",
    backgroundColor: "var(--link-icon-tiktok-bg)",
  },
  {
    value: "facebook",
    label: "Facebook",
    Icon: FaFacebook,
    color: "#1877F2",
    backgroundColor: "#1877F220",
  },
  {
    value: "discord",
    label: "Discord",
    Icon: FaDiscord,
    color: "#5865F2",
    backgroundColor: "#5865F220",
  },
  {
    value: "twitch",
    label: "Twitch",
    Icon: FaTwitch,
    color: "#9146FF",
    backgroundColor: "#9146FF20",
  },
  {
    value: "pinterest",
    label: "Pinterest",
    Icon: FaPinterest,
    color: "#E60023",
    backgroundColor: "#E6002320",
  },
  {
    value: "reddit",
    label: "Reddit",
    Icon: FaReddit,
    color: "#FF4500",
    backgroundColor: "#FF450020",
  },
  {
    value: "snapchat",
    label: "Snapchat",
    Icon: FaSnapchat,
    color: "#FFF200",
    backgroundColor: "var(--link-icon-snapchat-bg)",
  },
  {
    value: "telegram",
    label: "Telegram",
    Icon: FaTelegram,
    color: "#26A5E4",
    backgroundColor: "#26A5E420",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    Icon: FaWhatsapp,
    color: "#25D366",
    backgroundColor: "#25D36620",
  },
  {
    value: "spotify",
    label: "Spotify",
    Icon: FaSpotify,
    color: "#1DB954",
    backgroundColor: "#1DB95420",
  },
  {
    value: "soundcloud",
    label: "SoundCloud",
    Icon: FaSoundcloud,
    color: "#FF5500",
    backgroundColor: "#FF550020",
  },
  {
    value: "medium",
    label: "Medium",
    Icon: FaMedium,
    color: "var(--link-icon-medium-fg)",
    backgroundColor: "var(--link-icon-medium-bg)",
  },
  {
    value: "behance",
    label: "Behance",
    Icon: FaBehance,
    color: "#1769FF",
    backgroundColor: "#1769FF20",
  },
  {
    value: "dribbble",
    label: "Dribbble",
    Icon: FaDribbble,
    color: "#EA4C89",
    backgroundColor: "#EA4C8920",
  },
  {
    value: "website",
    label: "Website",
    Icon: FiGlobe,
    color: "#0EA5E9",
    backgroundColor: "#0EA5E920",
  },
];

const ICON_OPTIONS_BY_VALUE = new Map<LinkIcon, LinkIconOption>(
  LINK_ICON_OPTIONS.map((option) => [option.value, option]),
);

export const DEFAULT_LINK_ICON = {
  label: "Link",
  Icon: FiLink2,
  color: "#FFFFFF",
  backgroundColor: "linear-gradient(135deg, #0EA5E9, #14B8A6)",
} as const;

export const getLinkIconOption = (
  icon: LinkIcon | null | undefined,
): LinkIconOption | undefined => {
  if (!icon) {
    return undefined;
  }

  return ICON_OPTIONS_BY_VALUE.get(icon);
};

const URL_ICON_PATTERNS: Array<{ pattern: RegExp; icon: LinkIcon }> = [
  { pattern: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, icon: "youtube" },
  { pattern: /(^|\.)instagram\.com$/i, icon: "instagram" },
  { pattern: /(^|\.)x\.com$|(^|\.)twitter\.com$/i, icon: "x-twitter" },
  { pattern: /(^|\.)linkedin\.com$/i, icon: "linkedin" },
  { pattern: /(^|\.)github\.com$/i, icon: "github" },
  { pattern: /(^|\.)tiktok\.com$/i, icon: "tiktok" },
  { pattern: /(^|\.)facebook\.com$|(^|\.)fb\.com$/i, icon: "facebook" },
  { pattern: /(^|\.)discord\.com$|(^|\.)discord\.gg$/i, icon: "discord" },
  { pattern: /(^|\.)twitch\.tv$/i, icon: "twitch" },
  { pattern: /(^|\.)pinterest\.com$/i, icon: "pinterest" },
  { pattern: /(^|\.)reddit\.com$|(^|\.)redd\.it$/i, icon: "reddit" },
  { pattern: /(^|\.)snapchat\.com$/i, icon: "snapchat" },
  { pattern: /(^|\.)telegram\.org$|(^|\.)t\.me$/i, icon: "telegram" },
  { pattern: /(^|\.)whatsapp\.com$|(^|\.)wa\.me$/i, icon: "whatsapp" },
  { pattern: /(^|\.)spotify\.com$/i, icon: "spotify" },
  { pattern: /(^|\.)soundcloud\.com$/i, icon: "soundcloud" },
  { pattern: /(^|\.)medium\.com$/i, icon: "medium" },
  { pattern: /(^|\.)behance\.net$/i, icon: "behance" },
  { pattern: /(^|\.)dribbble\.com$/i, icon: "dribbble" },
];

const TITLE_ICON_PATTERNS: Array<{ pattern: RegExp; icon: LinkIcon }> = [
  { pattern: /\byoutube\b|\byt\b/i, icon: "youtube" },
  { pattern: /\binstagram\b|\binsta\b/i, icon: "instagram" },
  { pattern: /\bx\b|\btwitter\b/i, icon: "x-twitter" },
  { pattern: /\blinkedin\b/i, icon: "linkedin" },
  { pattern: /\bgithub\b/i, icon: "github" },
  { pattern: /\btiktok\b/i, icon: "tiktok" },
  { pattern: /\bfacebook\b|\bfb\b/i, icon: "facebook" },
  { pattern: /\bdiscord\b/i, icon: "discord" },
  { pattern: /\btwitch\b/i, icon: "twitch" },
  { pattern: /\bpinterest\b/i, icon: "pinterest" },
  { pattern: /\breddit\b/i, icon: "reddit" },
  { pattern: /\bsnapchat\b/i, icon: "snapchat" },
  { pattern: /\btelegram\b/i, icon: "telegram" },
  { pattern: /\bwhatsapp\b/i, icon: "whatsapp" },
  { pattern: /\bspotify\b/i, icon: "spotify" },
  { pattern: /\bsoundcloud\b/i, icon: "soundcloud" },
  { pattern: /\bmedium\b/i, icon: "medium" },
  { pattern: /\bbehance\b/i, icon: "behance" },
  { pattern: /\bdribbble\b/i, icon: "dribbble" },
  { pattern: /\bwebsite\b|\bsite\b|\bportfolio\b|\bblog\b/i, icon: "website" },
];

const safeParseHostname = (url: string): string | null => {
  const trimmedUrl = url.trim();

  if (trimmedUrl.length === 0) {
    return null;
  }

  try {
    return new URL(trimmedUrl).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${trimmedUrl}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
};

export const detectLinkIcon = (params: {
  title?: string;
  url?: string;
}): LinkIcon | null => {
  const hostname = safeParseHostname(params.url ?? "");

  if (hostname) {
    const byUrl = URL_ICON_PATTERNS.find(({ pattern }) =>
      pattern.test(hostname),
    );

    if (byUrl) {
      return byUrl.icon;
    }
  }

  const normalizedTitle = (params.title ?? "").trim();

  if (normalizedTitle.length > 0) {
    const byTitle = TITLE_ICON_PATTERNS.find(({ pattern }) =>
      pattern.test(normalizedTitle),
    );

    if (byTitle) {
      return byTitle.icon;
    }
  }

  return null;
};
