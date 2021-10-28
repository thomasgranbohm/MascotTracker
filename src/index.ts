import axios, { AxiosRequestConfig } from "axios";
import { Embed, Mascot, MascotEmbed, OnlineType, WebhookMessage } from "types";
import { spreadsheet_id, webhook_link, api_key } from "../config.json";

const generateRandomId = (length: number = 8): string | number => {
  const result = [];
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result.push(
      characters.charAt(Math.floor(Math.random() * charactersLength))
    );
  }
  return result.join("");
};

const mascots: Mascot[] = [
  {
    name: "Aunt Arctic",
  },
  {
    name: "Herbert",
  },
  {
    name: "Jetpack Guy",
  },
];

const generateEmbed = (key: string, value: OnlineType): Embed => ({
  title: `${key} went ${!!value ? `online in ${value[0]}` : "offline."}`,
  url: !!value ? "https://play.cprewritten.net" : undefined,
  color: !!value ? 5814783 : 16074818,
  timestamp: new Date(),
  footer: {
    text: !!value
      ? `🌍 ${value[0]} 🏡 ${value[1] || "Tracking..."}`
      : undefined,
  },
});

const executeWebhook = async (
  data: WebhookMessage,
  options?: AxiosRequestConfig
) => {
  try {
    const resp = await axios({
      url: webhook_link,
      ...options,
      data,
      headers: {
        "Content-Type": "application/json",
      },
    });

    return resp.data;
  } catch (error: any) {
    if (error.isAxiosError && error.response) {
      console.log("Error when executing webhook: %o", error.response.data);
    } else {
      console.log(error);
    }
  }
};

const sendMessage = async (key: string, value: OnlineType): Promise<string> => {
  const data = await executeWebhook(
    {
      embeds: [generateEmbed(key, value)],
    },
    {
      method: "post",
      params: {
        wait: true,
      },
    }
  );

  return data.id;
};

const updateMessage = async (key: string, value: OnlineType) => {
  const messageId = embeds.get(key);
  if (!messageId) throw new Error("Could not find messageId with " + key);

  const data = await executeWebhook(
    {
      embeds: [generateEmbed(key, value)],
    },
    {
      url: `${webhook_link}/messages/${messageId}`,
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
    if (o.length === 1) return `${o[0]}`;
    if (o.length === 2) return `${o[1]}, ${o[0]}`;
  };
  return `${name}: ${parseOnlineValue(oldValue)} -> ${parseOnlineValue(
    newValue
  )}`;
};

const getChanges = async () => {
  for await (const [key, newValue] of collection) {
    const oldValue = prevCollection.get(key);

    if (compareValues(newValue, oldValue)) continue;

    prevCollection.set(key, newValue);

    // Print change message
    console.log(printMascot(key, oldValue, newValue));

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

const collection = new Map<string, OnlineType>();
for (const { name, online } of mascots) {
  collection.set(name, online);
}
const prevCollection = new Map<string, OnlineType>(collection);
const embeds = new Map<string, string>();

const main = () => {
  getChanges();
  setInterval(getChanges, 1e3);

  setTimeout(() => updateCollections("Jetpack Guy", ["Blizzard", "Dock"]), 2e3);
  setTimeout(() => updateCollections("Herbert", ["Sleet", "Dock"]), 3e3);
  setTimeout(() => updateCollections("Jetpack Guy", ["Sleet", "Dock"]), 4e3);
  setTimeout(() => updateCollections("Herbert", ["Sleet", "Coffee Shop"]), 5e3);
  setTimeout(() => updateCollections("Jetpack Guy", undefined), 6e3);

  setTimeout(() => process.exit(0), 6e3);
};

main();
