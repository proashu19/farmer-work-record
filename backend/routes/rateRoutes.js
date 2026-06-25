const express = require("express");
const Rate = require("../models/Rate");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole(["admin", "driver"]), async (req, res) => {
    try {
        const rates = await Rate.find({ name: { $exists: true } }).sort({ name: 1 });
        res.json(rates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/", requireRole("admin"), async (req, res) => {
    try {
        const equipment = await Rate.create({
            name: req.body.name,
            ratePerHour: Number(req.body.ratePerHour)
        });
        res.status(201).json(equipment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
    try {
        const equipment = await Rate.findByIdAndUpdate(
            req.params.id,
            { name: req.body.name, ratePerHour: Number(req.body.ratePerHour) },
            { new: true, runValidators: true }
        );

        if (!equipment) return res.status(404).json({ error: "Equipment not found." });
        res.json(equipment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
    try {
        const equipment = await Rate.findByIdAndDelete(req.params.id);
        if (!equipment) return res.status(404).json({ error: "Equipment not found." });
        res.json({ message: "Equipment deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
