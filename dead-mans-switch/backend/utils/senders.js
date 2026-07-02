/**
 * Thin adapters for each outbound channel. Every function is a real,
 * working call IF the corresponding env vars are set; otherwise it logs
 * to the console and resolves successfully, so the rest of the pipeline
 * (queueing, retries, audit logging) is fully exercised without needing
 * live credentials for local dev/demo.
 */

async function sendEmail({ to, subject, body }) {
  if (process.env.SENDGRID_API_KEY) {
    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({ to, from: process.env.SENDGRID_FROM || "no-reply@example.com", subject, text: body });
    return { sent: true, channel: "EMAIL" };
  }
  console.log(`[EMAIL:SIMULATED] to=${to} subject="${subject}"`);
  return { sent: true, channel: "EMAIL", simulated: true };
}

async function sendSms({ to, body }) {
  if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require("twilio")(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({ to, from: process.env.TWILIO_FROM, body });
    return { sent: true, channel: "SMS" };
  }
  console.log(`[SMS:SIMULATED] to=${to} body="${body}"`);
  return { sent: true, channel: "SMS", simulated: true };
}

async function sendTelegram({ chatId, body }) {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    });
    return { sent: res.ok, channel: "TELEGRAM" };
  }
  console.log(`[TELEGRAM:SIMULATED] chatId=${chatId} body="${body}"`);
  return { sent: true, channel: "TELEGRAM", simulated: true };
}

async function sendWebhook({ url, headers = {}, payload }) {
  if (!url) return { sent: false, channel: "WEBHOOK", error: "no url configured" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  return { sent: res.ok, channel: "WEBHOOK", status: res.status };
}

// Used for both LAWYER_API (a firm's intake webhook) and generic notarization
// hand-offs — most legal/notarization vendors (DocuSign, Notarize, Proof)
// expose a webhook-style API, so this shares the same primitive.
async function sendToLawyerApi({ endpoint, apiKey, payload }) {
  if (!endpoint) return { sent: false, channel: "LAWYER_API", error: "no endpoint configured" };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return { sent: res.ok, channel: "LAWYER_API", status: res.status };
}

async function pinToIpfs({ content, filename }) {
  if (process.env.PINATA_JWT) {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: JSON.stringify({ pinataContent: { filename, content } }),
    });
    const data = await res.json();
    return { sent: res.ok, channel: "IPFS", cid: data.IpfsHash };
  }
  console.log(`[IPFS:SIMULATED] would pin filename=${filename}`);
  return { sent: true, channel: "IPFS", simulated: true, cid: "SIMULATED_CID" };
}

module.exports = { sendEmail, sendSms, sendTelegram, sendWebhook, sendToLawyerApi, pinToIpfs };
