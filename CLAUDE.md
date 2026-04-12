# Project Overview (日本語)

これはOpenSubtitlesから字幕を自動的にユーザーが指定した言語に翻訳するStremioアドオンです。Node.jsで作成されており、Stremioとの統合には`stremio-addon-sdk`を使用しています。

このアドオンはOpenSubtitlesから字幕を取得し、Google TranslateまたはChatGPT互換のAPIを使用して翻訳を行います。複数の翻訳リクエストを処理するためのキュー、翻訳された字幕のキャッシュ、翻訳プロバイダのフォールバック機構などの機能があります。

## 主な技術

*   **バックエンド:** Node.js
*   **Stremio連携:** `stremio-addon-sdk`
*   **翻訳:**
    *   `google-translate-api-browser` (Google Translate用)
    *   `openai` (ChatGPT互換API用)
*   **キュー処理:** `better-queue`
*   **データベース:** `sqlite3`および`mysql2` (キャッシュと字幕管理用)

## アーキテクチャ

1.  **アドオンの初期化:** `index.js`ファイルは、`stremio-addon-sdk`の`addonBuilder`を使用してStremioアドオンを初期化します。アドオンの設定（翻訳プロバイダの選択、対象言語など）を定義します。
2.  **字幕の処理:** `defineSubtitlesHandler`関数はアドオンの中心です。ユーザーがStremioで字幕を要求するとこの関数が起動します。
3.  **データベースとのやり取り:** アドオンは、ローカルデータベース(SQLiteまたはMySQL)をチェックし、翻訳済みの字幕が既に存在するかどうかを確認します。
4.  **OpenSubtitlesとの連携:** キャッシュされた翻訳が見つからない場合、アドオンは`opensubtitles.js`モジュールを使用してOpenSubtitlesから字幕を取得します。
5.  **翻訳キュー:** 取得された字幕は、`queues/translationQueue.js`にある`better-queue`で管理される翻訳キューにプッシュされます。
6.  **翻訳プロバイダ:** `translateProvider.js`モジュールが、Google TranslateまたはChatGPT互換のAPIを使用して実際の翻訳を実行し、信頼性を高めるためリトライロジックを備えています。
7.  **字幕の保存:** 翻訳された字幕はローカルファイルシステムに保存されます。

# ビルドと実行

## 前提条件

*   Node.jsとnpm

## インストールと実行方法

1.  **リポジトリをクローンする:** ```bash git clone https://github.com/HimAndRobot/stremio-translate-subtitle-by-geanpn.git cd stremio-translate-subtitle-by-geanpn ```

2.  **依存関係をインストールする:** ```bash npm install ```

3.  **必要なディレクトリを作成する:** ```bash mkdir -p debug subtitles ```

4.  **`.env`ファイルを作成する:** `.env.example`ファイルを`.env`にコピーし、環境変数を設定します。 ```bash cp .env.example .env ```

5.  **アドオンを起動する:** ```bash npm start ``` アドオンは`http://localhost:3000`で実行されます。

## テスト

`package.json`には定義された特定のテストはありません。

# 開発規約

*   コードはモジュール構造をとっており、異なった機能が別のファイルに分かれています (例: `opensubtitles.js`, `translateProvider.js`, `connection.js`)。
*   プロジェクトは環境変数の管理に`dotenv`を使用しています。
*   コードはJavaScriptで書かれています。
*   プロジェクトは依存関係やスクリプトの管理に`package.json`ファイルを使用しています。