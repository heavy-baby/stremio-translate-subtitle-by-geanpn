/**
 * Required dependencies
 */
const opensubtitles = require("./opensubtitles");
const connection = require("./connection");
const fs = require("fs").promises;
const { translateText } = require("./translateProvider");
const { createOrUpdateMessageSub } = require("./subtitles");

class SubtitleProcessor {
  constructor() {
    this.subcounts = [];
    this.timecodes = [];
    this.texts = [];
    this.translatedSubtitle = [];
    this.count = 0;
    this.outputFilePath = null;
    this.totalTexts = 0;
  }

  // Build SRT content from current state
  _buildSrtContent() {
    const output = [];
    for (let i = 0; i < this.subcounts.length; i++) {
      const text = this.translatedSubtitle[i] || "[translating...]";
      output.push(
        this.subcounts[i],
        this.timecodes[i],
        text,
        ""
      );
    }
    return output.join("\n");
  }

  // Save progress incrementally
  async _saveProgress() {
    if (!this.outputFilePath) return;
    const content = this._buildSrtContent();
    await fs.writeFile(this.outputFilePath, content, { encoding: "utf-8" });
    const translatedCount = this.translatedSubtitle.length;
    const percent = Math.round((translatedCount / this.totalTexts) * 100);
    console.log(`[Progress] Saved to file: ${translatedCount}/${this.totalTexts} (${percent}%)`);
  }

