const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireSwitchOwnership } = require("../middleware/errorHandler");
const { createVault, listVaults, deleteVault } = require("../controllers/vaultController");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireSwitchOwnership);

router.post("/", createVault);
router.get("/", listVaults);
router.delete("/:vaultId", deleteVault);

module.exports = router;
