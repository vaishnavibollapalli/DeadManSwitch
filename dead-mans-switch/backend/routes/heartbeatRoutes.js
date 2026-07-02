const express = require("express");
const { reportHeartbeat, listNodes } = require("../controllers/heartbeatController");

const router = express.Router();

router.post("/", reportHeartbeat);
router.get("/", listNodes);

module.exports = router;
