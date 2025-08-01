const {
  addonBuilder,
  serveHTTP,
  publishToCentral,
} = require("stremio-addon-sdk");
const opensubtitles = require("./opensubtitles");
const connection = require("./connection");
const languages = require("./languages");
const { createOrUpdateMessageSub } = require("./subtitles");
const translationQueue = require("./queues/translationQueue");
const baseLanguages = require("./langs/base.lang.json");
require("dotenv").config();

function generateSubtitleUrl(
  targetLanguage,
  imdbid,
  season,
  episode,
  provider,
  baseUrl = process.env.BASE_URL
) {
  return `${baseUrl}/subtitles/${provider}/${targetLanguage}/${imdbid}/season${season}/${imdbid}-translated-${episode}-1.srt`;
}

const builder = new addonBuilder({
  id: "org.autotranslate.geanpn",
  version: "1.0.2",
  name: "Auto Subtitle Translate by geanpn",
  logo: "./subtitles/logo.webp",
  configurable: true,
  behaviorHints: {
    configurable: true,
    configurationRequired: true,
  },
  config: [
    {
      key: "provider",
      title: "Provider",
      type: "select",
      required: true,
      options: ["Google Translate", "ChatGPT API"],
    },
    {
      key: "apikey",
      title: "ChatGPT API Key",
      type: "text",
      required: false,
      dependencies: [
        {
          key: "provider",
          value: ["ChatGPT API"],
        },
      ],
    },
    {
      key: "base_url",
      title: "ChatGPT API Base URL",
      type: "text",
      required: false,
      default: "https://api.openai.com/v1/responses",
      dependencies: [
        {
          key: "provider",
          value: ["ChatGPT API"],
        },
      ],
    },
    {
      key: "model_name",
      title: "ChatGPT API Model Name",
      type: "text",
      required: false,
      default: "gpt-4o-mini",
      dependencies: [
        {
          key: "provider",
          value: ["ChatGPT API"],
        },
      ],
    },
    {
      key: "translateto",
      title: "Translate to",
      type: "select",
      required: true,
      default: "English",
      options: baseLanguages,
    },
  ],
  description:
    "This addon takes subtitles from OpenSubtitlesV3 then translates into desired language using Google Translate, or ChatGPT (OpenAI Compatible Providers). For donations:in progress Bug report: geanpn@gmail.com",
  types: ["series", "movie"],
  catalogs: [],
  resources: ["subtitles"],
});

const axios = require("axios");

