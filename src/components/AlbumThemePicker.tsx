import {
  BriefcaseBusiness,
  CalendarDays,
  Hammer,
  Images,
  Plane,
  Shapes,
  Shield,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  ALBUM_THEME_TEMPLATES,
  type AlbumThemeTemplateID,
} from "../lib/albumThemes";

const themeIcons: Record<string, LucideIcon> = {
  images: Images,
  diy: Hammer,
  travel: Plane,
  family: UsersRound,
  event: CalendarDays,
  work: BriefcaseBusiness,
  sassen: Shield,
  other: Shapes,
};

export function AlbumThemeIcon({
  icon,
  size = 20,
}: {
  icon?: string;
  size?: number;
}) {
  const Icon = themeIcons[icon ?? "images"] ?? Images;
  return <Icon size={size} aria-hidden="true" />;
}

export function AlbumThemePicker({
  value,
  disabled = false,
  preserveCurrent = false,
  onChange,
}: {
  value: AlbumThemeTemplateID | null;
  disabled?: boolean;
  preserveCurrent?: boolean;
  onChange: (templateID: AlbumThemeTemplateID | null) => void;
}) {
  return (
    <div className="album-theme-picker" aria-label="テーマテンプレート">
      {preserveCurrent ? (
        <button
          type="button"
          className={value === null ? "is-selected" : ""}
          disabled={disabled}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          <span className="album-theme-picker__swatch is-current">
            <Shapes size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>現在の設定</strong>
            <small>既存の見た目を維持</small>
          </span>
        </button>
      ) : null}
      {ALBUM_THEME_TEMPLATES.map((template) => (
        <button
          type="button"
          key={template.id}
          className={value === template.id ? "is-selected" : ""}
          disabled={disabled}
          aria-pressed={value === template.id}
          onClick={() => onChange(template.id)}
        >
          <span
            className="album-theme-picker__swatch"
            style={{ backgroundColor: template.settings.themeColor }}
          >
            <AlbumThemeIcon icon={template.settings.albumIcon} />
          </span>
          <span>
            <strong>
              {template.name}
              {template.id === "standard" ? "（Eternal memories）" : ""}
            </strong>
            <small>{template.summary}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
