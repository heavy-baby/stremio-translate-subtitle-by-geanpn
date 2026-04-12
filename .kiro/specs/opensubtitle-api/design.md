## **詳細設計書：`opensubtitles.com` を利用した字幕ダウンロード機能の改修**

### 1. 概要

本ドキュメントは、`opensubtitles.js`の改修に関する詳細な設計を定義する。古い`opensubtitles-api`ライブラリが非推奨となったため、新しい`opensubtitles.com`ライブラリへ移行する。

### 2. 改修対象

- `opensubtitles.js`

### 3. 使用ライブラリ

| ライブラリ | 目的 |
| :--- | :--- |
| `opensubtitles.com` | OpenSubtitles.comの新しいREST APIとの連携 |
| `axios` | 字幕ファイルのダウンロード |
| `fs.promises` | ファイルシステムへの字幕保存 |
| `dotenv` | 環境変数の読み込み |

### 4. 設計詳細

#### 4.1. 環境変数

`.env`ファイルに以下の変数を追加し、APIキーとユーザー情報を管理する。

- `OPENSUBTITLES_API_KEY`: OpenSubtitles.comから発行されたAPIキー
- `OPENSUBTITLES_USERNAME`: OpenSubtitles.comのユーザー名
- `OPENSUBTITLES_PASSWORD`: OpenSubtitles.comのパスワード

#### 4.2. `getsubtitles`関数

**責務:** IMDb ID、シーズン、エピソード番号を基に、英語の字幕を検索し、ダウンロードに必要な情報（`file_id`など）を含むオブジェクトの配列を返す。

**処理フロー:**

1.  `opensubtitles.com`をインポートし、環境変数から取得したAPIキーとUser-Agentでクライアントを初期化する。
2.  `login`メソッドにユーザー名とパスワードを渡し、認証トークンを取得する。
3.  `subtitles`メソッドを以下のパラメータで呼び出し、字幕を検索する。
    *   `imdb_id`: 映画・ドラマのIMDb ID (例: `tt0848228`)
    *   `season_number`: シーズン番号
    *   `episode_number`: エピソード番号
    *   `languages`: `'en'`（英語）
4.  検索結果（レスポンス）を検証する。
    *   `data`プロパティが存在し、1件以上の字幕情報があることを確認する。
    *   存在しない場合は`null`を返す。
5.  検索結果の中から、ダウンロードに必要な情報を含むオブジェクトを抽出し、配列として返す。

#### 4.3. `downloadSubtitles`関数

**責務:** `getsubtitles`から渡された字幕情報（`file_id`を含む）を基に、字幕ファイルをダウンロードし、指定されたパスに保存する。

**処理フロー:**

1.  引数で渡された字幕情報の配列をループ処理する。
2.  各字幕情報から`file_id`を取得する。
3.  `download`メソッドに`file_id`を渡して、字幕のダウンロードリンクを取得する。この際、`login`で取得したトークンが必要となる。
4.  取得したリンクに対して`axios.get`を実行し、字幕ファイルをダウンロードする。
5.  ダウンロードした字幕データを、既存の命名規則に従ってファイルに保存する。
6.  保存したファイルパスの配列を返す。

#### 4.4. エラーハンドリング

- `getsubtitles`関数内:
    - `try...catch`ブロックを使用し、APIからのエラー（認証失敗など）を捕捉する。
    - エラーが発生した場合は、コンソールにエラーメッセージを出力し、例外を再スローする。
- `downloadSubtitles`関数内:
    - `try...catch`ブロックを使用し、ダウンロード時のエラーを捕捉する。
    - エラーが発生した場合は、コンソールにエラーメッセージを出力し、例外を再スローする。

### 5. コード構成（イメージ）

```javascript
const OpenSubtitles = require('opensubtitles.com');
const axios = require('axios');
const fs = require('fs').promises;
require('dotenv').config();

const os = new OpenSubtitles({
    apikey: process.env.OPENSUBTITLES_API_KEY,
    useragent: 'stremio-translate-subtitle-by-geanpn'
});

const downloadSubtitles = async (subtitles, imdbid, season = null, episode = null, oldisocode) => {
    // ... os.download() と axios によるダウンロード処理 ...
};

const getsubtitles = async (type, imdbid, season = null, episode = null, newisocode) => {
    try {
        const loginInfo = await os.login({
            username: process.env.OPENSUBTITLES_USERNAME,
            password: process.env.OPENSUBTITLES_PASSWORD
        });

        const response = await os.subtitles({
            imdb_id: imdbid,
            season_number: season,
            episode_number: episode,
            languages: 'en'
        });

        if (response.data && response.data.length > 0) {
            // 最初の字幕のファイルIDを返す例
            return response.data.map(sub => sub.attributes.files[0]); 
        }
        return null;
    } catch (error) {
        console.error('Subtitle search error:', error);
        throw error;
    }
};

module.exports = { getsubtitles, downloadSubtitles };
```
