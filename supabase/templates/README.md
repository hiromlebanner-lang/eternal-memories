# Supabase認証メール設定

Supabase Dashboardの「Authentication → Email Templates」で、次の件名とHTMLを設定します。

| 種類 | 件名 | HTML |
| --- | --- | --- |
| Confirm signup | 【Eternal memories】メールアドレス確認のお願い | `confirmation.html` |
| Reset password | 【Eternal memories】パスワード再設定のご案内 | `recovery.html` |
| Change email address | 【Eternal memories】メールアドレス変更の確認 | `email_change.html` |
| Invite user | 【Eternal memories】Eternal memoriesへの招待 | `invite.html` |
| Password changed | 【Eternal memories】パスワード変更完了のお知らせ | `password_changed_notification.html` |
| Email address changed | 【Eternal memories】メールアドレス変更完了のお知らせ | `email_changed_notification.html` |

「Password changed」と「Email address changed」はSecurity notificationsで有効化します。

本番URL設定:

- Site URL: `https://mapalbum-japan-2026.vercel.app`
- Redirect URL: `https://mapalbum-japan-2026.vercel.app/**`
- ローカル確認が必要な場合のみ、利用する開発URL（例: `http://localhost:5173/**`）をRedirect URLsへ追加

送信元には認証済みの実在ドメインを使用してください。公式ドメインが未認証の間は、架空の送信元を設定しません。
