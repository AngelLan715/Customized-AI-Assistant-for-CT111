const TEXT_SYSTEM_PROMPT =
  "You are Core9 AI for CT 111 - Computer Electronics. Explain clearly for first-year students. Keep answers accurate and practical.";

function hasOpenAiConfig() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

function hasPublishedTextPrompt() {
  return Boolean(process.env.OPENAI_TEXT_PROMPT_ID && process.env.OPENAI_TEXT_PROMPT_ID.trim());
}

/** Aggregate assistant text from a /v1/responses JSON body (published prompt or other Responses flows). */
function extractResponsesOutputText(data) {
  if (data && typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const texts = [];
  const output = data?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === "output_text" && typeof block.text === "string") {
          texts.push(block.text);
        }
      }
    }
  }
  return texts.join("").trim();
}

async function generateTextResponseWithPublishedPrompt(userPrompt, model) {
  const promptId = process.env.OPENAI_TEXT_PROMPT_ID.trim();
  const varKey = (process.env.OPENAI_TEXT_PROMPT_VARIABLE || "input").trim() || "input";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      prompt: {
        id: promptId,
        variables: { [varKey]: userPrompt },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || j.message || raw;
    } catch {
      /* keep raw */
    }
    throw new Error(`OpenAI text (${response.status}): ${detail}`);
  }

  const data = JSON.parse(raw);
  const output = extractResponsesOutputText(data);
  return {
    provider: "openai",
    model,
    output: output || "No text output returned.",
  };
}

async function generateTextResponse(userPrompt) {
  if (!hasOpenAiConfig()) {
    return {
      provider: "mock",
      model: "core9-local-placeholder",
      output:
        "Text model container is ready. Add OPENAI_API_KEY and OPENAI_TEXT_MODEL in .env to enable real model responses. Optionally set OPENAI_TEXT_PROMPT_ID (pmpt_…) to use a published dashboard prompt.",
    };
  }

  const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

  if (hasPublishedTextPrompt()) {
    return generateTextResponseWithPublishedPrompt(userPrompt, model);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: TEXT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || j.message || raw;
    } catch {
      /* keep raw */
    }
    throw new Error(`OpenAI text (${response.status}): ${detail}`);
  }

  const data = JSON.parse(raw);
  const msg = data.choices?.[0]?.message;
  let output = "";
  if (typeof msg?.content === "string") {
    output = msg.content;
  } else if (Array.isArray(msg?.content)) {
    output = msg.content
      .map((part) => (part && part.type === "text" && part.text ? part.text : ""))
      .join("");
  }

  return {
    provider: "openai",
    model,
    output: output.trim() || "No text output returned.",
  };
}

async function generateImageResponse(prompt) {
  if (!hasOpenAiConfig()) {
    return {
      provider: "mock",
      model: "core9-image-placeholder",
      imageUrl: "",
      note: "Image model container is ready. Add OPENAI_API_KEY and OPENAI_IMAGE_MODEL in .env to enable real generation.",
    };
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || j.message || raw;
    } catch {
      /* keep raw */
    }
    throw new Error(`OpenAI image (${response.status}): ${detail}`);
  }

  const data = JSON.parse(raw);
  const imageUrl = data?.data?.[0]?.url || "";
  return {
    provider: "openai",
    model,
    imageUrl,
  };
}

module.exports = { generateTextResponse, generateImageResponse };
