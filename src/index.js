const axios = require("axios").default;
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { promisify } = require("util");
const { join } = require("path");
const fs = require("fs/promises");

const { spreadsheet_id, webhook_link, api_key } = require("../config.json");

let prev_online = [],
  prev_offline = [];

const sleep = promisify(setTimeout);

const parseMascotData = (rows) =>
  rows
    .map((row) => ({
      name: row.Mascot,
      room: row["Enter room override below:"],
      server: row["Enter the server below:"],
    }))
    .filter((mascot) => mascot.name !== "");

const generateEmbed = (mascot, online = false) => ({
  title: `${mascot.name} went ${
    online ? `online in ${mascot.server}!` : "offline."
  }`,
  url: online ? "https://play.cprewritten.net" : null,
  footer: {
    text: online
      ? `🌎 ${mascot.server} 🏠 ${mascot.room || "Tracking..."}`
      : null,
  },
  color: online ? 5814783 : 16074818,
  timestamp: new Date().toISOString(),
});

const executeWebhook = (data) =>
  axios.post(webhook_link, data, {
    headers: {
      "Content-Type": "application/json",
    },
  });

const main = async () => {
  console.log("Running!");
  const doc = new GoogleSpreadsheet(spreadsheet_id);

  await doc.useApiKey(api_key);
  await doc.loadInfo();

  let sent_rate_limit_message = false;
  let prev_mascots = [];

  const sheet = doc.sheetsByIndex[0];
  const run = async () => {
    let rows = [];
    try {
      rows = await sheet.getRows();
      if (sent_rate_limit_message) sent_rate_limit_message = false;
    } catch (error) {
      if (error.isAxiosError && error.response) {
        if (error.response.status === 429) {
          if (!sent_rate_limit_message) {
            await executeWebhook({
              content: "I am getting rate limited",
            });
            sent_rate_limit_message = true;
          }
        } else if (error.response.status === 503) {
          console.log("Temporary Google API Error");
        }
        console.log(JSON.stringify(error.response.data, null, 4));
      } else {
        console.log(error);
      }

      await sleep(5e3);

      return;
    }

    const mascots = parseMascotData(rows);

    if (
      prev_mascots.length === 0 ||
      mascots.some((mascot) => {
        const foundMascot = prev_mascots.find((m) => m.name === mascot.name);
        if (!foundMascot) return true;
        if (foundMascot.server === mascot.server) return false;
        return true;
      })
    ) {
      await fs.writeFile(
        join(process.cwd(), "rows", `${Date.now()}.json`),
        JSON.stringify(mascots, null, 4)
      );
      prev_mascots = mascots.slice();
    }

    if (prev_offline.length === 0 && prev_online.length === 0)
      prev_offline = mascots;

    const online = mascots
        .filter(
          (o) =>
            o.server !== "Offline" &&
            o.room !== "" &&
            !o.room.startsWith("Last visited")
        )
        .filter((o) => !prev_online.find((mascot) => mascot.name === o.name)),
      offline = mascots
        .filter(
          (o) => o.server === "Offline" || o.room.startsWith("Last visited")
        )
        .filter((o) => !prev_offline.find((mascot) => mascot.name === o.name));

    if (online.length === 0 && offline.length === 0) return;

    console.table(online);

    const embeds = [
      ...offline.map((mascot) => generateEmbed(mascot)),
      ...online.map((mascot) => generateEmbed(mascot, true)),
    ];

    if (embeds.length === 0) return;

    const date = new Date();
    [
      ...offline.map(
        (mascot) => `${date.toISOString()} ${mascot.name} went offline.`
      ),
      ...online.map(
        (mascot) =>
          `${date.toISOString()} ${mascot.name} went online in ${
            mascot.server
          }!`
      ),
    ].forEach(console.log);

    try {
      if (process.env.NODE_ENV === "production")
        await executeWebhook({ embeds });
    } catch (err) {
      console.error("Error executing webhook:", err.response.data);
    }

    prev_online = mascots.filter(
      (o) => o.server !== "" && o.server !== "Offline"
    );
    prev_offline = mascots.filter((o) => o.server === "Offline");
  };

  const waitOnFunction = async (f, delay = 5e3) => {
    await f();
    await sleep(delay);
    return waitOnFunction(f, delay);
  };
  waitOnFunction(run);
};

main();
