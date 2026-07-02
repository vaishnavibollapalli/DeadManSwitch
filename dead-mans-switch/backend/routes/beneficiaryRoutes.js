const express = require("express");
const { getPortal, acknowledge, downloadVault } = require("../controllers/beneficiaryController");

const router = express.Router();

router.get("/:token", getPortal);
router.post("/:token/acknowledge", acknowledge);
router.get("/:token/vaults/:vaultId", downloadVault);

module.exports = router;
