const mongoose = require("mongoose");

const workRecordSchema = new mongoose.Schema(
    {
        farmer: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
        farmerName: { type: String, required: true },
        mobile: { type: String, required: true },
        village: { type: String, required: true },
        equipment: { type: String, required: true },
        workDate: { type: Date, required: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        totalHours: { type: Number, required: true, min: 0 },
        equipmentRate: { type: Number, required: true, min: 0 },
        totalAmount: { type: Number, required: true, min: 0 },
        paidAmount: { type: Number, required: true, min: 0 },
        remainingBalance: { type: Number, required: true, min: 0 },
        driverName: { type: String, required: true },
        adminSaved: { type: Boolean, default: false },
        adminSavedAt: Date
    },
    { timestamps: true }
);

module.exports = mongoose.model("WorkRecord", workRecordSchema);