  async processSubtitles(
    filepath,
    imdbid,
    season = null,
    episode = null,
    oldisocode,
    provider,
    apikey,
    base_url,
    model_name
  ) {
    try {
      const originalSubtitleFilePath = filepath[0];
      const originalSubtitleContent = await fs.readFile(
        originalSubtitleFilePath,
        { encoding: "utf-8" }
      );
      const lines = originalSubtitleContent.split("\n");

      const batchSize = provider === "ChatGPT API" ? 10 : 20;
      let subtitleBatch = [];
      let currentBlock = {
        iscount: true,
        istimecode: false,
        istext: false,
        textcount: 0,
      };

      // Process subtitle file line by line
      for (const line of lines) {
        if (line.trim() === "") {
          currentBlock = {
            iscount: true,
            istimecode: false,
            istext: false,
            textcount: 0,
          };
          continue;
        }

        if (currentBlock.iscount) {
          this.subcounts.push(line);
          currentBlock = {
            iscount: false,
            istimecode: true,
            istext: false,
            textcount: 0,
          };
          continue;
        }

        if (currentBlock.istimecode) {
          this.timecodes.push(line);
          currentBlock = {
            iscount: false,
            istimecode: false,
            istext: true,
            textcount: 0,
          };
          continue;
        }

        if (currentBlock.istext) {
          if (currentBlock.textcount === 0) {
            this.texts.push(line);
          } else {
            this.texts[this.texts.length - 1] += "\n" + line;
          }
          currentBlock.textcount++;
        }
      }

      // Build subtitle batch from parsed texts (after full parsing)
      subtitleBatch = [...this.texts];
      this.totalTexts = subtitleBatch.length;

      // Create output file path early for incremental saving
      const dirPath =
        season !== null && episode !== null
          ? `subtitles/${provider}/${oldisocode}/${imdbid}/season${season}`
          : `subtitles/${provider}/${oldisocode}/${imdbid}`;
      await fs.mkdir(dirPath, { recursive: true });

      this.outputFilePath =
        season && episode
          ? `${dirPath}/${imdbid}-translated-${episode}-1.srt`
          : `${dirPath}/${imdbid}-translated-1.srt`;

      // Create initial file with placeholder
      await this._saveProgress();
      console.log(`[Progress] Initial file created: ${this.outputFilePath}`);

      // Translate in chunks
      for (let i = 0; i < subtitleBatch.length; i += batchSize) {
        const chunk = subtitleBatch.slice(i, i + batchSize);
        console.log(`Translating batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} texts`);
        try {
          await this.translateBatch(
            chunk,
            oldisocode,
            provider,
            apikey,
            base_url,
            model_name
          );
        } catch (error) {
          console.error("Batch translation error: ", error);
          throw error;
        }
        // Add delay between batches to avoid rate limits
        if (i + batchSize < subtitleBatch.length) {
          const delay = provider === "ChatGPT API" ? 500 : 1000;
          console.log(`[Rate Limit] Waiting ${delay / 1000}s before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // Subtitles already saved incrementally. Just register to DB.
      try {
        const type = season && episode ? "series" : "movie";
        if (!(await connection.checkseries(imdbid))) {
          await connection.addseries(imdbid, type);
        }
        console.log(`Subtitles saved and registered: ${this.outputFilePath}`);
      } catch (error) {
        console.error("Error saving translated subtitles:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error:", error.message);
      throw error;
    }
  }

  async translateBatch(
    subtitleBatch,
    oldisocode,
    provider,
    apikey,
    base_url,
    model_name
  ) {
    try {
      const translations = await translateText(
        subtitleBatch,
        oldisocode,
        provider,
        apikey,
        base_url,
        model_name
      );

      translations.forEach((translatedText) => {
        this.translatedSubtitle.push(translatedText);
      });

      console.log(`Batch translation completed (${this.translatedSubtitle.length} total)`);

      // Save progress to file after each batch
      await this._saveProgress();
    } catch (error) {
      console.error("Batch translation error:", error);
      throw error;
    }
  }

  async saveTranslatedSubs(
    imdbid,
    season = null,
    episode = null,
    oldisocode,
    provider
  ) {
    try {
      // Define directory path based on content type and provider
      const dirPath =
        season !== null && episode !== null
          ? `subtitles/${provider}/${oldisocode}/${imdbid}/season${season}`
          : `subtitles/${provider}/${oldisocode}/${imdbid}`;

      // Create directory if it doesn't exist
      await fs.mkdir(dirPath, { recursive: true });

      // Create file path and determine content type
      const type = season && episode ? "series" : "movie";
      const newSubtitleFilePath =
        season && episode
          ? `${dirPath}/${imdbid}-translated-${episode}-1.srt`
          : `${dirPath}/${imdbid}-translated-1.srt`;

      // Build subtitle content
      const output = [];
      for (let i = 0; i < this.subcounts.length; i++) {
        output.push(
          this.subcounts[i],
          this.timecodes[i],
          this.translatedSubtitle[i],
          ""
        );
      }

      // Save file and update database
      await fs.writeFile(newSubtitleFilePath, output.join("\n"), { flag: "w" });

      if (!(await connection.checkseries(imdbid))) {
        await connection.addseries(imdbid, type);
      }

      console.log(
        `Subtitle translation and saving completed: ${newSubtitleFilePath}`
      );
    } catch (error) {
      console.error("Error saving translated subtitles:", error);
      throw error;
    }
  }
}

/**
 * Starts the subtitle translation process
 * @param {Object[]} subtitles - Array of subtitle objects to translate
 * @param {string} imdbid - IMDB ID of the media
 * @param {string|null} season - Season number (optional)
 * @param {string|null} episode - Episode number (optional)
 * @param {string} oldisocode - ISO code of the original language
 * @returns {Promise<boolean>} - Returns true on success, false otherwise
 */
async function startTranslation(
  subtitles,
  imdbid,
  season = null,
  episode = null,
  oldisocode,
  provider,
  apikey,
  base_url,
  model_name
) {
  try {
    const processor = new SubtitleProcessor();
    let filepaths = await opensubtitles.downloadSubtitles(
      subtitles,
      imdbid,
      season,
      episode,
      oldisocode
    );

    if (filepaths && filepaths.length > 0) {
      await connection.addToTranslationQueue(
        imdbid,
        season,
        episode,
        filepaths.length,
        oldisocode,
        provider,
        apikey
      );
      await processor.processSubtitles(
        filepaths,
        imdbid,
        season,
        episode,
        oldisocode,
        provider,
        apikey,
        base_url,
        model_name
      );
      await connection.deletetranslationQueue(
        imdbid,
        season,
        episode,
        oldisocode
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error("General catch error:", error);
    return false;
  }
}

module.exports = { startTranslation };
