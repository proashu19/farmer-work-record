const express = require("express");
const Farmer = require("../models/Farmer");
const WorkRecord = require("../models/WorkRecord");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole(["admin", "driver"]), async (req, res) => {
    try {
        const query = (req.query.search || "").trim();
        const filter = query
            ? {
                  mobile: { $exists: true },
                  $or: [
                      { name: new RegExp(query, "i") },
                      { mobile: new RegExp(query, "i") },
                      { village: new RegExp(query, "i") }
                  ]
              }
            : { mobile: { $exists: true } };

        const farmers = await Farmer.find(filter).sort({ name: 1 }).limit(50);
        res.json(farmers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/review-queue", requireRole("admin"), async (req, res) => {
    try {
        const query = (req.query.search || "").trim().toLowerCase();
        const records = await WorkRecord.find({ adminSaved: { $ne: true } }).sort({ startTime: -1 });
        const groups = new Map();

        records.forEach((record) => {
            const key = `${record.farmerName || ""}|${record.mobile || ""}`.toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, {
                    _id: record.farmer.toString(),
                    name: record.farmerName,
                    mobile: record.mobile,
                    village: record.village,
                    balance: 0,
                    pendingCount: 0,
                    latestWorkDate: record.workDate
                });
            }

            const group = groups.get(key);
            group.balance += Number(record.remainingBalance) || 0;
            group.pendingCount += 1;
            group.latestWorkDate = new Date(record.workDate) > new Date(group.latestWorkDate) ? record.workDate : group.latestWorkDate;
        });

        const result = [...groups.values()].filter((group) => {
            if (!query) return true;
            return [group.name, group.mobile, group.village].some((value) => String(value || "").toLowerCase().includes(query));
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/", requireRole(["admin", "driver"]), async (req, res) => {
    try {
        const farmer = await Farmer.create({
            name: req.body.name,
            mobile: req.body.mobile,
            village: req.body.village,
            notes: req.body.notes || ""
        });
        res.status(201).json(farmer);
    } catch (err) {
        const message = err.code === 11000 ? "A farmer with this mobile number already exists." : err.message;
        res.status(400).json({ error: message });
    }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
    try {
        const farmer = await Farmer.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
                mobile: req.body.mobile,
                village: req.body.village,
                notes: req.body.notes || ""
            },
            { new: true, runValidators: true }
        );

        if (!farmer) return res.status(404).json({ error: "Farmer not found." });
        res.json(farmer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
    try {
        const workCount = await WorkRecord.countDocuments({ farmer: req.params.id });
        if (workCount > 0) {
            return res.status(400).json({ error: "Farmer has work records and cannot be deleted." });
        }

        const farmer = await Farmer.findByIdAndDelete(req.params.id);
        if (!farmer) return res.status(404).json({ error: "Farmer not found." });
        res.json({ message: "Farmer deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/:id/history", requireRole("admin"), async (req, res) => {
    try {
        const farmer = await Farmer.findById(req.params.id);
        if (!farmer) return res.status(404).json({ error: "Farmer not found." });

        const filter = {
            $or: [
                { farmer: req.params.id },
                { farmerName: farmer.name, mobile: farmer.mobile }
            ]
        };

        if (req.query.pending === "1") {
            filter.adminSaved = { $ne: true };
        }

        const records = await WorkRecord.find(filter).sort({ startTime: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
