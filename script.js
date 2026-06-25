const API_BASE = "http://localhost:5500/api";

let session = JSON.parse(localStorage.getItem("farmerAppSession") || "null");
let selectedFarmer = null;
let equipmentList = [];
let farmerSearchResults = [];
let startTime = null;
let endTime = null;
let totalAmount = 0;

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "x-user-role": session?.role || "",
        "x-user-name": session?.name || ""
    };
}

async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options.headers || {}) }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
}

function showApp() {
    document.getElementById("entry-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("home-screen").classList.remove("hidden");
    document.getElementById("roleLabel").textContent = `${session.name} - ${session.role}`;
    document.getElementById("driverName").value = session.name;
    document.getElementById("dashboardButton").classList.toggle("hidden", session.role !== "admin");
    loadEquipment();
    searchFarmers();
}

function logout() {
    localStorage.removeItem("farmerAppSession");
    window.location.href = "index.html";
}

function navigateToDashboard() {
    window.location.href = "dashboard.html";
}

function showEntryScreen() {
    document.getElementById("entry-screen").classList.remove("hidden");
    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.add("hidden");
}

function showSetupScreen() {
    document.getElementById("entry-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
}

function showLoginScreen(role) {
    const label = role === "admin" ? "Admin Login" : "Driver Login";
    document.getElementById("loginRole").value = role;
    document.getElementById("loginRoleLabel").textContent = label;
    document.getElementById("loginTitle").textContent = label;
    document.getElementById("entry-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

async function login(event) {
    event.preventDefault();
    try {
        const user = await apiFetch("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                username: document.getElementById("loginUsername").value.trim(),
                password: document.getElementById("loginPassword").value,
                role: document.getElementById("loginRole").value
            })
        });
        session = user;
        localStorage.setItem("farmerAppSession", JSON.stringify(user));
        showApp();
    } catch (err) {
        alert(err.message);
    }
}

async function setupAdmin(event) {
    event.preventDefault();
    const password = document.getElementById("setupPassword").value;
    const confirmPassword = document.getElementById("setupConfirmPassword").value;

    if (password !== confirmPassword) {
        alert("Password and confirm password must match.");
        return;
    }

    try {
        const user = await apiFetch("/auth/setup", {
            method: "POST",
            body: JSON.stringify({
                name: document.getElementById("setupName").value.trim(),
                email: document.getElementById("setupEmail").value.trim(),
                mobile: document.getElementById("setupMobile").value.trim(),
                password
            })
        });

        event.target.reset();
        alert("Admin account created successfully. Please login as admin.");
        showEntryScreen();
    } catch (err) {
        alert(err.message);
    }
}

async function checkSetup() {
    if (session) {
        showApp();
        return;
    }

    try {
        await apiFetch("/auth/setup-needed");
        showEntryScreen();
    } catch (err) {
        alert(err.message);
    }
}

async function loadEquipment() {
    equipmentList = await apiFetch("/rates");
    const select = document.getElementById("equipmentSelect");
    select.innerHTML = equipmentList
        .map((item) => `<option value="${item._id}">${item.name} - ${money(item.ratePerHour)}/hour</option>`)
        .join("");
}

async function searchFarmers() {
    const query = document.getElementById("farmerSearch").value.trim();
    const farmers = await apiFetch(`/farmers?search=${encodeURIComponent(query)}`);
    const container = document.getElementById("farmerResults");
    farmerSearchResults = farmers;

    if (farmers.length === 0) {
        container.innerHTML = `<p class="empty-state">No farmer found. Add a new farmer to continue.</p>`;
        return;
    }

    container.innerHTML = "";
    farmers.forEach((farmer) => {
        const button = document.createElement("button");
        const name = document.createElement("strong");
        const meta = document.createElement("span");
        const balance = document.createElement("small");

        button.className = "result-item";
        button.type = "button";
        button.addEventListener("click", () => selectFarmer(farmer));
        name.textContent = farmer.name;
        meta.textContent = `${farmer.mobile} - ${farmer.village}`;
        balance.textContent = `Balance: ${money(farmer.balance)}`;
        button.append(name, meta, balance);
        container.appendChild(button);
    });
}

async function addFarmer(event) {
    event.preventDefault();
    try {
        const farmer = await apiFetch("/farmers", {
            method: "POST",
            body: JSON.stringify({
                name: document.getElementById("newFarmerName").value.trim(),
                mobile: document.getElementById("newFarmerMobile").value.trim(),
                village: document.getElementById("newFarmerVillage").value.trim(),
                notes: document.getElementById("newFarmerNotes").value.trim()
            })
        });

        event.target.reset();
        selectFarmer(farmer);
        searchFarmers();
    } catch (err) {
        alert(err.message);
    }
}

function selectFarmer(farmer) {
    selectedFarmer = farmer;
    document.getElementById("workEntry").classList.remove("hidden");
    document.getElementById("selectedFarmerName").textContent = farmer.name;
    document.getElementById("selectedFarmerMeta").textContent = `${farmer.mobile} - ${farmer.village} - Balance ${money(farmer.balance)}`;
    resetWorkState();
}

function clearSelectedFarmer() {
    selectedFarmer = null;
    document.getElementById("workEntry").classList.add("hidden");
}

function resetWorkState() {
    startTime = null;
    endTime = null;
    totalAmount = 0;
    document.getElementById("startTimeDisplay").textContent = "Not started";
    document.getElementById("endTimeDisplay").textContent = "Not ended";
    document.getElementById("workDurationDisplay").textContent = "0.00";
    document.getElementById("totalRsDisplay").textContent = money(0);
    document.getElementById("remainingBalanceDisplay").textContent = money(0);
    document.getElementById("paidAmount").value = "";
    document.getElementById("paymentForm").classList.add("hidden");
    document.getElementById("startWorkButton").disabled = false;
    document.getElementById("endWorkButton").disabled = true;
}

function startWork() {
    if (!selectedFarmer) return alert("Select a farmer first.");
    if (!document.getElementById("equipmentSelect").value) return alert("Add equipment rates from admin dashboard first.");

    startTime = new Date();
    document.getElementById("startTimeDisplay").textContent = startTime.toLocaleString();
    document.getElementById("startWorkButton").disabled = true;
    document.getElementById("endWorkButton").disabled = false;
}

function endWork() {
    endTime = new Date();
    const selectedEquipment = equipmentList.find((item) => item._id === document.getElementById("equipmentSelect").value);
    const totalHours = Math.max((endTime - startTime) / 36e5, 1 / 60);
    totalAmount = totalHours * selectedEquipment.ratePerHour;

    document.getElementById("endTimeDisplay").textContent = endTime.toLocaleString();
    document.getElementById("workDurationDisplay").textContent = totalHours.toFixed(2);
    document.getElementById("totalRsDisplay").textContent = money(totalAmount);
    document.getElementById("remainingBalanceDisplay").textContent = money(totalAmount);
    document.getElementById("paymentForm").classList.remove("hidden");
    document.getElementById("endWorkButton").disabled = true;
}

function updateRemainingPreview() {
    const paid = Number(document.getElementById("paidAmount").value) || 0;
    document.getElementById("remainingBalanceDisplay").textContent = money(Math.max(totalAmount - paid, 0));
}

async function submitWork(event) {
    event.preventDefault();
    try {
        await apiFetch("/work-records", {
            method: "POST",
            body: JSON.stringify({
                farmerId: selectedFarmer._id,
                equipmentId: document.getElementById("equipmentSelect").value,
                startTime,
                endTime,
                paidAmount: Number(document.getElementById("paidAmount").value) || 0,
                driverName: document.getElementById("driverName").value
            })
        });

        alert("Work record saved successfully.");
        resetWorkState();
        await searchFarmers();
        clearSelectedFarmer();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById("loginForm").addEventListener("submit", login);
document.getElementById("setupForm").addEventListener("submit", setupAdmin);
document.getElementById("newFarmerForm").addEventListener("submit", addFarmer);
document.getElementById("paymentForm").addEventListener("submit", submitWork);
document.getElementById("paidAmount").addEventListener("input", updateRemainingPreview);
document.getElementById("farmerSearch").addEventListener("input", () => {
    clearTimeout(window.searchTimer);
    window.searchTimer = setTimeout(searchFarmers, 250);
});

checkSetup();
