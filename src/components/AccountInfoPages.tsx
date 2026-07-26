import { ChevronRight, ExternalLink } from "lucide-react";
import packageInfo from "../../package.json";
import { RELEASE_NOTES } from "../content/releaseNotes";

export type AccountPageRoute =
  | "guide"
  | "faq"
  | "contact"
  | "privacy"
  | "terms"
  | "updates"
  | "app"
  | "licenses"
  | "open-source";

interface MenuItem {
  route: AccountPageRoute;
  label: string;
  detail?: string;
  isNew?: boolean;
}

const ACCOUNT_SECTIONS: Array<{ title: string; items: MenuItem[] }> = [
  {
    title: "サポート",
    items: [
      { route: "guide", label: "使い方ガイド" },
      { route: "faq", label: "よくある質問（FAQ）" },
      { route: "contact", label: "お問い合わせ" },
    ],
  },
  {
    title: "情報",
    items: [
      { route: "privacy", label: "プライバシーポリシー" },
      { route: "terms", label: "利用規約" },
      { route: "updates", label: "アップデート情報", isNew: true },
    ],
  },
  {
    title: "アプリ情報",
    items: [
      {
        route: "app",
        label: "アプリバージョン",
        detail: `Ver ${packageInfo.version}`,
      },
      { route: "licenses", label: "ライセンス情報" },
      { route: "open-source", label: "利用しているオープンソース" },
    ],
  },
];

export const ACCOUNT_ROUTE_PATHS: Record<AccountPageRoute, string> = {
  guide: "/account/guide",
  faq: "/account/faq",
  contact: "/account/contact",
  privacy: "/account/privacy",
  terms: "/account/terms",
  updates: "/account/updates",
  app: "/account/app",
  licenses: "/account/licenses",
  "open-source": "/account/open-source",
};

export function accountRouteFromPath(pathname: string) {
  return (
    (Object.entries(ACCOUNT_ROUTE_PATHS).find(
      ([, path]) => path === pathname,
    )?.[0] as AccountPageRoute | undefined) ?? null
  );
}

export function accountPageTitle(route: AccountPageRoute) {
  return ACCOUNT_SECTIONS.flatMap((section) => section.items).find(
    (item) => item.route === route,
  )?.label ?? "アカウント情報";
}

