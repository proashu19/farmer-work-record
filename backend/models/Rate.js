const mongoose = require("mongoose");

const rateSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        ratePerHour: { type: Number, required: true, min: 0 }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Rate", rateSchema);
