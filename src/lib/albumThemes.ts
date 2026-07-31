export type AlbumThemeTemplateID =
  | "standard"
  | "diy"
  | "travel"
  | "family"
  | "event"
  | "work"
  | "sassen"
  | "other";

export type AlbumLogoPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface AlbumThemeSettings {
  schemaVersion: 1;
  source: "system";
  logo: {
    kind: "text";
    text: "Eternal memories";
    position: AlbumLogoPosition;
    size: number;
    opacity: number;
  };
  themeColor: string;
  albumIcon: string;
  downloadImage: {
    watermarkEnabled: true;
    watermarkPosition: AlbumLogoPosition;
    watermarkSize: number;
    watermarkOpacity: number;
    backgroundOpacity: number;
  };
  initialTags: string[];
  initialDescription: string | null;
}

export interface AlbumThemeTemplate {
  id: AlbumThemeTemplateID;
  name: string;
  summary: string;
  settings: AlbumThemeSettings;
}

function createTemplate(
  id: AlbumThemeTemplateID,
  name: string,
  summary: string,
  themeColor: string,
  albumIcon: string,
  initialTags: string[],
  logo: Partial<AlbumThemeSettings["logo"]> = {},
): AlbumThemeTemplate {
  const position = logo.position ?? "bottom-right";
  const size = logo.size ?? 1;
  const opacity = logo.opacity ?? 0.62;
  return {
    id,
    name,
    summary,
    settings: {
      schemaVersion: 1,
      source: "system",
      logo: {
        kind: "text",
        text: "Eternal memories",
        position,
        size,
        opacity,
      },
      themeColor,
      albumIcon,
      downloadImage: {
        watermarkEnabled: true,
        watermarkPosition: position,
        watermarkSize: size,
        watermarkOpacity: opacity,
        backgroundOpacity: 0.22,
      },
      initialTags,
      initialDescription: null,
    },
  };
}

export const ALBUM_THEME_TEMPLATES: readonly AlbumThemeTemplate[] = [
  createTemplate(
    "standard",
    "標準",
    "Eternal memoriesの基本デザイン",
    "#c65476",
    "images",
    [],
  ),
  createTemplate("diy", "DIY", "作品づくりの記録に", "#b46c43", "diy", ["DIY"]),
  createTemplate(
    "travel",
    "旅行",
    "旅先の思い出に",
    "#4d86a8",
    "travel",
    ["旅行"],
  ),
  createTemplate(
    "family",
    "家族",
    "家族との大切な時間に",
    "#d36f89",
    "family",
    ["家族"],
  ),
  createTemplate(
    "event",
    "イベント",
    "行事や記念日の記録に",
    "#8a6db0",
    "event",
    ["イベント"],
  ),
  createTemplate(
    "work",
    "仕事",
    "仕事や活動の記録に",
    "#60758a",
    "work",
    ["仕事"],
  ),
  createTemplate(
    "sassen",
    "SASSEN",
    "SASSENの活動記録に",
    "#287b73",
    "sassen",
    ["SASSEN"],
  ),
  createTemplate(
    "other",
    "その他",
    "自由なテーマで使うアルバム",
    "#786f7c",
    "other",
    [],
  ),
] as const;

export const DEFAULT_ALBUM_THEME_ID: AlbumThemeTemplateID = "standard";

export function getAlbumThemeTemplate(
  templateID: AlbumThemeTemplateID,
): AlbumThemeTemplate {
  return (
    ALBUM_THEME_TEMPLATES.find((template) => template.id === templateID) ??
    ALBUM_THEME_TEMPLATES[0]
  );
}

export function isAlbumThemeTemplateID(
  value: unknown,
): value is AlbumThemeTemplateID {
  return ALBUM_THEME_TEMPLATES.some((template) => template.id === value);
}

export function isAlbumThemeSettings(
  value: unknown,
): value is AlbumThemeSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<AlbumThemeSettings>;
  return (
    settings.schemaVersion === 1 &&
    settings.source === "system" &&
    typeof settings.themeColor === "string" &&
    typeof settings.albumIcon === "string" &&
    Boolean(settings.logo) &&
    Boolean(settings.downloadImage) &&
    Array.isArray(settings.initialTags)
  );
}
