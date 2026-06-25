const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, trim: true, lowercase: true },
        mobile: { type: String, trim: true },
        username: { type: String, required: true, trim: true, unique: true },
        password: { type: String, required: true },
        role: { type: String, enum: ["admin", "driver"], required: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
