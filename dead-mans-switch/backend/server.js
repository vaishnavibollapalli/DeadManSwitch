const pool = require("./config/db");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const switchRoutes = require("./routes/switchRoutes");
const vaultRoutes = require("./routes/vaultRoutes");
const recipientRoutes = require("./routes/recipientRoutes");
const triggerConditionRoutes = require("./routes/triggerConditionRoutes");
const releaseChannelRoutes = require("./routes/releaseChannelRoutes");
const aiExecutorRoutes = require("./routes/aiExecutorRoutes");
const beneficiaryRoutes = require("./routes/beneficiaryRoutes");
const auditRoutes = require("./routes/auditRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const witnessRoutes = require("./routes/witnessRoutes");
const heartbeatRoutes = require("./routes/heartbeatRoutes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: "10mb" })); // vault payloads can be sizable

// Auth endpoints get a tighter rate limit to slow down credential stuffing.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use("/api/auth", authLimiter);

app.get("/", (req, res) => {
  res.json({ message: "Dead Man's Switch backend running" });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    res.json({ message: "Database connected successfully", time: result.rows[0].current_time });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ message: "Database connection failed", error: error.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/switches", switchRoutes);
app.use("/api/switches/:switchId/vaults", vaultRoutes);
app.use("/api/switches/:switchId/recipients", recipientRoutes);
app.use("/api/switches/:switchId/conditions", triggerConditionRoutes);
app.use("/api/switches/:switchId/channels", releaseChannelRoutes);
app.use("/api/ai-executor", aiExecutorRoutes);
app.use("/api/portal", beneficiaryRoutes); // public, token-scoped — no auth middleware
app.use("/api/audit", auditRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/witness", witnessRoutes); // public, recipient-token-gated
app.use("/api/heartbeat", heartbeatRoutes); // public, shared-secret-gated

app.use((req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  if (process.env.ENABLE_TRIGGER_WORKER !== "false") {
    require("./workers/triggerEvaluator").start();
  }
});
