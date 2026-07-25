# MapAlbum PWA

日本地図上に写真を残し、家族や友だちと同じアルバムを共有できるPWAです。

React、TypeScript、Vite、Leaflet、Supabaseで作られています。Windowsだけで開発・管理でき、iPhone／iPadではSafariからホーム画面へ追加して利用できます。

## 実装済み機能

- メールアドレス・パスワードによる登録／ログイン
- 登録メールの確認（Email Verification）
- パスワード再設定メールと新しいパスワードの登録
- Googleログイン
- Appleログイン
- ログイン状態の保持とログアウト
- 共有アルバムの作成
- メールアドレス・招待URL・QRコード・招待コードによる参加申請
- オーナー／管理者による参加承認・却下
- オーナー、管理者、メンバー、閲覧のみの4権限
- オーナー／管理者によるメンバー権限の変更
- iPhone／Androidからの写真撮影
- 写真ライブラリからの選択
- 写真EXIFまたは端末GPSによる撮影位置取得
- 地図をタップした位置調整
- 丸い写真サムネイルとカテゴリーアイコン
- 60m以内にある写真の枚数付きまとめ表示
- 地図／写真一覧切り替え
- コメント、投稿者、カテゴリーの検索
- 写真の編集・削除
- 投稿者本人、オーナー、管理者だけが削除可能
- ダークモード
- PWAインストール
- 一度表示した地図タイル、写真、アルバム情報のオフライン閲覧
- Supabase Realtimeによる写真更新の自動反映

未ログイン状態ではアルバム、写真、メンバー情報を表示しません。ログアウト時には端末内の写真・アルバムキャッシュも削除します。

---

## 1. Windowsでローカル起動する方法

### 1-1. 必要なもの

次のソフトをWindowsへインストールします。