builder.defineSubtitlesHandler(async function (args) {
  console.log("Subtitle request received:", args);
  const { id, config, stream } = args;

  const targetLanguage = languages.getKeyFromValue(
    config.translateto,
    config.provider
  );

  if (!targetLanguage) {
    console.log("Unsupported language:", config.translateto);
    return Promise.resolve({ subtitles: [] });
  }

  // Extract imdbid from id
  let imdbid = null;
  if (id.startsWith("dcool-")) {
    imdbid = "tt5994346";
  } else if (id !== null && id.startsWith("tt")) {
    const parts = id.split(":");
    if (parts.length >= 1) {
      imdbid = parts[0];
    } else {
      console.log("Invalid ID format.");
    }
  }

  if (imdbid === null) {
    console.log("Invalid ID format.");
    return Promise.resolve({ subtitles: [] });
  }

  const { type, season = null, episode = null } = parseId(id);

  try {
    // 1. Check if already exists in database
    const existingSubtitle = await connection.getsubtitles(
      imdbid,
      season,
      episode,
      targetLanguage
    );

    if (existingSubtitle.length > 0) {
      console.log(
        "Subtitle found in database:",
        generateSubtitleUrl(
          targetLanguage,
          imdbid,
          season,
          episode,
          config.provider
        )
      );
      return Promise.resolve({
        subtitles: [
          {
            id: `${imdbid}-subtitle`,
            url: generateSubtitleUrl(
              targetLanguage,
              imdbid,
              season,
              episode,
              config.provider
            ),
            lang: `${targetLanguage}-translated`,
          },
        ],
      });
    }

    // Process embedded subtitles
    if (stream && stream.subtitles && stream.subtitles.length > 0) {
      console.log("Embedded subtitles found:", stream.subtitles);
      const embeddedSubtitle = stream.subtitles[0]; // Use the first embedded subtitle
      const srtContent = await downloadSrt(embeddedSubtitle.url);
      const parsedSubs = parseSrtContent(srtContent);

      if (parsedSubs && parsedSubs.length > 0) {
        await createOrUpdateMessageSub(
          "Translating embedded subtitles. Please wait 1 minutes and try again.",
          imdbid,
          season,
          episode,
          targetLanguage,
          config.provider
        );

        translationQueue.push({
          subs: parsedSubs,
          imdbid: imdbid,
          season: season,
          episode: episode,
          oldisocode: targetLanguage,
          provider: config.provider,
          apikey: config.apikey ?? null,
          base_url: config.base_url ?? "https://api.openai.com/v1/responses",
          model_name: config.model_name ?? "gpt-4o-mini",
        });

        console.log(
          "Embedded subtitles processed",
          generateSubtitleUrl(
            targetLanguage,
            imdbid,
            season,
            episode,
            config.provider
          )
        );

        await connection.addsubtitle(
          imdbid,
          type,
          season,
          episode,
          generateSubtitleUrl(
            targetLanguage,
            imdbid,
            season,
            episode,
            config.provider
          ).replace(`${process.env.BASE_URL}/`, ""),
          targetLanguage
        );

        return Promise.resolve({
          subtitles: [
            {
              id: `${imdbid}-subtitle`,
              url: generateSubtitleUrl(
                targetLanguage,
                imdbid,
                season,
                episode,
                config.provider
              ),
              lang: `${targetLanguage}-translated`,
            },
          ],
        });
      }
    }

    // 2. If not found, search OpenSubtitles
    const subs = await opensubtitles.getsubtitles(
      type,
      imdbid,
      season,
      episode,
      targetLanguage
    );
    if (!subs || subs.length === 0) {
      await createOrUpdateMessageSub(
        "No subtitles found on OpenSubtitles",
        imdbid,
        season,
        episode,
        targetLanguage,
        config.provider
      );
      return Promise.resolve({
        subtitles: [
          {
            id: `${imdbid}-subtitle`,
            url: generateSubtitleUrl(
              targetLanguage,
              imdbid,
              season,
              episode,
              config.provider
            ),
            lang: `${targetLanguage}-translated`,
          },
        ],
      });
    }

    console.log("Subtitles found on OpenSubtitles");

    await createOrUpdateMessageSub(
      "Translating subtitles. Please wait 1 minutes and try again.",
      imdbid,
      season,
      episode,
      targetLanguage,
      config.provider
    );

    // 3. Process and translate subtitles
    translationQueue.push({
      subs: subs,
      imdbid: imdbid,
      season: season,
      episode: episode,
      oldisocode: targetLanguage,
      provider: config.provider,
      apikey: config.apikey ?? null,
      base_url: config.base_url ?? "https://api.openai.com/v1/responses",
      model_name: config.model_name ?? "gpt-4o-mini",
    });

    console.log(
      "Subtitles processed",
      generateSubtitleUrl(
        targetLanguage,
        imdbid,
        season,
        episode,
        config.provider
      )
    );

    await connection.addsubtitle(
      imdbid,
      type,
      season,
      episode,
      generateSubtitleUrl(
        targetLanguage,
        imdbid,
        season,
        episode,
        config.provider
      ).replace(`${process.env.BASE_URL}/`, ""),
      targetLanguage
    );

    return Promise.resolve({
      subtitles: [
        {
          id: `${imdbid}-subtitle`,
          url: generateSubtitleUrl(
            targetLanguage,
            imdbid,
            season,
            episode,
            config.provider
          ),
          lang: `${targetLanguage}-translated`,
        },
      ],
    });
  } catch (error) {
    console.error("Error processing subtitles:", error);
    return Promise.resolve({ subtitles: [] });
  }
});

// Helper function to download SRT file
async function downloadSrt(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("SRT file download error:", error);
    throw error;
  }
}

// Helper function to parse SRT content
function parseSrtContent(srtContent) {
  const subtitles = [];
  const lines = srtContent.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    const index = parseInt(lines[i++]);
    const timeMatch = lines[i++].match(
      /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) {
      continue;
    }
    const startTime = timeMatch[1];
    const endTime = timeMatch[2];
    let text = "";
    while (i < lines.length && lines[i].trim() !== "") {
      text += lines[i++] + "\n";
    }
    subtitles.push({
      number: index,
      startTime: startTime,
      endTime: endTime,
      text: text.trim(),
    });
  }
  return subtitles;
}

function parseId(id) {
  if (id.startsWith("tt")) {
    const match = id.match(/tt(\d+):(\d+):(\d+)/);
    if (match) {
      const [, , season, episode] = match;
      return {
        type: "series",
        season: Number(season),
        episode: Number(episode),
      };
    } else {
      return { type: "movie", season: 1, episode: 1 };
    }
  } else if (id.startsWith("dcool-")) {
    // New format: dcool-tomorrow-with-you::tomorrow-with-you-episode-1
    const match = id.match(/dcool-(.+)::(.+)-episode-(\d+)/);
    if (match) {
      const [, , title, episode] = match;
      return {
        type: "series",
        title: title,
        episode: Number(episode),
        season: 1, // Assuming season 1 for this format
      };
    }
  }
  return { type: "unknown", season: 0, episode: 0 };
}

// Comment out this line for local execution, uncomment for production deployment
// Cannot publish to central locally as there is no public IP, so it won't show up in the Stremio store

if (process.env.PUBLISH_IN_STREMIO_STORE == "TRUE") {
  publishToCentral(`http://${process.env.ADDRESS}/manifest.json`);
}

const port = process.env.PORT || 3000;
const address = process.env.ADDRESS || "0.0.0.0";

serveHTTP(builder.getInterface(), {
  cacheMaxAge: 10,
  port: port,
  address: address,
  static: "/subtitles",
})
  .then(() => {
    console.log(`Server started: http://${address}:${port}`);
    console.log(
      "Manifest available:",
      `http://${address}:${port}/manifest.json`
    );
  })
  .catch((error) => {
    console.error("Server startup error:", error);
  });
