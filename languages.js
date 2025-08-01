const googleLanguages = require("./langs/translateGoogleFree.lang.json");
const chatgptLanguages = require("./langs/translateChatGpt.lang.json");

function getValueFromKey(key) {
  return data[key];
}

function getKeyFromValue(value, provider) {
  switch (provider) {
    case "Google Translate":
      data = googleLanguages;
      break;
    case "ChatGPT API":
      return value;
    default:
      throw new Error("Provider not found");
  }

  for (let key in data) {
    if (data[key] === value) {
      return key;
    }
  }
  return null;
}

function getAllValues() {
  return Object.values(data);
}

module.exports = {
  getAllValues,
  getKeyFromValue,
  getValueFromKey,
};
