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
        const records = await WorkRecord.find({ farmer: req.params.id }).sort({ startTime: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
