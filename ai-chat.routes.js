import express from "express";
import { OpenAI } from "openai";

const router = express.Router();

// Endpoint POST /ai-chat : proxy OpenAI Responses API (stream)
router.post("/ai-chat", async (req, res) => {
	const { prompt, openaiApiKey, history, tools, tool_choice, model } = req.body;
	if ((!prompt && !Array.isArray(history)) || !openaiApiKey) {
		return res
			.status(400)
			.json({ error: "Prompt ou historique et clé OpenAI requis." });
	}
	const input =
		Array.isArray(history) && history.length > 0
			? history
			: [
				{
					role: "user",
					content: prompt,
				},
			];

	const client = new OpenAI({ apiKey: openaiApiKey });

	try {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		let clientClosed = false;
		req.on("close", () => {
			clientClosed = true;
			res.end();
		}); // Construction dynamique du payload OpenAI pour intégrer MCP
		const payload = {
			model: model || "gpt-4.1-mini",
			input,
			stream: true,
			// MCP
			...(tools ? { tools } : {}),
			...(tool_choice ? { tool_choice } : {}),
		};
		const stream = await client.responses.create(payload);

		for await (const event of stream) {
			console.log("event envoyé au client :", event);
			if (clientClosed) break;
			res.write(`data: ${JSON.stringify(event)}\n\n`);
			res.flush && res.flush();
		}
		if (!clientClosed) res.end();
	} catch (err) {
		try {
			res.write(`data: {\"error\": \"${err.message}\"}\n\n`);
		} catch { }
		res.end();
	}
});

export default router;
