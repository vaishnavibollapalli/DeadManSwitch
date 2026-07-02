const pool = require("../config/db");
const { logAction } = require("../utils/audit");

const SYSTEM_PROMPT = `You are a Digital Executor: a calm, precise assistant that helps someone
draft a handoff message to a loved one who will receive it only after the person has passed away
or gone permanently silent. Write in the person's voice based on the notes they give you. Be warm
but not saccharine, concrete, and organized. Never invent facts the person didn't provide.`;

// Falls back to a template if no ANTHROPIC_API_KEY is configured, so the
// endpoint is fully exercisable without live credentials.
async function generateWithClaude(notes, recipientName) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Recipient: ${recipientName}\n\nNotes to work from:\n${notes}\n\nDraft the handoff message.`,
      },
    ],
  });

  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function templateFallback(notes, recipientName) {
  return [
    `Dear ${recipientName},`,
    "",
    `If you're reading this, it means I'm no longer able to be there myself, and I wanted to make sure you had what you needed.`,
    "",
    notes,
    "",
    "Everything in this vault has been organized for you. Take your time with it.",
    "",
    "With love,",
  ].join("\n");
}

const draftHandoffMessage = async (req, res, next) => {
  try {
    const { notes, recipientName = "you", vault_id } = req.body;
    if (!notes) return res.status(400).json({ message: "notes is required" });

    let draft = await generateWithClaude(notes, recipientName);
    let simulated = false;
    if (!draft) {
      draft = templateFallback(notes, recipientName);
      simulated = true;
    }

    if (vault_id) {
      await pool.query(
        `UPDATE vaults SET typed_metadata = COALESCE(typed_metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ aiDraft: draft, draftedAt: new Date().toISOString() }), vault_id]
      );
    }

    await logAction(req.user.id, "AI_HANDOFF_DRAFTED", req, { vault_id, simulated });

    res.json({ draft, simulated });
  } catch (err) {
    next(err);
  }
};

module.exports = { draftHandoffMessage };
