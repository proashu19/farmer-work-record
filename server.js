const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./backend/routes/authRoutes");
const farmerRoutes = require("./backend/routes/farmerRoutes");
const rateRoutes = require("./backend/routes/rateRoutes");
const workRoutes = require("./backend/routes/workRoutes");
const Rate = require("./backend/models/Rate");

const app = express();
const PORT = 5500;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

async function seedDefaults() {
    const equipmentCount = await Rate.countDocuments({ name: { $exists: true } });
    if (equipmentCount === 0) {
        await Rate.insertMany([
            { name: "Rotavator", ratePerHour: 800 },
            { name: "Cultivator", ratePerHour: 600 },
            { name: "Plough", ratePerHour: 700 },
            { name: "Laser Leveler", ratePerHour: 1200 }
        ]);
    }

}

mongoose
    .connect("mongodb://127.0.0.1:27017/farmerApp")
    .then(async () => {
        await seedDefaults();
        console.log("MongoDB connected");
    })
    .catch((err) => console.error("MongoDB error:", err));

app.use("/api/auth", authRoutes);
app.use("/api/farmers", farmerRoutes);
app.use("/api/rates", rateRoutes);
app.use("/api/work-records", workRoutes);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