1. [Node.js公式サイト](https://nodejs.org/)からLTS版をインストール
2. [Visual Studio Code](https://code.visualstudio.com/)をインストール
3. MapAlbumフォルダーをWindows上の分かりやすい場所へ置く

Node.jsのインストール後、一度PowerShellを閉じて開き直してください。

### 1-2. PowerShellを開く

エクスプローラーでMapAlbumフォルダーを開き、上部のアドレス欄へ次を入力してEnterを押します。

```text
powershell
```

### 1-3. パッケージをインストール

```powershell
npm install
```

初回は数分かかることがあります。

### 1-4. 開発画面を起動

```powershell
npm run dev
```

PowerShellに表示された次のようなURLをブラウザーで開きます。

```text
http://localhost:5173/
```

Supabaseが未設定の場合はログイン画面だけが表示され、アルバムデータは閲覧できません。先に「2. Supabaseの設定方法」を完了してください。

停止するときはPowerShellで `Ctrl + C` を押します。

### よく使うコマンド

```powershell
# 開発画面を起動
npm run dev

# 公開用ファイルを作成
npm run build

# TypeScriptのエラーだけ確認
npm run typecheck

# PWAアイコンを作り直す
npm run icons
```

---

## 2. Supabaseの設定方法

Supabaseが認証、アルバムデータ、メンバー権限、写真ファイルを管理します。ここでは、空のSupabaseプロジェクトをMapAlbumへ接続するところまでを、画面操作の順番どおりに説明します。

設定中に使う値は次の3つです。メモ帳などへ一時的に控えてください。

| 名前 | 例 | 使用場所 |
|---|---|---|
| Project Reference | `abcdefghijklmnop` | URL、OAuth Callback URL、CLI |
| Project URL | `https://abcdefghijklmnop.supabase.co` | `VITE_SUPABASE_URL` |
| Publishable Key | `sb_publishable_...` | `VITE_SUPABASE_ANON_KEY` |

MapAlbumの現在の公開URL:

```text
https://mapalbum-japan-2026.noguo22.chatgpt.site
```

> `VITE_SUPABASE_ANON_KEY` という環境変数名は既存コードとの互換性のため残していますが、値には新しいPublishable Keyを設定できます。Publishable Keyはブラウザー用の低権限キーです。`sb_secret_...`、`service_role`、データベースパスワードは絶対に設定しないでください。

### 2-1. Supabaseプロジェクトを作成

1. [Supabase Dashboard](https://supabase.com/dashboard)を開く
2. Supabaseアカウントを作成してログインする
3. 初回はOrganizationを作成する。個人利用なら自分だけのOrganizationで構いません
4. `New project` を押す
5. 次を入力する
   - `Name`: `MapAlbum` など分かりやすい名前
   - `Database Password`: 自動生成するか、長く推測されにくい文字列
   - `Region`: 主な利用者が日本なら `Northeast Asia (Tokyo)`
   - `Pricing Plan`: 試作はFree planから開始可能
6. `Create new project` を押す
7. 数分待ち、Project Overviewが開いてステータスが利用可能になることを確認する

データベースパスワードはパスワード管理アプリなどへ保管してください。MapAlbumの `.env` には入力しません。リージョンは作成後に簡単には変更できないため、利用者に近い場所を選びます。

### 2-2. URLとPublishable Keyを取得

1. 作成したSupabaseプロジェクトを開く
2. 画面上部の `Connect` を押す
3. `Project URL` をコピーする
4. `Publishable key` をコピーする
5. `Publishable key` が表示されない場合は、左下の `Project Settings` → `API Keys` を開く
6. `Publishable key` セクションから `sb_publishable_` で始まる値をコピーする
7. まだPublishable Keyがない場合だけ `Create new API key` で作成する

古いSupabase画面では `Project Settings` → `API` → `Project API keys` に `anon public` キーが表示されます。MapAlbumではこの旧 `anon` キーも使用できますが、新規設定ではPublishable Keyを推奨します。

キーの選び間違い:

| キー | MapAlbumのブラウザーへ設定 | 理由 |
|---|---:|---|
| `sb_publishable_...` | ○ | RLSとユーザーログインを前提に安全に公開できる |
| 旧 `anon` キー | △ | 使用可能だが旧形式 |
| `sb_secret_...` | 絶対に不可 | RLSを迂回できる高権限キー |
| 旧 `service_role` | 絶対に不可 | RLSを迂回できる高権限キー |

### 2-3. Windowsのローカル環境変数へ設定

MapAlbumフォルダーをVisual Studio Codeで開き、PowerShellで次を実行します。

```powershell
Copy-Item .env.example .env.local
code .env.local
```

Visual Studio Codeの `code` コマンドが使えない場合は、エクスプローラーから `.env.local` をメモ帳で開いても構いません。内容を次のように変更します。

```env
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
VITE_VAPID_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- URLの末尾に `/` を追加しない
- 値を引用符で囲まない
- `=` の前後へ空白を入れない
- `.env.local` をGitHub、メール、チャットへ添付しない
- `.env.local` はすでに `.gitignore` の対象

Viteは起動時に環境変数を読み込むため、すでに開発画面が動いている場合は `Ctrl + C` で停止してから再起動します。

```powershell
npm run dev
```

`Supabaseが未設定です` という赤い警告が消えれば、URLとKeyの読み込みは成功です。

### 2-4. SQLを実行してデータベースを作成／更新

> **重要：使用中のSupabaseでは `supabase/schema.sql` を再実行しないでください。**
>
> アルバム、写真、ユーザー、メンバーがすでに存在する環境では、今回追加した
> 機能だけを反映する
> `supabase/migrations/20260725_safe_invite_notifications.sql` を使用します。
> このmigrationは既存行を更新せず、トランザクション途中の失敗時は全体を
> ロールバックします。実行前・実行後の確認SQLも同じファイルに含まれます。
>
> `supabase/schema.sql` を使うのは、データが1件もない新規プロジェクトを
> 最初から構築する場合だけです。

既存環境用migrationをWindowsでクリップボードへコピーする場合:

```powershell
Get-Content .\supabase\migrations\20260725_safe_invite_notifications.sql -Raw | Set-Clipboard
```

#### 新規で空のSupabaseプロジェクトを作る場合だけ

1. Supabase左メニューの `SQL Editor` を開く
2. `New query` を押す
3. MapAlbumフォルダーの `supabase/schema.sql` をVisual Studio Codeで開く
4. ファイル全体を `Ctrl + A` → `Ctrl + C` でコピーする
5. SQL Editorへ貼り付ける
6. 右下または上部の `Run` を1回だけ押す
7. `Success. No rows returned` などの成功表示を確認する

Windows PowerShellからSQL全体をクリップボードへコピーする場合:

```powershell
Get-Content .\supabase\schema.sql -Raw | Set-Clipboard
```

SQL Editorへ戻り、`Ctrl + V` で貼り付けます。

このSQLにより次がまとめて作成されます。

- 8つのアプリ用テーブル
- 各テーブルのRLS有効化と権限ポリシー
- Private Storageバケット `album-photos`
- Storage用RLSポリシー
- owner／admin／member／viewerの権限判定
- 招待、参加申請、承認、権限変更用RPC
- プロフィール作成などのDatabase Trigger
- 写真とメンバー変更用Realtime設定

作成されるテーブル:

- `profiles`
- `albums`
- `album_members`
- `photos`
- `album_invitations`
- `album_join_requests`
- `nearby_invitations`
- `push_subscriptions`

SQL実行後、左メニューの `Table Editor` を開き、上の8テーブルが表示されることを確認します。手動でテーブルや「全員許可」ポリシーを追加する必要はありません。

本番データがある環境の更新には、必ず目的別のmigrationを使用してください。
`supabase/schema.sql` 全体の再実行は行いません。

### 2-5. メール認証を設定

1. Supabase左メニューの `Authentication` を開く
2. `Sign In / Providers` または `Providers` を開く
3. `Email` を選ぶ
4. `Enable Email provider` をONにする
5. `Allow new users to sign up` をONにする
6. `Confirm email` を必ずONにする
7. `Secure email change` もONにする
8. `Save` を押す
9. `Authentication` → `Email Templates` で次のテンプレートを確認する
   - `Confirm signup`
   - `Reset password`
   - `Change email address`

`Confirm email` が有効な場合、新規登録直後にはログインセッションが作成されません。利用者が確認メール内のリンクを開いた後にログイン可能になります。本番運用では無効にしないでください。

Supabase標準メールは開発確認用です。独自SMTPがない状態では、プロジェクトチームに登録されたメールアドレス以外へ送信できない場合があり、送信数にも強い制限があります。本番運用では `Authentication` → `SMTP Settings` またはAuth設定画面の `Custom SMTP` を開き、Resend、Postmark、Amazon SESなどのSMTPを設定してください。

パスワード再設定は、ログイン画面の「パスワードを忘れた場合」から行います。再設定メールのリンクを開くとMapAlbumへ戻り、新しいパスワード入力画面が表示されます。

メールが届かない場合:

1. `Authentication` → `Users` にユーザーが作成されているか確認
2. 迷惑メールフォルダーを確認
3. 独自SMTP未設定なら、テスト先メールをSupabase OrganizationのTeamへ追加
4. `Authentication` のLogsで `Email address not authorized` や送信上限エラーを確認
5. メール追跡によるリンク書き換えを使用している場合は無効化

### 2-6. Googleログインを設定

GoogleログインにはGoogle Cloud ConsoleのOAuth設定が必要です。

1. Supabaseの `Authentication` → `Providers` → `Google` を開いておく
2. 画面に表示される `Callback URL` をコピーする
3. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成または選択する
4. `Google Auth Platform` → `Branding` でアプリ名、サポートメールなどを入力する
5. `Audience` で公開範囲を選ぶ
   - 試験中は `External` とTest usersを設定
   - 一般公開前に必要な公開状態と審査要否を確認
6. `Clients` → `Create Client` を押す
7. Application typeは `Web application`
8. `Authorized JavaScript origins` へ次を追加する

```text
http://localhost:5173
https://mapalbum-japan-2026.noguo22.chatgpt.site
```

9. `Authorized redirect URIs` へSupabase画面からコピーしたCallback URLを追加する
10. Googleが発行したClient IDとClient Secretをコピーする
11. SupabaseのGoogle Provider画面へClient IDとClient Secretを貼り付ける
12. Google ProviderをONにし、`Save` を押す

SupabaseのCallback URLは通常、次の形式です。

```text
https://あなたのプロジェクトID.supabase.co/auth/v1/callback
```

Googleの `Authorized JavaScript origins` には `/` より後のパスや `/**` を付けません。`Authorized redirect URIs` にはMapAlbumの公開URLではなく、必ずSupabaseのCallback URLを登録します。

### 2-7. Appleログインを設定

Web版のAppleログインには有料のApple Developer Programアカウントが必要です。Apple設定が未完了でも、メールとGoogleログインは使用できます。

1. Supabaseの `Authentication` → `Providers` → `Apple` を開いておく
2. [Apple Developer](https://developer.apple.com/account/)の `Certificates, Identifiers & Profiles` を開く
3. `Identifiers` → `App IDs` でApp IDを作成する
4. App IDのCapabilitiesで `Sign in with Apple` をONにする
5. `Identifiers` → `Services IDs` でWeb用Services IDを作成する
   - 例: `com.example.mapalbum.web`
   - このServices IDがSupabaseへ入力するClient IDになる
6. Services IDの `Sign in with Apple` → `Configure` を開く
7. Primary App IDへ手順3のApp IDを関連付ける
8. `Domains and Subdomains` へSupabaseプロジェクトのドメインを登録する

```text
あなたのプロジェクトID.supabase.co
```

9. `Return URLs` へSupabaseのCallback URLを登録する

```text
https://あなたのプロジェクトID.supabase.co/auth/v1/callback
```

10. `Keys` で新しいKeyを作成し、`Sign in with Apple` を有効にする
11. `.p8` ファイルをダウンロードする。再ダウンロードできないため安全に保管する
12. 次の4項目を控える
    - Team ID
    - Key ID
    - Services ID
    - `.p8` の内容
13. [Supabase公式Apple設定ページ](https://supabase.com/docs/guides/auth/social-login/auth-apple)のSecret生成ツールをChromeまたはFirefoxで開く
14. 上の値を使いApple Client Secretを生成する
15. SupabaseのApple Provider画面で次を入力する
    - Client IDs: Services ID。複数ある場合はWeb用Services IDを最初にする
    - Secret Key: 生成したApple Client Secret
16. Apple ProviderをONにし、`Save` を押す

AppleのWeb OAuth用Client Secretは6か月ごとの更新が必要です。期限切れ前に更新する予定を必ず登録してください。Apple OAuthでは氏名が返らない場合があるため、MapAlbumはメールアドレスの先頭部分を表示名の初期値として使用します。

### 2-8. 公開環境の環境変数へ設定

`.env.local` はWindows上の開発用です。公開サイトでは、利用しているホスティングサービスにも同じ3つの環境変数を登録し、登録後に再ビルド／再デプロイします。

Cloudflare Pages:

1. Cloudflare Dashboardで対象Pagesプロジェクトを開く
2. `Settings` → `Variables and Secrets`
3. Productionへ次の3項目を追加する
4. Preview環境も使う場合は同じ値を追加する
5. 新しいDeploymentを実行する

Vercel:

1. Vercelで対象Projectを開く
2. `Settings` → `Environment Variables`
3. Productionへ次の3項目を追加する
4. Preview／Developmentも使う場合は対象へチェックを入れる
5. `Redeploy` を実行する

登録する値:

```text
VITE_SUPABASE_URL = https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY = sb_publishable_xxxxxxxxxxxxxxxxx
VITE_VAPID_PUBLIC_KEY = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Viteの `VITE_` 変数はJavaScriptへ組み込まれるビルド時変数です。変数を追加しただけでは古い公開ファイルは変わらないため、必ず再ビルド／再デプロイしてください。Publishable Keyは公開前提ですが、RLSが安全性を担うため、RLSを無効化してはいけません。

現在のCodex Sites版へ接続する場合も、同じ3値を設定した状態で本番ビルドを作り直す必要があります。VAPID鍵をまだ作っていない場合は、アプリ内通知だけを先に利用できます。

### 2-9. リダイレクトURLを設定

Supabaseの `Authentication` → `URL Configuration` で設定します。

`Site URL` には利用者が通常開く本番URLを設定します。

```text
Site URL:
https://mapalbum-japan-2026.noguo22.chatgpt.site

Redirect URLs:
http://localhost:5173/**
https://mapalbum-japan-2026.noguo22.chatgpt.site/
https://mapalbum-japan-2026.noguo22.chatgpt.site/**
```

Cloudflare Pages、Vercel、独自ドメインへ公開する場合は、実際のURLも追加します。

例:

```text
https://mapalbum.pages.dev/**
https://mapalbum.vercel.app/**
https://あなたの独自ドメイン/**
```

`Site URL` は1つだけです。`Redirect URLs` は複数追加できます。MapAlbumはメール確認、パスワード再設定、Google／Appleログイン、招待リンクのクエリ文字列を使用するため、ローカルと本番の `/**` も登録します。

設定後の確認:

1. `Save` を押す
2. 新しいシークレットウィンドウでMapAlbumを開く
3. 新規登録メールのリンクを開き、MapAlbumへ戻ることを確認する
4. パスワード再設定メールでもMapAlbumへ戻ることを確認する
5. Google／Appleログイン後に `localhost` やSupabase Dashboardへ留まらないことを確認する

OAuthが `redirect_uri_mismatch` になる場合:

- SupabaseのRedirect URLs: ログイン完了後に戻るMapAlbumのURL
- Google／Apple側のCallback／Return URL: `https://PROJECT_REF.supabase.co/auth/v1/callback`

この2種類を入れ替えないでください。

### 2-10. メールアドレス招待を設定（任意）

招待URL、QRコード、招待コードはSQL設定だけで利用できます。画面の「メールアドレスで招待」から実際にメールを送るには、Supabase Edge Functionとメール配信サービスResendを設定します。

1. [Resend](https://resend.com/)でアカウントを作成
2. 独自ドメインを登録してDNS認証を完了
3. Resendの `API Keys` で送信用APIキーを作成
4. MapAlbumフォルダーをPowerShellで開く
5. Supabase CLIへログインしてプロジェクトを接続

```powershell
npx supabase login
npx supabase link --project-ref あなたのSupabaseプロジェクトID
```

6. Edge Functionだけが使用する秘密情報を登録します

```powershell
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
npx supabase secrets set "INVITE_FROM_EMAIL=MapAlbum <invite@認証済みドメイン>"
npx supabase secrets set APP_URL=https://公開したMapAlbumのURL
```

`APP_URL` には `https://` から始まる公開済みMapAlbumのURLを指定し、`?` や `#` は付けません。ローカルだけで試す場合は `http://localhost:5173` も使用できます。FunctionはURLのプロトコルを検証し、招待トークン以外のクエリ文字列をメールへ引き継ぎません。

7. 招待メール用Functionを公開します

```powershell
npx supabase functions deploy send-album-invite
```

`supabase/config.toml` でJWT検証を有効にしています。Function内でもJWTをSupabase Authへ再確認し、招待、送信先メールアドレス、アルバム名を呼び出しユーザー自身の権限で取得します。`album_invitations` のRLSとメンバー権限の二重確認により、ログイン中のオーナーまたは管理者だけが送信できます。

Resend未設定でも、メール招待の作成後に専用招待URLをコピーして手動送信できます。Resendのテスト用ドメインには送信先制限があるため、家族や友だちへ送る本番運用では独自ドメインを認証してください。

招待の流れ:

1. オーナー／管理者が、メール専用URL、共通の招待URL、QRコード、招待コードのいずれかを共有
2. 招待された人がメール確認済みアカウントでログインし「参加を申請」
3. オーナー／管理者の「参加申請とメンバー」に承認待ちとして表示
4. 承認者が `管理者`、`メンバー`、`閲覧のみ` のいずれかを選んで承認
5. 申請者が画面を再読み込みすると、初めてアルバムを閲覧可能

メール専用URLは14日間有効で、招待先とSupabase Authの確認済みメールアドレスが一致する場合だけ申請できます。プロフィール画面のメール文字列を書き換えても一致判定には使われません。共通URL、QRコード、招待コードからの申請は初期状態で「メンバー」ですが、承認時に変更できます。どの方法でも、承認前にアルバムや写真を閲覧することはできません。

### 2-11. RLSポリシーとPrivate Storageを確認

`supabase/schema.sql` は次の防御を設定します。

- `profiles`、`albums`、`album_members`、`photos`、`album_invitations`、`album_join_requests` の全テーブルでRLSを有効化
- `anon` ロールから全テーブル権限を削除
- RLSポリシーの対象を `authenticated` のみに限定
- 同じアルバムに参加していないユーザーのデータを拒否
- メンバー追加は参加承認RPC、権限変更は権限変更RPCだけに限定
- メール招待の一致判定にはSupabase Authの確認済みメールを使用
- `album-photos` StorageバケットをPrivateに固定
- Storageの閲覧・投稿・削除にもアルバム権限を適用し、不正なパス文字列は拒否
- 写真表示には1時間だけ有効な署名付きURLを使用

#### DashboardでRLSを確認

1. Supabase左メニューの `Table Editor` を開く
2. `profiles` を選び、RLSがEnabledになっていることを確認する
3. 残りの5テーブルも同様に確認する
4. `Database` → `Policies` を開く
5. MapAlbumの各テーブルに `authenticated` 向けポリシーが表示されることを確認する
6. `anon` や `public` に対して `true` を返す「全員許可」ポリシーがないことを確認する

RLSのスイッチをONにするだけではデータへアクセスできません。`schema.sql` はRLSと同時に、アルバム所属・役割・投稿者を確認するポリシーと必要最小限のTable Grantを作成します。Dashboardのテンプレートで別のポリシーを追加しないでください。

#### Storage Bucketを確認

`schema.sql` がBucketとStorageポリシーを自動作成します。手動作成は通常不要です。

1. Supabase左メニューの `Storage` を開く
2. Buckets一覧に `album-photos` があることを確認する
3. `album-photos` を開き、`Public bucket` がOFFであることを確認する
4. Bucket設定でファイルサイズ上限が15MB、許可MIME Typeが画像形式になっていることを確認する
5. `Storage` のPolicies画面で次の3種類があることを確認する
   - アルバムメンバーの読取
   - owner／admin／memberの投稿
   - 投稿者本人またはowner／adminの削除

Bucketが見つからない場合でも、既存データがある環境で
`supabase/schema.sql` を再実行しないでください。まずバックアップと現在の
Storage Policyを確認し、名前が小文字の `album-photos`、PublicがOFFのPrivate
Bucketを個別に用意します。今回の安全migrationは既存Storageへ一切触れません。

SQL Editorで次を実行すると、RLSとStorage設定を確認できます。

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'albums',
    'album_members',
    'photos',
    'album_invitations',
    'album_join_requests',
    'nearby_invitations',
    'push_subscriptions'
  )
order by tablename;

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'albums',
    'album_members',
    'photos',
    'album_invitations',
    'album_join_requests',
    'nearby_invitations',
    'push_subscriptions'
  )
group by tablename
order by tablename;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'album-photos';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    coalesce(qual, '') ilike '%album-photos%'
    or coalesce(with_check, '') ilike '%album-photos%'
  )
order by policyname;
```

確認結果:

- 1つ目: 8行すべての `rowsecurity` が `true`
- 2つ目: 8テーブルすべてに1件以上のPolicy
- 3つ目: `album-photos` が1行、`public` が `false`
- 4つ目: MapAlbum用Storage Policyが3件

どれかが不足している場合はそのまま公開しません。空の新規環境だけは
`supabase/schema.sql` の最初のエラーを確認し、既存環境では目的別migrationの
実行結果と実行後確認SQLを確認してください。

確認後、次のテストを行ってください。

1. ログアウト状態でアルバムや写真が表示されない
2. メール登録後、確認メールを開くまではログインできない
3. パスワード再設定メールから新しいパスワードを登録できる
4. GoogleとAppleの両方でログインできる
5. アルバムに参加していない別ユーザーから写真を取得できない
6. 招待リンクを開いても承認前はアルバムを閲覧できない
7. オーナー／管理者だけが申請を承認できる
8. メール専用URLは別メールアドレスのアカウントでは申請できない

### 2-12. Supabase接続チェックリスト

上から順に確認し、すべてにチェックが付いてから家族や友だちを招待してください。

#### プロジェクトとキー

- [ ] Supabaseプロジェクトが作成済みで、Project Overviewを開ける
- [ ] 主な利用者に近いリージョンを選択した
- [ ] Database Passwordを安全な場所へ保管し、`.env.local` へは入れていない
- [ ] Project URLを取得した
- [ ] `sb_publishable_` で始まるPublishable Keyを取得した
- [ ] `sb_secret_`、`service_role` をブラウザー用環境変数へ入れていない

#### 環境変数

- [ ] `.env.local` に `VITE_SUPABASE_URL` を設定した
- [ ] `.env.local` に `VITE_SUPABASE_ANON_KEY` を設定した
- [ ] Pushを使う場合は `.env.local` と本番環境に `VITE_VAPID_PUBLIC_KEY` を設定した
- [ ] URL末尾の余分な `/`、引用符、空白がない
- [ ] 開発サーバーを再起動し、未設定警告が消えた
- [ ] Cloudflare Pages／Vercel／Codex Sitesなど本番環境にも同じ3値を設定した
- [ ] 環境変数設定後に再ビルド／再デプロイした

#### SQL・RLS・Storage

- [ ] 空の新規環境では `supabase/schema.sql` 全体を1回実行した
- [ ] 既存環境では
      `supabase/migrations/20260725_safe_invite_notifications.sql` を使用した
- [ ] `profiles`、`albums`、`album_members`、`photos`、`album_invitations`、`album_join_requests`、`nearby_invitations`、`push_subscriptions` が存在する
- [ ] 8テーブルすべてでRLSがEnabled
- [ ] Policyが `authenticated` とアルバム権限を検証している
- [ ] `anon` 向けの全件許可Policyを追加していない
- [ ] `album-photos` Bucketが存在する
- [ ] `album-photos` のPublicがOFF
- [ ] `storage.objects` に読取・投稿・削除の3つのMapAlbum Policyがある

#### メール認証とURL

- [ ] Email ProviderがEnabled
- [ ] `Allow new users to sign up` がEnabled
- [ ] `Confirm email` がEnabled
- [ ] Confirm signupとReset passwordのEmail Templateを確認した
- [ ] 本番運用ではCustom SMTPを設定した
- [ ] Site URLに本番MapAlbum URLを設定した
- [ ] Redirect URLsへ `http://localhost:5173/**` を追加した
- [ ] Redirect URLsへ本番MapAlbum URLを追加した
- [ ] 確認メールとパスワード再設定メールからMapAlbumへ戻れる

#### Googleログイン

- [ ] Google Auth PlatformでWeb applicationのOAuth Clientを作成した
- [ ] Authorized JavaScript originsへローカルと本番のOriginを追加した
- [ ] Authorized redirect URIsへSupabase Callback URLを追加した
- [ ] Client IDとClient SecretをSupabase Google Providerへ保存した
- [ ] Google ProviderがEnabled
- [ ] Testing状態なら使用するGoogleアカウントをTest usersへ追加した

#### Appleログイン

- [ ] Apple Developer Programへ加入済み
- [ ] Sign in with Appleを有効にしたApp IDがある
- [ ] Web用Services IDがある
- [ ] Services IDのDomainへSupabaseドメインを追加した
- [ ] Return URLへSupabase Callback URLを追加した
- [ ] `.p8`、Team ID、Key IDを安全に保管した
- [ ] Web用Services IDをSupabase Apple Providerの先頭Client IDへ設定した
- [ ] Apple Client Secretを設定してProviderをEnabledにした
- [ ] Client Secret更新用の6か月ごとの予定を登録した

#### 最終動作確認

- [ ] 新しいメールアドレスで登録すると確認メールが届く
- [ ] メール未確認ではログインできない
- [ ] メール確認後にログインできる
- [ ] ログアウト後はアルバムや写真が表示されない
- [ ] GoogleとAppleでログインできる
- [ ] アルバムを作成できる
- [ ] iPhoneから写真を投稿し、Private Storageへ保存される
- [ ] 別ユーザーは承認前にアルバムを閲覧できない
- [ ] viewerは写真を投稿・編集できない

公式資料:

- [Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Auth JavaScript](https://supabase.com/docs/reference/javascript/auth)
- [パスワード再設定](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Googleログイン](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Appleログイン](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Edge Functionの環境変数](https://supabase.com/docs/guides/functions/secrets)

---

## 3. Vercelへ公開する方法

ここでは、Windowsとブラウザだけで管理しやすい「GitHubへ保存し、Vercelと連携する方法」を説明します。一度連携すると、GitHubの本番ブランチへ更新を送るたびにVercelが自動で再デプロイします。

MapAlbumにはVercel用の `vercel.json` が含まれています。次の設定は済んでいます。

- Framework: Vite
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm run build`
- Output Directory: `dist`
- SPAの画面を直接開いたときのリライト
- PWA更新を受け取りやすくするService Workerのキャッシュ設定

### 3-1. 公開前に本番ビルドを確認

MapAlbumフォルダーでPowerShellを開き、次を順番に実行します。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

すべて成功し、最後に `dist` フォルダーが作成されれば公開用ビルドは正常です。

`pnpm` が見つからない場合は、Node.jsをインストールしたあと次を一度実行し、PowerShellを開き直します。

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

### 3-2. GitHubへ保存

1. [GitHub](https://github.com/)でアカウントを作成する
2. 右上の `+` → `New repository` を押す
3. Repository nameを `mapalbum-pwa` などにする
4. 公開したくない場合は `Private` を選ぶ
5. `Create repository` を押す
6. GitHub画面の案内に従ってMapAlbumフォルダーをアップロードする

`.env.local` はアップロードしません。このプロジェクトでは `.gitignore` に登録済みです。Supabaseの値は、後述するVercelのEnvironment Variablesへ登録します。

### 3-3. Vercelへインポート

1. [Vercel](https://vercel.com/)を開く
2. `Continue with GitHub` でログインする
3. `Add New...` → `Project` を押す
4. `Import Git Repository` で `mapalbum-pwa` を探し、`Import` を押す
5. `Configure Project` で次を確認する

```text
Framework Preset: Vite
Root Directory: ./
Install Command: pnpm install --frozen-lockfile
Build Command: pnpm run build
Output Directory: dist
```

通常は `vercel.json` と `pnpm-lock.yaml` から自動設定されます。上記と同じなら変更不要です。

### 3-4. Vercelへ環境変数を設定

最初の `Deploy` を押す前に、`Environment Variables` を開きます。次の3項目を1つずつ追加してください。

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | SupabaseのProject URL。例: `https://abcdefghijklmnop.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_` で始まるPublishable Key |
| `VITE_VAPID_PUBLIC_KEY` | Web Push用のVAPID Public Key。未設定でもアプリ内通知は動作 |

各変数のEnvironmentは、最初は次の3つすべてを選ぶと迷いにくくなります。

- Production
- Preview
- Development

注意:

- `sb_secret_...`、`service_role`、Database Passwordは絶対に登録しない
- URLの末尾へ `/` を追加しない
- 値を引用符で囲まない
- `VITE_SUPABASE_ANON_KEY` という名前ですが、値には新しいPublishable Keyを使用できる
- `VITE_` 変数はビルド時に組み込まれるため、変更後は必ず再デプロイする

プロジェクト作成後に設定する場合は、Vercelの対象Projectを開き、`Settings` → `Environment Variables` から同じ3項目を追加します。追加しただけでは既存Deploymentへ反映されないため、`Deployments` → 最新Deploymentの `…` → `Redeploy` を実行してください。

### 3-5. 最初のデプロイ

1. `Deploy` を押す
2. `Building` が終わるまで待つ
3. `Congratulations!` または `Ready` が表示されることを確認する
4. `Continue to Dashboard` を押す
5. `Domains` に表示された本番URLをコピーする

本番URLの例:

```text
https://mapalbum-pwa.vercel.app
```

表示されたURLはSupabase設定とiPhoneで使用するため、メモ帳へ保存してください。

### 3-6. SupabaseのリダイレクトURLを設定

Vercelへの初回デプロイ後に行います。

1. [Supabase Dashboard](https://supabase.com/dashboard)でMapAlbumプロジェクトを開く
2. `Authentication` → `URL Configuration` を開く
3. `Site URL` をVercelの本番URLへ変更する
4. `Redirect URLs` にローカルURLとVercel本番URLを追加する
5. `Save` を押す

設定例:

```text
Site URL:
https://mapalbum-pwa.vercel.app

Redirect URLs:
http://localhost:5173/**
https://mapalbum-pwa.vercel.app/**
```

`mapalbum-pwa` の部分は、実際にVercelへ表示された名前へ置き換えてください。本番URLはワイルドカードにせず、実際のURLを正確に登録するのが安全です。

Preview Deploymentでもログインを試す場合だけ、Preview URLを個別に追加します。多数のPreview URLを使う場合は、Supabase公式のVercel用パターンも利用できます。

```text
https://*-あなたのVercelチーム名.vercel.app/**
```

Googleログインを使う場合は、Google Cloud ConsoleのOAuth ClientへVercelの本番URLを追加します。

```text
承認済みのJavaScript生成元:
https://mapalbum-pwa.vercel.app

承認済みのリダイレクトURI:
https://PROJECT_REF.supabase.co/auth/v1/callback
```

VercelのURLを「リダイレクトURI」へ入れず、SupabaseのCallback URLと区別してください。

設定後は、Vercel本番URLで次を確認します。

1. 新規登録メールのリンクからVercel版へ戻れる
2. パスワード再設定メールからVercel版へ戻れる
3. Google／Appleログイン後にVercel版へ戻れる
4. ログアウト後にアルバムや写真が表示されない

### 3-7. iPhoneのSafariで開く

1. WindowsでVercelの本番URLをコピーする
2. 自分宛てのメールやメッセージ、QRコードなどでiPhoneへ送る
3. iPhoneでリンクを長押しせず通常どおりタップする
4. Safari以外で開いた場合は、共有メニューから `Safariで開く` を選ぶ
5. Safariのアドレス欄にVercelの本番URLが表示されていることを確認する
6. MapAlbumへログインする
7. 写真追加時にカメラ・写真・位置情報の使用を許可する

位置情報を誤って拒否した場合は、iPhoneの `設定` → `プライバシーとセキュリティ` → `位置情報サービス` → `SafariのWebサイト` から変更できます。

### 3-8. ホーム画面へ追加

1. iPhoneのSafariでVercel本番URLを開く
2. Safariの共有ボタンを押す
3. メニューを下へスクロールし、`ホーム画面に追加` を押す
4. 表示される場合は `Web Appとして開く` をONにする
5. 名前が `MapAlbum` になっていることを確認する
6. 右上の `追加` を押す
7. ホーム画面のMapAlbumアイコンから起動する

`ホーム画面に追加` が見つからない場合は、共有メニュー最下部の `アクションを編集` から追加します。

### 3-9. アプリを更新して再デプロイ

GitHub連携を使う場合:

1. Windowsでコードを更新する
2. `pnpm typecheck` を実行する
3. `pnpm build` を実行する
4. 更新したファイルをGitHubの本番ブランチ（通常は `main`）へ送る
5. Vercelの `Deployments` で新しいDeploymentが `Ready` になるまで待つ
6. 本番URLを開き、更新を確認する

本番ブランチへの更新は自動的にProduction Deploymentになります。別ブランチやPull RequestはPreview Deploymentになります。

環境変数だけを変更した場合:

1. Vercelの対象Projectを開く
2. `Settings` → `Environment Variables` で値を変更する
3. `Deployments` を開く
4. 最新Deployment右側の `…` → `Redeploy`
5. `Ready` になったらログインを確認する

PWAは更新を自動確認します。ホーム画面版がすぐに変わらない場合は、MapAlbumを一度完全に閉じて開き直します。それでも変わらない場合はSafariで本番URLを開き、再読み込みしてからホーム画面版を開き直してください。

### 3-10. Vercel公開チェックリスト

- [ ] `pnpm typecheck` がエラー0で終了した
- [ ] `pnpm build` が成功し、`dist` が作成された
- [ ] GitHubへ `.env.local` をアップロードしていない
- [ ] VercelのFramework Presetが `Vite`
- [ ] Build Commandが `pnpm run build`
- [ ] Output Directoryが `dist`
- [ ] `VITE_SUPABASE_URL` を設定した
- [ ] `VITE_SUPABASE_ANON_KEY` にPublishable Keyを設定した
- [ ] Secret Keyや`service_role`を設定していない
- [ ] 環境変数を設定後にデプロイまたはRedeployした
- [ ] SupabaseのSite URLをVercel本番URLへ設定した
- [ ] SupabaseのRedirect URLsへVercel本番URLを追加した
- [ ] 新規登録・メール確認・ログイン・ログアウトを確認した
- [ ] パスワード再設定後にVercel版へ戻れる
- [ ] Google／Appleログイン後にVercel版へ戻れる
- [ ] iPhone Safariでカメラ・写真・位置情報を許可できた
- [ ] ホーム画面からMapAlbumを単独起動できた

公式資料:

- [Vercel: Viteの公開とSPAリライト](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel: Development／Preview／Production](https://vercel.com/docs/deployments/environments)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Apple: SafariのWebサイトをホーム画面へ追加](https://support.apple.com/guide/iphone/iphea86e5236/ios)

### 補足: Cloudflare Pagesへ公開する場合

Cloudflare Pagesを使う場合もBuild Commandは `pnpm run build`、Build output directoryは `dist` です。ProductionのEnvironment Variablesへ `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定し、公開URLをSupabaseのSite URL／Redirect URLsへ登録してください。

---

## 4. iPhone／iPadのホーム画面へ追加

PWAのインストールにはSafariを使います。

1. iPhoneまたはiPadで公開したMapAlbumのURLをSafariで開く
2. Safari下部または上部の共有ボタン（四角から上向き矢印）を押す
3. メニューを下へスクロール
4. `ホーム画面に追加` を押す
5. 名前が `MapAlbum` になっていることを確認
6. 右上の `追加` を押す

ホーム画面にMapAlbumアイコンが追加されます。以後はアイコンから全画面で起動できます。

`ホーム画面に追加` が見つからない場合:

- ChromeではなくSafariで開く
- Safariの共有メニューで `アクションを編集` を押す
- プライベートブラウズを解除する

### カメラ・位置情報

写真追加時にSafariまたはMapAlbumが確認を表示したら、次を許可してください。

- カメラ: 写真撮影に使用
- 写真: 選んだ写真だけを読み込む
- 位置情報: 撮影場所の自動設定に使用

位置情報を拒否した場合でも、投稿画面の地図をタップして手動指定できます。

---

## オフライン機能について

PWAは次のデータを端末へキャッシュします。

- アプリ画面
- 一度表示した写真
- 最近取得したアルバムと写真情報
- 一度表示したOpenStreetMapの地図タイル

オフライン時にできること:

- 保存済みの写真一覧を見る
- 保存済み写真の詳細を見る
- 一度表示した地図範囲を見る
- 検索と地図／一覧切り替え

オフライン閲覧にも保存済みのログインセッションが必要です。ログアウトすると、Private写真、アルバム情報、署名付きURLの端末キャッシュを削除します。共有端末では利用後に必ずログアウトしてください。

オンライン接続が必要な操作:

- ログイン
- 新しい写真の投稿
- 編集・削除
- 新しい場所の地図読み込み
- メンバー招待、参加申請、承認

日本全体の地図を最初から端末へ保存するものではありません。一度表示した範囲が順次キャッシュされます。

---

## 権限

| 操作 | オーナー | 管理者 | メンバー | 閲覧のみ |
|---|---:|---:|---:|---:|
| アルバム・写真閲覧 | ○ | ○ | ○ | ○ |
| 写真投稿 | ○ | ○ | ○ | × |
| 自分の写真編集 | ○ | ○ | ○ | × |
| 自分が投稿した写真の削除 | ○ | ○ | ○ | ○ |
| 他人の写真編集・削除 | ○ | ○ | × | × |
| 招待・参加承認・権限変更 | ○ | ○ | × | × |
| アルバム設定 | ○ | ○ | × | × |
| アルバム削除 | ○ | × | × | × |

オーナーはアルバム作成者に固定され、別の権限へ変更できません。権限は画面表示だけでなく、SupabaseのRLS、RPC、Storageポリシーでも検証されます。

---

## フォルダー構成

```text
MapAlbumPWA/
├─ public/                 PWAアイコン、Cloudflare設定
├─ scripts/                アイコン生成
├─ src/
│  ├─ components/          画面部品
│  ├─ lib/                 Supabase、写真、GPS、キャッシュ
│  ├─ App.tsx              アプリ全体
│  ├─ main.tsx             起動処理
│  ├─ styles.css           Apple風UI・ダークモード
│  └─ types.ts             データ型
├─ supabase/
│  ├─ functions/           招待メール用Edge Function
│  ├─ config.toml          FunctionのJWT検証設定
│  └─ schema.sql           DB・Storage・RLS・承認処理
├─ .env.example
├─ index.html
├─ package.json
├─ vercel.json
└─ vite.config.ts
```

---

## 将来App Storeへ公開する場合

このPWAはReactの画面とSupabase処理をブラウザーAPIから分離しているため、将来はCapacitorでiOSアプリへ包むことができます。

移行の流れ:

1. `@capacitor/core` と `@capacitor/ios` を追加
2. カメラと位置情報をCapacitorプラグインへ切り替え
3. Macのクラウドビルドサービス、またはMac環境でiOSビルド
4. App Store Connectへ提出

PWAとして使う段階ではMacやXcodeは不要です。App Storeへの最終提出だけはAppleの署名・審査手続きが必要になります。

---

## セキュリティ上の注意

- `.env.local` をメールやGitHubで公開しない
- `service_role` キーをブラウザーへ設定しない
- SupabaseのRLSを無効にしない
- Email Providerの `Confirm email` を無効にしない
- Apple Client Secretを6か月ごとに更新する
- Supabase Authの本番メール送信には独自SMTPを設定する
- 不要になったメンバーはアルバムから削除する
- 正確な緯度経度がメンバーへ共有されることを利用者へ説明する
- Supabase Dashboardから定期的にデータベースのバックアップ設定を確認する

---

## テスト結果（2026年7月25日）

今回の確認では、ローカルの自動テスト、RLS／Storage SQLの静的検査、Production Build、ローカルProduction Previewの画面操作を実施しました。

### 実行結果

```text
pnpm test
Test Files  16 passed (16)
Tests       67 passed (67)

pnpm typecheck
TypeScript errors: 0

pnpm lint
ESLint errors: 0
ESLint warnings: 0

pnpm build
Build: success
Build warnings: 0
PWA service worker: generated

Production Preview
Console errors: 0
Console warnings: 0
```

ローカルProduction Previewでは、ログイン、新規登録、パスワード再設定の各画面、Supabase未設定時の警告と認証ボタン無効化を実ブラウザーで確認しました。未ログイン状態ではアルバム、写真、地図、設定画面はDOM上にも表示されません。Google／Apple OAuth、写真のStorage保存とDB登録、写真一覧、共有URL／QR、ログアウト時のPrivate Cache削除も自動テストで確認しています。

### 項目別結果

| 順番 | テスト項目 | 自動／静的テスト | 実Supabase・実機E2E | 確認内容 |
|---:|---|---|---|---|
| 1 | 新規登録 | 合格 | 環境設定後に要確認 | 表示名、メール、8文字以上のパスワード、`signUp`、確認メール戻り先 |
| 2 | メール認証 | 合格 | メール配送は要確認 | Confirm email前提、確認案内、招待URLを保ったRedirect URL |
| 3 | ログイン | 合格 | 環境設定後に要確認 | メール＋パスワード送信、セッション確立前のデータ非表示 |
| 4 | ログアウト | 合格 | 環境設定後に要確認 | `signOut`、PrivateなIndexedDB／写真Cache削除 |
| 5 | パスワード再設定 | 合格 | メール配送は要確認 | 再設定メール要求、8文字以上、一致確認、更新後のローカルログアウト |
| 6 | アルバム作成 | 合格 | DB接続後に要確認 | 前後空白除去、作成コールバック、DB triggerによる作成者のowner登録 |
| 7 | 写真アップロード | 合格 | iPhone実機で要確認 | 写真選択、EXIF読取、GPS fallback、保存値、Private StorageとRLS |
| 8 | 位置情報取得 | 合格 | iPhone Safariで要確認 | 高精度GPS設定、取得成功、非対応エラー、緯度経度範囲検証 |
| 9 | 地図表示 | 合格 | 実機で最終確認推奨 | OpenStreetMap、丸い写真アイコン、カテゴリー、枚数、タップ動作 |
| 10 | 招待URL発行 | 合格 | DB接続後に要確認 | 汎用URL、メール専用URL、QR値、サブパス維持、参加承認制 |
| 11 | 権限別制限 | 合格 | 4アカウント実接続は要確認 | owner／admin／member／viewerのUI判定、RLS、RPC、Storage policy |
| 12 | 未ログインで非表示 | 合格 | Supabase REST直アクセスは要確認 | クライアント非表示、全8テーブルRLS、anon権限取消、Private bucket |

`実Supabase・実機E2E` が「要確認」の項目は、実メールアドレス、実データベース、
iPhoneのカメラ／GPSを使う確認が必要な項目です。既存環境では
`supabase/migrations/20260725_safe_invite_notifications.sql` を適用し、
環境変数を設定してから確認してください。

### 今回修正した不具合

- Viteの単一JavaScriptファイルが大きく、Production Buildにサイズ警告が出る問題
- React／TypeScriptプロジェクトにNext.js用ESLint設定が残り、Lintを実行できない問題
- 写真一覧、Google／Apple OAuth、Storage失敗時ロールバックの回帰テスト不足
- 写真削除後に詳細画面の選択位置が範囲外になる可能性
- 招待メール件名に制御文字を含められる問題
- 写真を選び直した際に、前の写真のEXIF位置・撮影日時が残る問題
- 先に選んだ写真の非同期EXIF結果が、後から選んだ写真を上書きする競合
- 60m以内の写真が鎖状に連結され、離れた地点まで1グループになる問題
- 権限変更・参加承認が開いたままの画面へ反映されない問題
- RLSで更新・削除が0件でも成功メッセージを表示する問題
- member／viewerがアルバムの招待コードをDBから取得できる問題
- 招待URLがサブパス配信で壊れる問題
- 日本語カテゴリー名で検索できない問題
- `createImageBitmap` が使えない写真環境に変換fallbackがない問題
- 招待の取消／期限切れ後でも既存申請を承認できる問題
- 写真の投稿者名とStorageパスをクライアントだけに依存していた問題

### 実環境での最終E2E手順

1. 既存環境ではSQL Editorで
   `supabase/migrations/20260725_safe_invite_notifications.sql` を実行する
2. Confirm emailを有効にし、公開URLとローカルURLをRedirect URLsへ登録する
3. 公開環境へ `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定する

## 近くの人を探す（Geolocation + Realtime Presence）

設定画面の「近くの人を探す」は初期状態ではOFFです。利用者がONへ
切り替えたときだけ位置情報の許可を求め、アプリが前面にある間だけ検索します。
Bluetoothとバックグラウンド追跡は使用しません。

Presenceへ送る値は、緯度・経度を小数4桁相当の整数へ丸めた値と更新時刻だけです。
位置情報をアプリのテーブルへ保存しません。相手の画面には座標や距離を表示せず、
100m以内かつ5分以内に更新された相手だけを
「近くに〇〇さんがいます」と表示します。OFF、ログアウト、ページ終了、
バックグラウンド移行時はGeolocationの監視とPresenceを解除します。

近くの人への招待は次の順序です。

1. オーナーまたは管理者が「招待する」を押す
2. 相手の設定画面へ5分間有効な招待を表示する
3. 相手が「受け取る」を押した場合だけ、通常の参加申請を作成する
4. オーナーまたは管理者が参加申請を承認して、初めてメンバーになる

検出しただけで自動参加することはありません。位置情報を拒否した場合は、
既存のQRコード、招待URL、招待コードを利用できます。

### Supabaseへ追加設定を反映する

この機能を既存環境へ追加する場合は、Supabase Dashboardの `SQL Editor` で
`supabase/migrations/20260725_safe_invite_notifications.sql` を
実行してください。次の設定が追加されます。

- `nearby_invitations` テーブルとRLS
- 近距離招待の作成・受諾・辞退RPC
- `realtime.messages` のPrivate Channel用Authorization Policy
- `nearby_invitations` のRealtime publication
- 未ログインユーザーの全アクセス拒否

Supabase Dashboardの `Realtime` 設定でRealtimeが有効であることも確認してください。
クライアントは `nearby-users` をPrivate Channelとして接続します。
Publishable Key以外のキーをPWAへ設定しないでください。

### 2ユーザーでの確認

1. iPhone Safariと別のiPhone／iPadで、別アカウントへログインする
2. 両端末で設定画面の「近くの人を探す」をONにして位置情報を許可する
3. 端末を100m以内に置き、オーナー側に「近くに〇〇さんがいます」が出ることを確認
4. 「招待する」を押し、相手側で「受け取る」を押す
5. オーナー側の参加申請管理で承認するまで相手が参加しないことを確認
6. 相手側でOFFまたはログアウトし、オーナー側の候補から消えることを確認
7. 位置情報を拒否した端末でQR・URL・招待コードの案内が出ることを確認

ホーム画面へ追加したPWAでも同じ手順で確認します。位置情報を以前拒否した場合は、
iPhoneの `設定` → `プライバシーとセキュリティ` → `位置情報サービス` から
SafariまたはMapAlbumの許可を変更してください。

## 地図ライセンス表示

地図右下に `Leaflet | © OpenStreetMap contributors` を常時表示します。
表示は削除せず、文字リンクだけをタップ可能にしています。半透明背景、約10pxの
文字、Safe Area対応の余白を使い、ズームボタンは右上へ移動して重なりを防ぎます。
4. owner、admin、member、viewer用に確認済みメールの4アカウントを用意する
5. 上表の1から12までを順番に実行する
6. iPhone Safariで写真撮影、GPS許可／拒否、ホーム画面起動、オフライン再表示を確認する
7. ブラウザーのNetworkまたはSupabase RESTから、未ログイン／権限不足の直接操作が401または403になることを確認する

---

## 参加申請・Push通知・アルバム別招待の最終設定

この章は、参加申請のアプリ内通知だけでなく、ホーム画面へ追加したPWAへの
Web Push通知まで有効にするための手順です。既存環境では先に
`supabase/migrations/20260725_safe_invite_notifications.sql` を
SQL Editorで実行してください。これにより次が追加・更新されます。

- `albums.owner_id`。既存行は変更せず、権限判定では従来の
  `created_by` も引き続きオーナーとして扱う
- アルバム別の招待コード、有効／無効、有効期限、一般メンバーの招待許可
- ユーザー別のPrivateな `push_subscriptions`
- 参加申請を一度だけ承認するトランザクションRPC
- オーナー／管理者だけが他人の参加申請を閲覧できるRLS
- 一般メンバーが招待できるかをアルバム単位で判定するRPC

### アプリ内通知の動き

アプリ内通知には追加の通知許可は不要です。

1. 参加者が招待URL、QR、または招待コードから「参加を申請」を押す
2. `album_join_requests` へ `pending` で保存される
3. アプリを開いているオーナー／管理者がSupabase Realtimeで即時受信する
4. 「〇〇さんから『アルバム名』への参加申請が届きました」と表示される
5. 「申請を見る」で対象アルバムの申請管理画面が直接開く

同じ申請IDは端末内へ既読として保存するため、画面復帰のたびに同じポップアップを
繰り返しません。未処理件数は右上の人＋アイコンと共有画面上部へ表示されます。

### Web Push用のVAPID鍵を作る

Windows PowerShellでプロジェクトフォルダーを開き、次を実行します。

```powershell
npx web-push generate-vapid-keys
```

`Public Key` と `Private Key` が表示されます。

- Public KeyはVercelの `VITE_VAPID_PUBLIC_KEY` へ設定
- Public KeyはSupabaseの `VAPID_PUBLIC_KEY` にも設定
- Private KeyはSupabaseの `VAPID_PRIVATE_KEY` だけへ設定
- Private Keyを `VITE_` で始まる変数、GitHub、READMEへ絶対に保存しない

Webhook用のランダムな秘密文字列も作成します。

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

表示された値を後述の `JOIN_REQUEST_WEBHOOK_SECRET` とWebhook Headerの両方へ、
同じ文字列で設定します。

### Supabase Edge Functionを公開する

PowerShellで次を順番に実行します。`YOUR_PROJECT_REF` はProject URLの
`https://` と `.supabase.co` の間の文字列です。

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy send-join-request-push --no-verify-jwt
```

続いてSecretを設定します。値は自分のものへ置き換え、引用符のまま貼り付けないでください。

```powershell
npx supabase secrets set VAPID_SUBJECT=mailto:YOUR_EMAIL
npx supabase secrets set VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
npx supabase secrets set VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
npx supabase secrets set APP_ORIGIN=https://mapalbum-japan-2026.vercel.app
npx supabase secrets set JOIN_REQUEST_WEBHOOK_SECRET=YOUR_RANDOM_WEBHOOK_SECRET
```

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` はSupabase Edge Functionへ標準で
提供されます。これらをVercelやPWAへ設定しないでください。

### Database Webhookを1つ作る

1. Supabase Dashboardで `Database` → `Webhooks` を開く
2. `Create a new hook` を押す
3. Nameを `send-join-request-push` にする
4. Tableを `public.album_join_requests` にする
5. Eventsは `Insert` だけをONにする
6. Typeは `Supabase Edge Functions` を選ぶ
7. Functionは `send-join-request-push` を選ぶ
8. HTTP Headerを追加する
9. Header名を `x-mapalbum-webhook-secret` にする
10. 値を `JOIN_REQUEST_WEBHOOK_SECRET` と同じ文字列にする
11. 保存する

Edge FunctionはWebhookの秘密文字列を検証し、対象アルバムのowner／adminだけを
サーバー側で検索します。Service Role Keyはサーバー内だけで使われ、ブラウザーへ
送信されません。無効になったPush購読は404／410応答時に自動削除されます。

### VercelへPushのPublic Keyを設定する

1. VercelでMapAlbum Projectを開く
2. `Settings` → `Environment Variables` を開く
3. Nameへ `VITE_VAPID_PUBLIC_KEY` を入力
4. ValueへVAPIDのPublic Keyを入力
5. Production、Preview、Developmentを選択
6. `Save` を押す
7. `Deployments` → 最新Deploymentの `…` → `Redeploy` を押す

Viteの環境変数はビルド時に入るため、保存しただけでは既存Deploymentへ反映されません。

### iPhoneで通知をONにする

1. iPhoneのSafariで `https://mapalbum-japan-2026.vercel.app` を開く
2. Safariの共有ボタンを押す
3. `ホーム画面に追加` を押す
4. ホーム画面のMapAlbumアイコンから起動する
5. ログインする
6. 右上のプロフィールを押して設定を開く
7. `参加申請の通知を受け取る` をONにする
8. iPhoneの確認画面で `許可` を押す

通知許可はこのスイッチをONにした時だけ要求されます。SafariタブでPushを利用できない
場合でも、アプリを開いている間のRealtimeポップアップは必ず動作します。通知をタップ
すると、対象アルバムの申請管理画面を開きます。ログアウト時は端末購読を解除し、
Supabaseの購読行も削除します。

### 申請者側の操作

1. オーナーから招待URL、QR、または招待コードを受け取る
2. MapAlbumへログインし、メール認証を完了する
3. URL／QRなら開いた後、招待コードなら `アルバム` → `招待コードで申請` を開く
4. `参加を申請` を押す
5. `参加申請を送りました。オーナーの承認をお待ちください` を確認する
6. 承認後はRealtimeでアルバム一覧へ即時追加される

同じユーザーが同じアルバムへ複数のpending申請を作ることは、Unique IndexとRPCの
両方で防止しています。拒否された場合はアルバムへ参加しません。

### オーナー／管理者の承認方法

1. 新規申請のポップアップで `申請を見る` を押す
2. または右上の赤い件数バッジ付き人＋を押す
3. 共有画面の最上部にある `参加申請 〇件` を押す
4. 表示名、メール、申請日時、対象アルバム、希望権限を確認する
5. `閲覧のみ`、`メンバー`、`管理者` から承認後の権限を選ぶ
6. `承認` または `拒否` を押す

承認RPCは対象申請を行ロックし、pendingであることを再確認してから
`album_members` 追加とstatus更新を同じトランザクションで実行します。
連打や別端末からの二重承認でも二重登録されません。

### 近くの人を探す方法

1. 2人とも別アカウントでログインする
2. 2人ともアプリを前面で開く
3. 2人とも設定の `近くの人を探す` をONにする
4. 位置情報を許可する
5. 最後の更新から5分以内、100m以内なら `近くに〇〇さんがいます` と表示される
6. 招待する側がアルバムを選び、`このアルバムへ招待` を押す
7. 相手が `受け取る` を押す
8. オーナー／管理者が通常の参加申請を承認する

Presenceへ送るのは、丸めた座標、user ID、表示名、更新時刻だけです。緯度経度を
アプリDBへ保存せず、相手画面へ座標や距離を表示しません。OFF、ログアウト、
ページ終了、バックグラウンド移行、Realtime切断時にPresenceから消えます。
位置情報拒否、15秒のタイムアウト、GPS精度200m超、オフラインは画面へ理由を表示し、
QR・URL・招待コードへ案内します。

### アルバムごとの招待方法

1. 招待したいアルバムを選ぶ
2. 右上の人＋を押す
3. 画面上部で対象アルバム名を確認する
4. URL共有、QR、招待コード、メール招待から選ぶ
5. オーナー／管理者は `このアルバムの招待設定` で期限を設定する
6. 必要な場合だけ `一般メンバーの招待を許可` をONにする
7. 漏えい時は `古いコードを無効化して再発行` を押す

招待コードはDB全体でUniqueです。再発行すると同じアルバムの旧コードは即時無効に
なります。アルバムAのコード／tokenはアルバムAのIDへサーバー側で結び付くため、
アルバムBの参加には使えません。一般メンバーの招待許可は初期OFFで、閲覧のみの
ユーザーは常に招待できません。

### 公開前チェックリスト

- [ ] 既存環境では
      `supabase/migrations/20260725_safe_invite_notifications.sql` を実行した
- [ ] `albums.owner_id` と `push_subscriptions` が存在する
- [ ] 8つのアプリテーブルでRLSがEnabled
- [ ] `album_join_requests` がRealtime publicationへ追加済み
- [ ] `send-join-request-push` Edge FunctionをDeployした
- [ ] Edge Functionへ5つのSecretを設定した
- [ ] `album_join_requests` Insert Webhookを作成した
- [ ] Webhook HeaderとSecretが完全一致する
- [ ] Vercelへ `VITE_VAPID_PUBLIC_KEY` を設定してRedeployした
- [ ] iPhoneではホーム画面のMapAlbumから通知をONにした
- [ ] 別々の2アカウントで申請、承認、拒否を確認した
- [ ] 100m以内／5分以内の近距離検出とOFF後の消去を確認した
