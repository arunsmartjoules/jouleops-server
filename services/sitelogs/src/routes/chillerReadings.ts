import express from "express";
import chillerReadingsController from "../controllers/chillerReadingsController.ts";
import { verifyToken, verifyApiKey } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Chiller Readings Routes
 * Base path: /api/chiller-readings
 */

router.get("/", verifyToken, chillerReadingsController.getAll);
router.post("/", verifyApiKey, chillerReadingsController.create);
router.get("/site/:siteId", verifyToken, chillerReadingsController.getBySite);
router.get(
  "/site/:siteId/shift/:dateShift",
  verifyToken,
  chillerReadingsController.getByDateShift,
);
router.get(
  "/chiller/:chillerId",
  verifyToken,
  chillerReadingsController.getByChiller,
);
router.get(
  "/chiller/:chillerId/latest",
  verifyToken,
  chillerReadingsController.getLatest,
);
router.get(
  "/chiller/:chillerId/averages",
  verifyToken,
  chillerReadingsController.getAverages,
);
router.get("/:id", verifyToken, chillerReadingsController.getById);
router.put("/:id", verifyToken, chillerReadingsController.update);
router.delete("/:id", verifyToken, chillerReadingsController.remove);

export default router;
