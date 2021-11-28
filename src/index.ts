import axios, { AxiosRequestConfig } from "axios";
import { blue, bold, enable, green, red } from "colors";
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import { Embed, Mascot, OnlineType, WebhookMessage } from "types";
import { format, promisify } from "util";

namespace Logger {
  export const log = (message?: any, ...optionalParams: any[]) =>
    console.log(
      blue(new Date().toLocaleString("sv")),
      format(message, ...optionalParams)
    );
  export const error = (message?: any, ...optionalParams: any[]) =>
    console.error(
      red(new Date().toLocaleString("sv")),
      format(message, ...optionalParams)
    );
}

const { API_KEY, SPREADSHEET_ID, WEBHOOK_LINK } = process.env;
if (!API_KEY || !SPREADSHEET_ID || !WEBHOOK_LINK) {
  Logger.log("Please fill in the every environment variable before running!");
  process.exit(1);
}

const sleep = promisify(setTimeout);

process.on("beforeExit", (code) => {
  if (code !== 0) {
    executeWebhook({
      content: "I'm dying lmao...",
    })
      .catch(() => Logger.error("Could not send error webhook."))
      .finally(() => process.exit(code));
  } else {
    process.exit(code);
  }
});

process.on("exit", (code) => Logger.log("Exited with code %d", code));

const generateEmbed = (key: string, value: OnlineType): Embed => ({
  title: `${key} went ${!!value ? `online in ${value[0]}` : "offline."}`,
  url: !!value ? "https://play.cprewritten.net" : undefined,
  color: !!value ? 5814783 : 16074818,
  timestamp: new Date(),
  footer: {
    text: !!value
      ? `🌍 ${value[0]}${value[1] ? ` 🏡 ${value[1]}` : ""}`
      : undefined,
  },
});

const executeWebhook = async (
  data: WebhookMessage,
  options?: AxiosRequestConfig
) => {
  try {
    const resp = await axios({
      url: WEBHOOK_LINK,
      method: "post",
      ...options,
      data,
      headers: {
        "Content-Type": "application/json",
      },
    });

    return resp.data;
  } catch (error: any) {
    if (error.isAxiosError && error.response) {
      error("Error when executing webhook: %o", error.response);
    } else {
      error("Got regular error: %o", error);
    }
  }
};

const sendMessage = async (key: string, value: OnlineType): Promise<string> => {
  const data = await executeWebhook(
    {
      embeds: [generateEmbed(key, value)],
    },
    {
      params: {
        wait: true,
      },
    }
  );

  return data.id;
};

const updateMessage = async (key: string, value: OnlineType) => {
  const messageId = embeds.get(key);
  if (!messageId) throw new Error(red("Could not find messageId with " + key));

  const data = await executeWebhook(
    {
      embeds: [generateEmbed(key, value)],
    },
    {
      url: `${WEBHOOK_LINK}/messages/${messageId}`,
      method: "patch",
    }
  );

  return data;
};

const compareValues = (newValue: OnlineType, oldValue: OnlineType) => {
  if (newValue === undefined && oldValue === undefined) return true;
  if (typeof newValue !== "undefined" && typeof oldValue !== "undefined") {
    if (
      newValue.length === 1 &&
      oldValue.length === 1 &&
      newValue[0] === oldValue[0]
    )
      return true;
    if (
      newValue.length === 2 &&
      oldValue.length === 2 &&
      newValue[0] === oldValue[0] &&
      newValue[1] === oldValue[1]
    )
      return true;
  }
  return false;
};

const printMascot = (
  name: string,
  oldValue: OnlineType,
  newValue: OnlineType
) => {
  const parseOnlineValue = (o: OnlineType) => {
    if (o === undefined) return "Offline";
    if (o.length === 2 && o[1]) return `${o[1]}, ${o[0]}`;
    if (o.length === 1 || (o.length === 2 && !o[1])) return o[0];
    return o.toString();
  };
  return `${bold.white(name)}: ${red(parseOnlineValue(oldValue))} -> ${green(
    parseOnlineValue(newValue)
  )}`;
};

const getChanges = async () => {
  for await (const [key, newValue] of collection) {
    const oldValue = prevCollection.get(key);

    if (compareValues(newValue, oldValue)) continue;

    prevCollection.set(key, newValue);

    // Print change message
    Logger.log(printMascot(key, oldValue, newValue));

    // Just went online or offline. e.g. send a new message
    if (newValue === undefined || oldValue === undefined) {
      const id = await sendMessage(key, newValue);

      if (newValue === undefined) embeds.delete(key);
      if (oldValue === undefined) embeds.set(key, id);
    }
    if (oldValue !== undefined && newValue !== undefined) {
      await updateMessage(key, newValue);
    }
  }
};

const updateCollections = (key: string, newValue: OnlineType) => {
  const oldValue = collection.get(key);

  if (compareValues(newValue, oldValue)) return;

  prevCollection.set(key, oldValue);

  collection.set(key, newValue);
};

const parseMascotData = (rows: GoogleSpreadsheetRow[]): Mascot[] =>
  rows
    .filter((row) => {
      if (row["Mascot"]) return row;
    })
    .map(
      (row): Mascot => ({
        name: row["Mascot"],
        online:
          row["Enter the server below:"] !== "Offline"
            ? row["Enter room override below:"].startsWith("Last visited")
              ? [row["Enter the server below:"]]
              : [
                  row["Enter the server below:"],
                  row["Enter room override below:"],
                ]
            : undefined,
      })
    )
    .filter((mascot) => mascot.name !== "");

const collection = new Map<string, OnlineType>();
const prevCollection = new Map<string, OnlineType>(collection);
const embeds = new Map<string, string>();

const main = async () => {
  enable();

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

  await doc.useApiKey(API_KEY);
  await doc.loadInfo();

  let rateLimited = false;

  const sheet = doc.sheetsByIndex[0];

  const run = async () => {
    let rows = [];
    try {
      rows = await sheet.getRows();
    } catch (error: any) {
      if (error.isAxiosError && error.response) {
        if (error.response.status === 429) {
          if (!rateLimited) {
            Logger.log("Rate-limit Error");
            await executeWebhook({
              content: "I am getting rate limited",
            });
            rateLimited = true;
          }
        } else if (
          error.response.status === 503 ||
          error.response.status === 502
        ) {
          Logger.log("Temporary Google API Error %d", error.response.status);
        }
        Logger.error(JSON.stringify(error.response.data, null, 4));
      } else {
        Logger.error("Error while getting rows!");
        Logger.error(error);
      }

      await sleep(5e3);

      return;
    }

    const mascots = parseMascotData(rows);
    for (const { name, online } of mascots) {
      updateCollections(name, online);
    }

    getChanges();
  };

  const waitOnFunction = async (f: Function, delay = 5e3): Promise<void> => {
    await f();
    await sleep(delay);
    return waitOnFunction(f, delay);
  };
  waitOnFunction(run);
  Logger.log(bold("Started!"));
};

main();
