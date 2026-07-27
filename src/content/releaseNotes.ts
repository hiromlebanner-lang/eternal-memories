export interface ReleaseNote {
  version: string;
  releasedAt: string;
  categories: Array<"新機能" | "改善" | "修正" | "重要">;
  changes: string[];
  improvements: string[];
  fixes: string[];
}

// 新しい更新を先頭へ追加してください。画面ではこの配列をそのまま新しい順に表示します。
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.2.1",
    releasedAt: "2026-07-27",
    categories: ["改善", "修正"],
    changes: [],
    improvements: ["ログイン画面を開いた際の入力動作を改善しました"],
    fixes: ["意図しないFace ID起動を防ぐようにしました"],
  },
  {
    version: "1.2.0",
    releasedAt: "2026-07-27",
    categories: ["新機能", "改善"],
    changes: [
      "アルバムの写真を保存できるようになりました",
      "保存した写真にEternal memoriesの表記が入るようになりました",
    ],
    improvements: ["写真の閲覧権限と保存時の安全性を改善しました"],
    fixes: [],
  },
  {
    version: "1.1.0",
    releasedAt: "2026-07-27",
    categories: ["新機能", "改善", "修正"],
    changes: [
      "写真の複数枚アップロードに対応",
      "全ログインユーザーで楽しめる「みんなの思い出」を追加",
      "写真の公開範囲設定を追加",
    ],
    improvements: ["写真一覧とアップロード状況の表示速度を改善"],
    fixes: ["写真投稿時の権限判定とエラー表示を改善"],
  },
  {
    version: "1.0.0",
    releasedAt: "2026-07-25",
    categories: ["新機能"],
    changes: [
      "Eternal memoriesを公開",
      "Googleログインとメールアドレスログインを追加",
      "共有アルバム作成、写真投稿、地図表示を追加",
    ],
    improvements: [],
    fixes: [],
  },
];
