# Quick Tunnel 接続仕様

- GitHub Pages 起動時に BASE_URL 下の `config.json` を `cache: no-store` で取得する。
- `apiBaseUrl` は完全な HTTPS URL。認証情報・クエリ・フラグメントを拒否する。
- 本番で欠落・不正な設定は画面にエラーを表示し、旧リバプロには接続しない。
- 開発モードでは従来のローカル接続設定を使う。
- Pages ワークフローは `workflow_dispatch` の `api_base_url` を優先し、未指定時にリポジトリ変数 `QUICK_TUNNEL_URL` を使う。生成ファイルはコミットしない。
- ワークスペースの `reverse-proxy/scripts/quick-tunnels.py` が Docker 起動・URL 取得・変数更新・Pages デプロイを行う。
- Quick Tunnel 再起動で URL が変わるため、設定の再生成と Pages デプロイが必要。

## WebSocket

トンネルの接続先は `footsies-server:3001`。HTTP `/` がヘルスチェック。画面は `apiBaseUrl` の `https:` を `wss:` に変換する。リレーは `https://reisun.github.io`、localhost/127.0.0.1 のポート 5173、追加の `WS_ALLOWED_ORIGINS` を許可する。Origin がない非ブラウザクライアントも利用可能。ホスト側ポートは 127.0.0.1 のみで公開する。

## Dockerコンテナ名

- `footsies-dojo-websocket-relay-1`: オンライン対戦のWebSocket中継サーバー（HTTP `/` はヘルスチェック）。
- `footsies-dojo-quick-tunnel-1`: 中継サーバーを公開するcloudflared。

両方ともcontainer_nameを指定し、Composeファイルの親ディレクトリ名に依存しない名前にする。Docker内の接続先service名は引き続き `footsies-server:3001`。
