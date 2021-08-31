const axios = require("axios").default;
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { promisify } = require("util");

const { spreadsheet_id, webhook_link, api_key } = require("../config.json");

let prevOnline = [],
	prevOffline = [];

const sleep = promisify(setTimeout);

const parseMascotData = (rows) =>
	rows.map((row) => ({
		name: row.Mascot,
		room: row.Room,
		server: row["Enter the server below:"],
	}));

const generateEmbed = (mascot, online = false) => ({
	title: `${mascot.name} went ${
		online ? `online in ${mascot.server}!` : "offline."
	}`,
	url: online ? "https://play.cprewritten.net" : null,
	footer: {
		text: online ? `🌎 ${mascot.server} 🏠 ${mascot.room}` : null,
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

	const sheet = doc.sheetsByIndex[0];
	const run = async () => {
		let rows = [];
		try {
			rows = await sheet.getRows();
			if (sent_rate_limit_message) sent_rate_limit_message = false;
		} catch (error) {
			if (error.isAxiosError && error.response.status === 429) {
				if (!sent_rate_limit_message) {
					await executeWebhook({
						content: "I am getting rate limited",
					});
					sent_rate_limit_message = true;
				}
				console.log(JSON.stringify(error.response.data, null, 4));
			} else {
				console.log(error);
			}

			await sleep(5e3);

			return;
		}

		const mascots = parseMascotData(rows);

		if (prevOffline.length === 0 && prevOnline.length === 0)
			prevOffline = mascots;

		const online = mascots
				.filter((o) => o.server !== "" && o.server !== "Offline")
				.filter(
					(o) => !prevOnline.find((mascot) => mascot.name === o.name)
				),
			offline = mascots
				.filter((o) => o.server === "Offline")
				.filter(
					(o) => !prevOffline.find((mascot) => mascot.name === o.name)
				);

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
			await executeWebhook({ embeds });
		} catch (err) {
			console.error("Error executing webhook:", err.response.data);
		}

		prevOnline = mascots.filter(
			(o) => o.server !== "" && o.server !== "Offline"
		);
		prevOffline = mascots.filter((o) => o.server === "Offline");
	};

	const waitOnFunction = async (f, delay = 3e3) => {
		await f();
		await sleep(delay);
		return waitOnFunction(f, delay);
	};
	waitOnFunction(run);
};

main();
