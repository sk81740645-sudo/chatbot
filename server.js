const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;
const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

// Models
const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Middleware
app.use(express.json({ limit: "15mb" }));
app.use(express.static(__dirname));

// Home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "BaatAI server is running",
    groqConfigured: Boolean(process.env.GROQ_API_KEY)
  });
});

// Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const { message, image } = req.body || {};

    // Check API key
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "Server configuration error",
        details: "GROQ_API_KEY environment variable is missing."
      });
    }

    // Validate message
    if (
      (typeof message !== "string" || !message.trim()) &&
      !image
    ) {
      return res.status(400).json({
        success: false,
        error: "Please enter a message or provide an image."
      });
    }

    // Validate image format when supplied
    if (image && (
      typeof image !== "string" ||
      !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image)
    )) {
      return res.status(400).json({
        success: false,
        error: "Invalid image format. Please upload a supported image."
      });
    }

    // Select model
    const model = image ? VISION_MODEL : TEXT_MODEL;

    const systemMessage = {
      role: "system",
      content: `You are BaatAI, a friendly and helpful AI study assistant.

Help users with studies, programming, mathematics, English,
general knowledge, writing, and everyday questions.

Rules:
1. Understand Hindi, Hinglish, and English.
2. Reply in the language used by the user.
3. Explain difficult topics simply.
4. Provide working code for programming questions.
5. Be polite, accurate, and helpful.
6. Analyze provided images when asked.
7. Never reveal API keys or server secrets.`
    };

    // Build user message
    let userMessage;

    if (image) {
      const content = [];

      content.push({
        type: "text",
        text:
          typeof message === "string" && message.trim()
            ? message.trim()
            : "Please analyze this image and explain what it shows."
      });

      content.push({
        type: "image_url",
        image_url: {
          url: image
        }
      });

      userMessage = {
        role: "user",
        content
      };
    } else {
      userMessage = {
        role: "user",
        content: message.trim()
      };
    }

    // Request Groq
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [systemMessage, userMessage],
        temperature: 0.7,
        max_completion_tokens: 2048
      }),
      signal: AbortSignal.timeout(60000)
    });

    // Handle Groq API errors
    if (!response.ok) {
      const errorText = await response.text();

      // Log diagnostic information without exposing the API key
      console.error("Groq API Error:", {
        status: response.status,
        body: errorText
      });

      let groqMessage = "Groq API request failed.";

      try {
        const parsed = JSON.parse(errorText);
        groqMessage =
          parsed?.error?.message || groqMessage;
      } catch (_) {
        // Response was not JSON
      }

      return res.status(502).json({
        success: false,
        error: "Groq API error",
        details: groqMessage,
        status: response.status
      });
    }

    // Parse response
    const data = await response.json();

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      console.error("Unexpected Groq response:", data);

      return res.status(502).json({
        success: false,
        error: "Groq returned an empty or invalid response."
      });
    }

    // Return successful response
    return res.json({
      success: true,
      reply: reply.trim(),
      model
    });

  } catch (error) {
    console.error("BaatAI Server Error:", error);

    if (error.name === "TimeoutError" ||
        error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "Groq request timed out. Please try again."
      });
    }

    return res.status(500).json({
      success: false,
      error: "Server mein problem aa gayi.",
      details: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Page not found"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`BaatAI running on port ${PORT}`);
});