export function AccountInfoMenu({
  onNavigate,
}: {
  onNavigate: (route: AccountPageRoute) => void;
}) {
  return (
    <div className="account-menu">
      {ACCOUNT_SECTIONS.map((section) => (
        <section className="account-menu__section" key={section.title}>
          <h3>{section.title}</h3>
          <div className="account-menu__list">
            {section.items.map((item) => (
              <button
                type="button"
                className="account-menu__row"
                key={item.route}
                onClick={() => onNavigate(item.route)}
              >
                <span>
                  <strong>{item.label}</strong>
                  {item.isNew ? <small className="new-badge">NEW</small> : null}
                </span>
                <span className="account-menu__trailing">
                  {item.detail ? <small>{item.detail}</small> : null}
                  <ChevronRight size={18} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const GUIDE_SECTIONS = [
  {
    title: "Eternal Memoriesとは",
    body: "家族や友だちと写真を集め、撮影場所と一緒に思い出を残せる共有アルバムです。アルバムごとに参加者を分けられます。",
  },
  {
    title: "Googleログイン",
    body: "ログイン画面の「Googleで続ける」を押し、利用するGoogleアカウントを選びます。認証後、自動でEternal Memoriesへ戻ります。",
  },
  {
    title: "アルバム作成",
    body: "アルバム一覧の追加ボタンから名前と説明を入力します。作成した人がオーナーになり、共有や削除を管理します。",
  },
  {
    title: "アルバム参加",
    body: "届いた招待URLや招待コードを開き、内容を確認して「参加する」を押します。心当たりのない招待には参加しないでください。",
  },
  {
    title: "写真投稿・複数枚アップロード",
    body: "アルバムの追加ボタンから写真を撮るかライブラリから選びます。一度に最大20枚まで選べ、不要な写真は投稿前に一覧から外せます。",
  },
  {
    title: "写真の公開範囲",
    body: "「このアルバムのみ」は参加者だけが閲覧できます。「このアルバム＋みんなの思い出」は、アルバム外のログインユーザーにも表示されます。初期値はアルバムのみです。",
  },
  {
    title: "みんなの思い出",
    body: "公開範囲を「みんなの思い出」にした写真を、新しい順で楽しめるページです。公開した写真の編集・削除は投稿者本人だけが行えます。",
  },
  {
    title: "写真の地図表示",
    body: "位置情報が付いた写真は地図に丸い写真アイコンで表示されます。同じ場所の写真はまとめて表示され、タップすると写真を確認できます。",
  },
  {
    title: "アルバム共有",
    body: "アルバムの共有ボタンから招待URL、QRコード、招待コードを利用できます。招待先と対象アルバムを確認してから共有してください。",
  },
  {
    title: "コメント機能",
    body: "写真詳細にコメント欄が表示されている場合、思い出や感想を残せます。相手が不快になる内容や個人情報は投稿しないでください。",
  },
  {
    title: "写真削除・アルバム削除",
    body: "写真は投稿者本人が詳細画面から削除できます。アルバム全体の削除はオーナーだけが行えます。削除したデータは元に戻せない場合があります。",
  },
  {
    title: "位置情報について",
    body: "写真の撮影場所を地図に表示するため、投稿時に端末の位置情報を利用する場合があります。許可しなくても写真は選べますが、地図へ正確に表示されないことがあります。",
  },
  {
    title: "安全な使い方とプライバシー",
    body: "招待URLを知らない人へ送らない、住所や学校などが分かる写真の公開範囲を確認する、端末を共有するときはログアウトする、という点を意識してください。",
  },
];

const FAQS = [
  ["ログインできません", "通信状態を確認し、SafariやChromeを開き直してください。Googleログインの場合は、認証に使用したアカウントも確認してください。"],
  ["認証後にアプリへ戻りません", "認証画面を閉じずに完了し、元のEternal Memoriesへ戻るまでお待ちください。PWAの場合はSafari側も確認してください。"],
  ["写真が表示されません", "通信状態を確認して画面を開き直してください。アルバム参加権限が外れている場合は表示できません。"],
  ["写真を削除したいです", "自分が投稿した写真の詳細を開き、削除を選択してください。他の人が投稿した写真は削除できません。"],
  ["アルバムを削除できません", "アルバムを削除できるのは、そのアルバムを作成したオーナーだけです。"],
  ["位置情報が付きません", "端末の設定で位置情報を許可し、屋外などGPSを取得しやすい場所で再度お試しください。"],
  ["地図に写真が表示されません", "写真に位置情報が保存されているか、地図と写真一覧の切り替えを確認してください。"],
  ["招待が届きません", "迷惑メール、招待URLの期限、入力したメールアドレスを確認し、必要ならオーナーへ再送を依頼してください。"],
  ["招待コードが使えません", "大文字・小文字や期限を確認してください。再発行された場合、古いコードは利用できません。"],
  ["公開範囲を変更したいです", "自分が投稿した写真の詳細を開き、公開範囲を変更して保存してください。"],
  ["「みんなの思い出」に表示したくありません", "投稿時に「このアルバムのみ」を選んでください。投稿後でも自分の写真は非公開へ戻せます。"],
  ["写真を非公開に戻すと削除されますか", "削除されません。個別アルバムには残り、「みんなの思い出」からだけ非表示になります。"],
  ["複数枚投稿したいです", "写真選択画面で複数の写真を選んでください。一度に最大20枚まで投稿できます。"],
  ["一部の写真だけ失敗しました", "失敗した写真と理由を確認し、通信状態や参加権限を確認して失敗分だけ再試行してください。"],
  ["利用できる容量に上限はありますか", "運営環境や保存サービスの状況により上限が設定される場合があります。大きな画像は投稿時に圧縮される場合があります。"],
  ["HEIC写真は投稿できますか", "対応しています。ただし端末や画像の状態によって変換できない場合は、JPEG等へ変換してお試しください。"],
  ["ダークモードでも地図が明るいのはなぜですか", "地名や道路、写真アイコンを読みやすくするため、地図部分だけは常に明るい表示にしています。"],
  ["他の人に正確な現在地が見えますか", "通常の写真閲覧では写真に保存した撮影場所が表示されます。現在地そのものを常時追跡する機能ではありません。"],
  ["コメントを消したいです", "コメントの操作メニューが表示される場合は、そこから削除してください。表示されない場合はお問い合わせください。"],
  ["プロフィール画像を変更したいです", "設定画面のプロフィール画像を押し、「プロフィール画像を変更」から撮影または写真選択を行います。"],
  ["通知が届きません", "ホーム画面に追加したPWAを開き、設定の通知をONにしてください。端末側で通知が拒否されていないかも確認してください。"],
  ["退会したいです", "現時点でアプリ内に退会項目が表示されない場合は、お問い合わせからアカウント削除を依頼してください。本人確認をお願いする場合があります。"],
];

const PRIVACY_SECTIONS = [
  ["1. 取得する情報", "メールアドレス等の認証情報、表示名・プロフィール画像、投稿写真、写真の撮影日時・緯度経度、アルバム・招待・メンバー情報、コメント、端末やブラウザに関するアクセスログ、Cookieまたは同様の保存技術を利用する場合があります。"],
  ["2. Googleログイン", "Googleログインを選択した場合、Googleからユーザー識別子、メールアドレス、表示名、プロフィール画像等、認証に必要な情報を受け取る場合があります。GoogleアカウントのパスワードをEternal Memoriesが取得することはありません。"],
  ["3. 利用目的", "本人確認、ログイン状態の維持、アルバム共有、写真・位置情報の地図表示、コメントや通知、問い合わせ対応、不正利用防止、障害調査、品質改善のために利用します。"],
  ["4. 外部サービス", "認証・データベース・画像保存にSupabase、サイト配信にVercel、ログインにGoogle、地図表示にOpenStreetMapおよびLeafletを利用する場合があります。各サービスでは、その提供者の規約やプライバシーポリシーに従って情報が処理される場合があります。"],
  ["5. 第三者提供", "法令に基づく場合、生命・身体・財産の保護に必要な場合、または利用者の同意がある場合を除き、個人データを第三者へ提供しません。クラウド事業者への取扱いの委託は、サービス提供に必要な範囲で行う場合があります。"],
  ["6. 安全管理", "アクセス制御、ログイン認証、データベースの行単位権限、非公開ストレージ等、合理的な安全管理措置を講じます。ただし、インターネット上の安全を完全に保証するものではありません。"],
  ["7. 保存期間", "サービス提供、法令遵守、紛争対応等に必要な期間保存し、必要がなくなった情報は合理的な方法で削除または匿名化する場合があります。バックアップには一定期間残る場合があります。"],
  ["8. 利用者の権利", "利用者は、適用法令に従い、自己の個人情報の開示、訂正、利用停止、削除等を求めることができます。本人確認後、合理的な期間内に対応します。"],
  ["9. 未成年者", "未成年者は、必要に応じて保護者の同意を得て利用してください。公開範囲や位置情報を十分に確認し、学校名・住所等が分かる写真の公開には注意してください。"],
  ["10. お問い合わせ・改定", "個人情報に関する請求や質問はお問い合わせページからご連絡ください。本ポリシーは、機能や法令の変更に応じて改定し、重要な変更はアプリ内等でお知らせします。"],
];

const TERMS_SECTIONS = [
  ["1. サービス内容", "Eternal Memoriesは、写真、撮影場所、コメント等を共有アルバムで保存・閲覧するサービスです。機能の一部は端末、地域、設定により利用できない場合があります。"],
  ["2. 利用条件", "利用者は正確な登録情報を用い、アカウントを自己の責任で管理してください。第三者へのアカウント貸与や不正アクセスは禁止します。"],
  ["3. 禁止事項", "法令違反、権利侵害、嫌がらせ、なりすまし、不正アクセス、有害なプログラムの送信、サービス運営を妨げる行為、他人の個人情報を不当に公開する行為を禁止します。"],
  ["4. 著作権と投稿責任", "投稿写真等の権利は投稿者または正当な権利者に帰属します。投稿者は、投稿・共有に必要な権利や同意を得ていることを確認し、被写体の肖像権、プライバシー、著作権等を侵害しない責任を負います。"],
  ["5. 位置情報", "位置情報は写真の地図表示等に利用されます。自宅、学校、勤務先等を推測できる場合があるため、公開前に位置と公開範囲を確認してください。"],
  ["6. 共有アルバム", "招待URLやコードを受け取った人が参加できる場合があります。アルバムのオーナーと参加者は、招待先や権限を適切に管理してください。"],
  ["7. みんなの思い出", "「みんなの思い出」に公開した写真は、アルバム参加者以外のログインユーザーにも表示されます。公開範囲は投稿者が確認し、必要に応じて非公開へ戻してください。"],
  ["8. 免責事項", "データの完全な保存、常時利用可能であること、特定目的への適合性を保証するものではありません。利用者は重要な写真を端末等にも保管してください。運営者の故意または重過失による場合を除き、法令で認められる範囲で責任を制限します。"],
  ["9. サービス停止・アカウント停止", "保守、障害、災害、外部サービス停止等によりサービスを一時停止する場合があります。規約違反や安全上の必要がある場合、投稿の非表示やアカウント利用停止を行う場合があります。"],
  ["10. 退会", "利用者は所定の方法で退会または削除を申し込めます。共有アルバム内の投稿は、他の利用者との関係やバックアップの都合により直ちに完全削除されない場合があります。"],
  ["11. 規約変更", "法令や機能の変更に応じて本規約を変更する場合があります。重要な変更は、適用開始前にアプリ内等で分かりやすくお知らせします。"],
  ["12. 準拠法", "本規約は日本法に準拠します。紛争が生じた場合は、法令に従い日本国内の管轄裁判所で解決するものとします。"],
];

function TextSections({
  sections,
}: {
  sections: Array<{ title: string; body: string }> | string[][];
}) {
  return (
    <div className="account-document">
      {sections.map((section) => {
        const title = Array.isArray(section) ? section[0] : section.title;
        const body = Array.isArray(section) ? section[1] : section.body;
        return (
          <section key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        );
      })}
    </div>
  );
}

export function AccountInfoPage({ route }: { route: AccountPageRoute }) {
  if (route === "guide") return <TextSections sections={GUIDE_SECTIONS} />;

  if (route === "faq") {
    return (
      <div className="faq-list">
        {FAQS.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    );
  }

  if (route === "privacy") {
    return (
      <>
        <p className="account-document__lead">制定日：2026年7月27日</p>
        <TextSections sections={PRIVACY_SECTIONS} />
        <div className="reference-links">
          <a href="https://www.ppc.go.jp/personalinfo/" target="_blank" rel="noreferrer">
            個人情報保護委員会 <ExternalLink size={14} />
          </a>
          <a href="https://policies.google.com/privacy?hl=ja" target="_blank" rel="noreferrer">
            Googleプライバシーポリシー <ExternalLink size={14} />
          </a>
          <a href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">
            Vercel Privacy Notice <ExternalLink size={14} />
          </a>
          <a href="https://www.openstreetmap.org/about/legal" target="_blank" rel="noreferrer">
            OpenStreetMap Legal <ExternalLink size={14} />
          </a>
        </div>
      </>
    );
  }

  if (route === "terms") {
    return (
      <>
        <p className="account-document__lead">制定日：2026年7月27日</p>
        <TextSections sections={TERMS_SECTIONS} />
      </>
    );
  }

  if (route === "contact") {
    return (
      <div className="account-document">
        <section>
          <h3>お問い合わせ方法</h3>
          <p>
            以下の仮窓口へ、登録メールアドレス、利用端末、発生した日時を添えてお送りください。
          </p>
          <a className="contact-mail" href="mailto:support@eternal-memories.example">
            support@eternal-memories.example
          </a>
        </section>
        <section>
          <h3>返信目安</h3>
          <p>通常3〜5営業日を目安に返信します。内容により時間がかかる場合があります。</p>
        </section>
        <section>
          <h3>不具合報告</h3>
          <p>操作手順、表示されたメッセージ、端末名、SafariやChromeの種類をお知らせください。パスワードは送らないでください。</p>
        </section>
        <section>
          <h3>機能要望・プライバシー</h3>
          <p>機能要望、個人情報の開示・訂正・削除等のご相談も同じ窓口で受け付けます。本人確認をお願いする場合があります。</p>
        </section>
      </div>
    );
  }

  if (route === "updates") {
    return (
      <div className="release-timeline">
        {RELEASE_NOTES.map((note, index) => (
          <article className="release-card" key={note.version}>
            <header>
              <div>
                <strong>Ver {note.version}</strong>
                <time dateTime={note.releasedAt}>{note.releasedAt}</time>
              </div>
              {index === 0 ? <span className="new-badge">NEW</span> : null}
            </header>
            <div className="release-card__categories">
              {note.categories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>
            {note.changes.length ? <UpdateList title="更新内容" items={note.changes} /> : null}
            {note.improvements.length ? <UpdateList title="改善内容" items={note.improvements} /> : null}
            {note.fixes.length ? <UpdateList title="不具合修正" items={note.fixes} /> : null}
          </article>
        ))}
      </div>
    );
  }

  if (route === "app") {
    return (
      <dl className="app-info-list">
        <div><dt>アプリ名</dt><dd>Eternal Memories</dd></div>
        <div><dt>現在のバージョン</dt><dd>Ver {packageInfo.version}</dd></div>
        <div><dt>開発者</dt><dd>Eternal Memories Team</dd></div>
        <div><dt>コピーライト</dt><dd>© 2026 Eternal Memories</dd></div>
      </dl>
    );
  }

  if (route === "licenses") {
    return (
      <div className="account-document">
        <section>
          <h3>地図データ</h3>
          <p>地図データ © OpenStreetMap contributors（Open Database License）。地図上の帰属表示も常に維持しています。</p>
        </section>
        <section>
          <h3>オープンソースライセンス</h3>
          <p>本アプリはMIT、BSD、ISC、Apache License 2.0等で提供されるライブラリを利用しています。各著作権はそれぞれの権利者に帰属します。</p>
        </section>
        <div className="reference-links">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors <ExternalLink size={14} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="open-source-list">
      {[
        ["React / React DOM", "MIT"],
        ["Vite", "MIT"],
        ["Supabase JavaScript", "MIT"],
        ["Leaflet / React Leaflet", "BSD-2-Clause / MIT"],
        ["Lucide React", "ISC"],
        ["exifr", "MIT"],
        ["idb-keyval", "Apache-2.0"],
        ["qrcode", "MIT"],
        ["Workbox / vite-plugin-pwa", "MIT"],
      ].map(([name, license]) => (
        <div key={name}>
          <strong>{name}</strong>
          <small>{license}</small>
        </div>
      ))}
    </div>
  );
}

function UpdateList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}
