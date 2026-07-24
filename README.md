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
- 招待コード・QRコード・共有リンクによる参加
- 管理者、編集者、閲覧者の権限
- 管理者によるメンバー権限の変更
- iPhone／Androidからの写真撮影
- 写真ライブラリからの選択
- 写真EXIFまたは端末GPSによる撮影位置取得
- 地図をタップした位置調整
- 丸い写真サムネイルとカテゴリーアイコン
- 60m以内にある写真の枚数付きまとめ表示
- 地図／写真一覧切り替え
- コメント、投稿者、カテゴリーの検索
- 写真の編集・削除
- 投稿者本人または管理者だけが削除可能
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

Supabaseが認証、アルバムデータ、メンバー権限、写真ファイルを管理します。

### 2-1. Supabaseプロジェクトを作成

1. [Supabase](https://supabase.com/)を開く
2. アカウントを作成してログイン
3. `New project` を押す
4. プロジェクト名、データベースパスワード、リージョンを設定
5. 日本向けの場合はTokyoに近いリージョンを選択
6. プロジェクト作成が完了するまで待つ

データベースパスワードは安全な場所へ保管してください。アプリの `.env` には入力しません。

### 2-2. データベースを作成

1. Supabase左メニューの `SQL Editor` を開く
2. `New query` を押す
3. `supabase/schema.sql` の内容をすべてコピー
4. SQL Editorへ貼り付ける
5. `Run` を1回押す

このSQLにより次が作成されます。

- `profiles`
- `albums`
- `album_members`
- `photos`
- 非公開Storageバケット `album-photos`
- 権限を守るRLSポリシー
- 招待コード参加用の関数
- 写真更新用Realtime設定

SQLを複数回実行しても主要なテーブルとポリシーは作り直せる構成です。

### 2-3. メールログインを設定

1. Supabase左メニューの `Authentication` → `Providers` を開く
2. `Email` を有効にする
3. `Confirm email` を必ず有効にする
4. `Secure email change` も有効にする
5. `Authentication` → `Email Templates` で次のメールを確認する
   - `Confirm signup`
   - `Reset password`
   - `Change email address`

`Confirm email` が有効な場合、新規登録直後にはログインセッションが作成されません。利用者が確認メール内のリンクを開いた後にログイン可能になります。本番運用では無効にしないでください。

Supabase標準のメール送信は開発・試験向けの制限があります。本番運用では `Project Settings` → `Auth` → `SMTP Settings` で独自SMTPを設定してください。

パスワード再設定は、ログイン画面の「パスワードを忘れた場合」から行います。再設定メールのリンクを開くとMapAlbumへ戻り、新しいパスワード入力画面が表示されます。

### 2-4. Googleログインを設定

GoogleログインにはGoogle Cloud ConsoleのOAuth設定が必要です。

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. `APIとサービス` → `OAuth同意画面` を設定
3. `認証情報` → `OAuthクライアントID` を作成
4. アプリケーションの種類は `ウェブアプリケーション`
5. SupabaseのGoogle Provider画面に表示されるCallback URLを、Google側の「承認済みのリダイレクトURI」へ追加
6. Googleが発行したClient IDとClient SecretをSupabaseへ入力
7. Supabaseの `Authentication` → `Providers` → `Google` を有効化

SupabaseのCallback URLは通常、次の形式です。

```text
https://あなたのプロジェクトID.supabase.co/auth/v1/callback
```

公開URLはGoogle Cloud Consoleの「承認済みのJavaScript生成元」にも追加してください。

### 2-5. Appleログインを設定

Web版のAppleログインにはApple Developer Programのアカウントが必要です。

1. [Apple Developer](https://developer.apple.com/account/)の `Certificates, Identifiers & Profiles` を開く
2. `Identifiers` でApp IDを作成し、`Sign in with Apple` Capabilityを有効にする
3. Web用のServices IDを作成する
4. Services IDの `Sign in with Apple` 設定で、Primary App IDを関連付ける
5. Website DomainへSupabaseプロジェクトのドメインを登録する

```text
あなたのプロジェクトID.supabase.co
```

6. Return URLへSupabaseのCallback URLを登録する

```text
https://あなたのプロジェクトID.supabase.co/auth/v1/callback
```

7. Apple Developerの `Keys` でSign in with Apple用キーを作り、`.p8` ファイルを安全に保存する
8. Team ID、Key ID、Services ID、`.p8`を使ってApple Client Secretを生成する
9. Supabaseの `Authentication` → `Providers` → `Apple` を開く
10. Services IDをClient IDとして入力し、生成したSecretを入力して有効化する

AppleのWeb OAuth用Client Secretは6か月ごとの更新が必要です。期限切れ前に更新する予定を必ず登録してください。Apple OAuthでは氏名が返らない場合があるため、MapAlbumはメールアドレスの先頭部分を表示名の初期値として使用します。

### 2-6. アプリへSupabase接続情報を設定

Supabaseで `Project Settings` → `Data API` または `API` を開き、次を確認します。

- Project URL
- anon / publishable key

`service_role` キーはブラウザーアプリへ絶対に入力しないでください。

MapAlbumフォルダーで `.env.example` をコピーして `.env.local` を作成します。

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

`.env.local` をVisual Studio Codeで開き、次のように変更します。

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ここにanonまたはpublishableキー
```

開発画面を再起動します。

```powershell
npm run dev
```

ログイン画面からユーザー登録できれば接続完了です。

### 2-7. 認証URLを設定

Supabaseの `Authentication` → `URL Configuration` で設定します。

開発時:

```text
Site URL:
http://localhost:5173

Redirect URLs:
http://localhost:5173/**
```

公開後はCloudflare PagesまたはVercelのURLも追加します。

例:

```text
https://mapalbum.pages.dev/**
https://mapalbum.vercel.app/**
https://あなたの独自ドメイン/**
```

Email Verification、パスワード再設定、Googleログイン、Appleログインはすべてこの許可リストを使用します。ログイン後に別の画面へ移動する場合は、このURL設定を最初に確認してください。

### 2-8. RLSとPrivate Storageを確認

`supabase/schema.sql` は次の防御を設定します。

- `profiles`、`albums`、`album_members`、`photos` の全テーブルでRLSを有効化
- `anon` ロールから全テーブル権限を削除
- RLSポリシーの対象を `authenticated` のみに限定
- 同じアルバムに参加していないユーザーのデータを拒否
- `album-photos` StorageバケットをPrivateに固定
- Storageの閲覧・投稿・削除にもアルバム権限を適用
- 写真表示には1時間だけ有効な署名付きURLを使用

SQL Editorで次を実行すると、RLSとStorage設定を確認できます。

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select id, name, public
from storage.buckets
where id = 'album-photos';
```

`profiles`、`albums`、`album_members`、`photos` の `rowsecurity` がすべて `true`、`album-photos` の `public` が `false` なら正しく設定されています。

確認後、次のテストを行ってください。

1. ログアウト状態でアルバムや写真が表示されない
2. メール登録後、確認メールを開くまではログインできない
3. パスワード再設定メールから新しいパスワードを登録できる
4. GoogleとAppleの両方でログインできる
5. アルバムに参加していない別ユーザーから写真を取得できない

公式資料:

- [Supabase Auth JavaScript](https://supabase.com/docs/reference/javascript/auth)
- [パスワード再設定](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Googleログイン](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Appleログイン](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)

---

## 3. デプロイ方法

公開前にWindowsでビルドを確認します。

```powershell
npm run build
```

成功すると `dist` フォルダーができます。

環境変数はデプロイ先にも設定してください。`.env.local` は安全のためアップロードされません。

### 方法A: Cloudflare Pages

#### GitHubを使う方法

1. MapAlbumをGitHubの非公開リポジトリへ保存
2. [Cloudflare Dashboard](https://dash.cloudflare.com/)へログイン
3. `Workers & Pages` → `Create` → `Pages`
4. `Connect to Git` でMapAlbumのリポジトリを選択
5. Build commandへ次を入力

```text
npm run build
```

6. Build output directoryへ次を入力

```text
dist
```

7. Environment variablesへ次の2つを追加

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

8. `Save and Deploy` を押す

#### GitHubを使わない方法

1. Windowsで `npm run build`
2. Cloudflare PagesのDirect Uploadを選択
3. `dist` フォルダーをアップロード

更新のたびに `npm run build` と再アップロードが必要です。

### 方法B: Vercel

#### Vercelの画面から公開

1. MapAlbumをGitHubへ保存
2. [Vercel](https://vercel.com/)へログイン
3. `Add New` → `Project`
4. MapAlbumリポジトリを選択
5. Framework Presetは `Vite`
6. Build Commandは `npm run build`
7. Output Directoryは `dist`
8. Environment Variablesへ次を追加

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

9. `Deploy` を押す

このプロジェクトにはSPA表示用の `vercel.json` が含まれています。

### 公開後に必ず行うこと

公開URLをSupabaseの次の場所へ追加します。

```text
Authentication → URL Configuration → Redirect URLs
```

Google Cloud Consoleを使っている場合は、公開ドメインをOAuthの「承認済みのJavaScript生成元」にも追加します。

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
- メンバー招待と参加

日本全体の地図を最初から端末へ保存するものではありません。一度表示した範囲が順次キャッシュされます。

---

## 権限

| 操作 | 管理者 | 編集者 | 閲覧者 |
|---|---:|---:|---:|
| アルバム閲覧 | ○ | ○ | ○ |
| 写真閲覧 | ○ | ○ | ○ |
| 写真投稿 | ○ | ○ | × |
| 自分の写真編集・削除 | ○ | ○ | × |
| 他人の写真編集・削除 | ○ | × | × |
| アルバム設定 | ○ | × | × |

権限は画面表示だけでなく、SupabaseのRLSとStorageポリシーでも検証されます。

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
│  └─ schema.sql           DB・Storage・権限設定
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
