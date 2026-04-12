const OpenSubtitles = require('opensubtitles.com');
const axios = require('axios');
const fs = require('fs').promises;
require('dotenv').config();

const os = new OpenSubtitles({
    apikey: process.env.OPENSUBTITLES_API_KEY,
    useragent: 'stremio-translate-subtitle-by-geanpn v1.0.0'
});

// グローバルなトークン変数を保持
let authToken = null;

const login = async () => {
    try {
        console.log('[login] Attempting to log in to OpenSubtitles...');
        const loginInfo = await os.login({
            username: process.env.OPENSUBTITLES_USERNAME,
            password: process.env.OPENSUBTITLES_PASSWORD
        });
        if (loginInfo && loginInfo.token) {
            authToken = loginInfo.token;
            console.log('[login] Login successful. Token stored.');
            return authToken;
        } else {
            throw new Error('Login failed, no token received.');
        }
    } catch (error) {
        console.error('[login] Login error:', error.message);
        authToken = null; // エラー時はトークンをクリア
        throw error; // エラーを再スローして呼び出し元に伝える
    }
};

const downloadSubtitles = async (subtitleFiles, imdbid, season = null, episode = null, oldisocode) => {
    console.log(`[downloadSubtitles] Start downloading subtitles for imdbid: ${imdbid}, season: ${season}, episode: ${episode}`);
    console.log(`[downloadSubtitles] Received subtitle files:`, subtitleFiles);

    if (!authToken) {
        console.error('[downloadSubtitles] Not logged in. Cannot download subtitles.');
        // 必要であればここで再度ログインを試みるか、エラーを投げる
        await login(); 
        if (!authToken) return []; // 再ログイン失敗
    }

    let uniqueTempFolder = null;
    if (season && episode) {
        await fs.mkdir(`subtitles/${oldisocode}/${imdbid}/season${season}`, { recursive: true });
        uniqueTempFolder = `subtitles/${oldisocode}/${imdbid}/season${season}`;
    } else {
        await fs.mkdir(`subtitles/${oldisocode}/${imdbid}`, { recursive: true });
        uniqueTempFolder = `subtitles/${oldisocode}/${imdbid}`;
    }
    console.log(`[downloadSubtitles] Created temporary folder: ${uniqueTempFolder}`);

    let filepaths = [];

    for (let i = 0; i < subtitleFiles.length; i++) {
        const fileInfo = subtitleFiles[i];
        try {
            console.log(`[downloadSubtitles] Requesting download link for file_id: ${fileInfo.file_id}`);
            const downloadInfo = await os.download({ file_id: fileInfo.file_id }, { token: authToken });
            
            if (!downloadInfo.link) {
                throw new Error('No download link found in the response.');
            }

            console.log(`[downloadSubtitles] Downloading from URL: ${downloadInfo.link}`);
            const response = await axios.get(downloadInfo.link, { responseType: "arraybuffer" });

            let filePath = `${uniqueTempFolder}/${imdbid}-subtitle_${episode || 'movie'}-${i + 1}.srt`;
            
            await fs.writeFile(filePath, response.data);
            console.log(`[downloadSubtitles] Subtitle downloaded and saved to: ${filePath}`);
            filepaths.push(filePath);
        } catch (error) {
            console.error(`[downloadSubtitles] Error downloading file_id ${fileInfo.file_id}:`, error.message);
        }
    }
    console.log(`[downloadSubtitles] Finished downloading. Saved file paths:`, filepaths);
    return filepaths;
};

const getsubtitles = async (type, imdbid, season = null, episode = null, newisocode) => {
    console.log(`[getsubtitles] Searching for subtitles with params:`, { type, imdbid, season, episode, newisocode });
    try {
        // ログイン処理（トークンがなければログインする）
        if (!authToken) {
            await login();
        }

        const searchParams = {
            imdb_id: imdbid,
            languages: 'en'
        };

        if (type === 'series') {
            searchParams.season_number = season;
            searchParams.episode_number = episode;
        }

        console.log('[getsubtitles] Searching subtitles with params:', searchParams);
        const response = await os.subtitles(searchParams, { token: authToken });

        if (response.data && response.data.length > 0) {
            console.log(`[getsubtitles] Found ${response.data.length} English subtitles.`);
            const files = response.data.map(sub => sub.attributes.files).flat();
            console.log('[getsubtitles] Extracted subtitle files:', files);
            return files.slice(0, 1);
        }
        
        console.log('[getsubtitles] No English subtitles found for the given criteria.');
        return null;
    } catch (error) {
        console.error('[getsubtitles] An error occurred during subtitle search:', error.message);
        // ログインエラーなどでトークンが無効になった可能性があるのでクリア
        if (error.response && error.response.status === 401) {
            authToken = null;
        }
        throw error;
    }
};

module.exports = { getsubtitles, downloadSubtitles };