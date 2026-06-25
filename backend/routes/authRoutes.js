const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, savedPassword) {
    if (!savedPassword) return false;

    if (!savedPassword.startsWith("scrypt$")) {
        return password === savedPassword;
    }

    const [, salt, hash] = savedPassword.split("$");
    const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
}

router.get("/setup-needed", async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        res.json({ setupNeeded: userCount === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/setup", async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        if (userCount > 0) {
            return res.status(403).json({ error: "Setup is already complete." });
        }

        if (!req.body.name || !req.body.email || !req.body.mobile || !req.body.password) {
            return res.status(400).json({ error: "Full name, email, mobile number, and password are required." });
        }

        const user = await User.create({
            name: req.body.name,
            email: req.body.email,
            mobile: req.body.mobile,
            username: req.body.email,
            password: hashPassword(req.body.password),
            role: "admin"
        });

        res.status(201).json({
            id: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            username: user.username,
            role: user.role
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });

        if (!user || !verifyPassword(req.body.password, user.password)) {
            return res.status(401).json({ error: "Invalid username or password." });
        }

        if (req.body.role && user.role !== req.body.role) {
            return res.status(403).json({ error: `Please use the ${user.role} login option.` });
        }

        if (!user.password.startsWith("scrypt$")) {
            user.password = hashPassword(req.body.password);
            await user.save();
        }

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            username: user.username,
            role: user.role
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/users", requireRole("admin"), async (req, res) => {
    try {
        const users = await User.find().select("-password").sort({ role: 1, name: 1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/users", requireRole("admin"), async (req, res) => {
    try {
        const user = await User.create({
            name: req.body.name,
            username: req.body.username,
            password: hashPassword(req.body.password),
            role: req.body.role
        });
        res.status(201).json({ id: user._id, name: user.name, username: user.username, role: user.role });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put("/users/:id", requireRole("admin"), async (req, res) => {
    try {
        const update = {};

        ["name", "email", "mobile", "username"].forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                update[field] = req.body[field];
            }
        });

        if (req.body.password) {
            const existingUser = await User.findById(req.params.id);
            if (!existingUser) return res.status(404).json({ error: "User not found." });

            if (!req.body.oldPassword || !verifyPassword(req.body.oldPassword, existingUser.password)) {
                return res.status(400).json({ error: "Old password is incorrect." });
            }

            update.password = hashPassword(req.body.password);
        }

        const user = await User.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true
        }).select("-password");

        if (!user) return res.status(404).json({ error: "User not found." });
        res.json(user);
    } catch (err) {
        const message = err.code === 11000 ? "This username is already taken." : err.message;
        res.status(400).json({ error: message });
    }
});

module.exports = router;
