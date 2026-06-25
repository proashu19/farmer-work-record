const mongoose = require("mongoose");

const farmerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        mobile: { type: String, required: true, trim: true, unique: true },
        village: { type: String, required: true, trim: true },
        notes: { type: String, trim: true, default: "" },
        balance: { type: Number, default: 0 }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Farmer", farmerSchema);
