const express = require("express");
const Farmer = require("../models/Farmer");
const Rate = require("../models/Rate");
const WorkRecord = require("../models/WorkRecord");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

router.get("/", requireRole("admin"), async (req, res) => {
    try {
        const records = await WorkRecord.find().sort({ startTime: -1 }).limit(200);
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/summary", requireRole("admin"), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [farmerCount, todayWork, allRecords, farmers] = await Promise.all([
            Farmer.countDocuments(),
            WorkRecord.countDocuments({ workDate: { $gte: today } }),
            WorkRecord.find(),
            Farmer.find()
        ]);

        const totalEarnings = allRecords.reduce((sum, record) => sum + record.paidAmount, 0);
        const pendingBalances = farmers.reduce((sum, farmer) => sum + farmer.balance, 0);

        res.json({
            totalFarmers: farmerCount,
            todayWork,
            totalEarnings: roundMoney(totalEarnings),
            pendingBalances: roundMoney(pendingBalances),
            recentRecords: allRecords
                .sort((a, b) => b.startTime - a.startTime)
                .slice(0, 10)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/", requireRole(["admin", "driver"]), async (req, res) => {
    try {
        const farmer = await Farmer.findById(req.body.farmerId);
        if (!farmer) return res.status(404).json({ error: "Farmer not found." });

        const equipment = await Rate.findById(req.body.equipmentId);
        if (!equipment) return res.status(404).json({ error: "Equipment not found." });

        const startTime = new Date(req.body.startTime);
        const endTime = new Date(req.body.endTime);
        if (!startTime.getTime() || !endTime.getTime() || endTime <= startTime) {
            return res.status(400).json({ error: "End time must be after start time." });
        }

        const paidAmount = Math.max(0, Number(req.body.paidAmount) || 0);
        const totalHours = roundMoney((endTime - startTime) / 36e5);
        const totalAmount = roundMoney(totalHours * equipment.ratePerHour);
        const remainingBalance = roundMoney(Math.max(totalAmount - paidAmount, 0));

        const record = await WorkRecord.create({
            farmer: farmer._id,
            farmerName: farmer.name,
            mobile: farmer.mobile,
            village: farmer.village,
            equipment: equipment.name,
            workDate: startTime,
            startTime,
            endTime,
            totalHours,
            equipmentRate: equipment.ratePerHour,
            totalAmount,
            paidAmount: roundMoney(paidAmount),
            remainingBalance,
            driverName: req.body.driverName || req.user.name
        });

        farmer.balance = roundMoney(farmer.balance + remainingBalance);
        await farmer.save();

        res.status(201).json(record);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
    try {
        const record = await WorkRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ error: "Work record not found." });

        const oldRemaining = record.remainingBalance;
        const paidAmount = Math.max(0, Number(req.body.paidAmount) || 0);
        const totalAmount = roundMoney(Number(req.body.totalAmount) || record.totalAmount);
        const remainingBalance = roundMoney(Math.max(totalAmount - paidAmount, 0));

        record.paidAmount = roundMoney(paidAmount);
        record.totalAmount = totalAmount;
        record.remainingBalance = remainingBalance;
        await record.save();

        await Farmer.findByIdAndUpdate(record.farmer, { $inc: { balance: remainingBalance - oldRemaining } });
        res.json(record);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
    try {
        const record = await WorkRecord.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ error: "Work record not found." });

        await Farmer.findByIdAndUpdate(record.farmer, { $inc: { balance: -record.remainingBalance } });
        res.json({ message: "Work record deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
