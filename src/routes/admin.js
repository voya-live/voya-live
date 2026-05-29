import express from "express";

const router = express.Router();

router.get("/summary", (_, res) => {
  res.json({
    kpis: {
      users: "connect database",
      liveRooms: "connect database",
      rechargeRevenue: "connect payment gateway",
      pendingKyc: "connect KYC module"
    }
  });
});

export default router;
