const API_BASE = "http://localhost:5500/api";
const session = JSON.parse(localStorage.getItem("farmerAppSession") || "null");
let equipmentCache = [];
let farmerCache = [];
let recordCache = [];
const expandedRecordGroups = new Set();

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const formatDate = (value) => new Date(value).toLocaleDateString();
const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const escapeHtml = (value) =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function requireAdmin() {
    if (!session || session.role !== "admin") {
        alert("Admin login required.");
        window.location.href = "index.html";
    }
}

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

function logout() {
    localStorage.removeItem("farmerAppSession");
    window.location.href = "index.html";
}

function goHome() {
    window.location.href = "index.html";
}

async function loadSummary() {
    const summary = await apiFetch("/work-records/summary");
    document.getElementById("totalFarmers").textContent = summary.totalFarmers;
    document.getElementById("todayWork").textContent = summary.todayWork;
    document.getElementById("totalEarnings").textContent = money(summary.totalEarnings);
    document.getElementById("pendingBalances").textContent = money(summary.pendingBalances);
}

async function loadEquipment() {
    equipmentCache = await apiFetch("/rates");
    const container = document.getElementById("equipmentList");
    container.innerHTML = equipmentCache
        .map(
            (item) => `
                <div class="stack-item">
                    <div><strong>${escapeHtml(item.name)}</strong><span>${money(item.ratePerHour)} / hour</span></div>
                    <div class="row-actions">
                        <button type="button" class="secondary" onclick="editEquipment('${item._id}')">Edit</button>
                        <button type="button" class="danger" onclick="deleteEquipment('${item._id}')">Delete</button>
                    </div>
                </div>
            `
        )
        .join("");
}

async function saveEquipment(event) {
    event.preventDefault();
    const id = document.getElementById("equipmentId").value;
    const payload = {
        name: document.getElementById("equipmentName").value.trim(),
        ratePerHour: Number(document.getElementById("equipmentRate").value)
    };

    await apiFetch(id ? `/rates/${id}` : "/rates", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload)
    });

    event.target.reset();
    document.getElementById("equipmentId").value = "";
    await loadEquipment();
}

function editEquipment(id) {
    const item = equipmentCache.find((equipment) => equipment._id === id);
    document.getElementById("equipmentId").value = item._id;
    document.getElementById("equipmentName").value = item.name;
    document.getElementById("equipmentRate").value = item.ratePerHour;
}

async function deleteEquipment(id) {
    if (!confirm("Delete this equipment rate?")) return;
    await apiFetch(`/rates/${id}`, { method: "DELETE" });
    await loadEquipment();
}

async function loadFarmers() {
    const query = document.getElementById("adminFarmerSearch").value.trim();
    farmerCache = await apiFetch(`/farmers?search=${encodeURIComponent(query)}`);
    const table = document.getElementById("farmersTable");
    table.innerHTML = farmerCache
        .map(
            (farmer) => `
                <tr>
                    <td><input value="${escapeHtml(farmer.name)}" data-field="name" data-id="${farmer._id}"></td>
                    <td><input value="${escapeHtml(farmer.mobile)}" data-field="mobile" data-id="${farmer._id}"></td>
                    <td><input value="${escapeHtml(farmer.village)}" data-field="village" data-id="${farmer._id}"></td>
                    <td>${money(farmer.balance)}</td>
                    <td class="row-actions">
                        <button type="button" onclick="saveFarmer('${farmer._id}')">Save</button>
                        <button type="button" class="secondary" onclick="showHistory('${farmer._id}')">History</button>
                        <button type="button" class="danger" onclick="deleteFarmer('${farmer._id}')">Delete</button>
                    </td>
                </tr>
            `
        )
        .join("");
}

async function saveFarmer(id) {
    const inputs = [...document.querySelectorAll(`input[data-id="${id}"]`)];
    const payload = inputs.reduce((data, input) => {
        data[input.dataset.field] = input.value.trim();
        return data;
    }, {});
    await apiFetch(`/farmers/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    await loadFarmers();
}

async function deleteFarmer(id) {
    if (!confirm("Delete this farmer? Farmers with work records cannot be deleted.")) return;
    try {
        await apiFetch(`/farmers/${id}`, { method: "DELETE" });
        await loadFarmers();
        await loadSummary();
    } catch (err) {
        alert(err.message);
    }
}

async function showHistory(id) {
    const records = await apiFetch(`/farmers/${id}/history`);
    const lines = records.map((record) => `${formatDate(record.workDate)} | ${record.equipment} | ${money(record.totalAmount)} | paid ${money(record.paidAmount)} | due ${money(record.remainingBalance)}`);
    alert(lines.length ? lines.join("\n") : "No work history for this farmer.");
}

async function loadRecords() {
    recordCache = await apiFetch("/work-records");
    const table = document.getElementById("recordsTable");
    table.innerHTML = groupWorkRecords(recordCache)
        .map((group) => {
            const expanded = expandedRecordGroups.has(group.key);
            const groupRow = `
                <tr class="merged-record-row">
                    <td><strong>${escapeHtml(group.farmerName)}</strong><br><small>${group.records.length} work records</small></td>
                    <td>${escapeHtml(group.mobile)}</td>
                    <td>${escapeHtml(group.village)}</td>
                    <td>${escapeHtml(group.equipment.join(", "))}</td>
                    <td>${formatDate(group.latestDate)}<br><small>Latest work</small></td>
                    <td>${group.totalHours.toFixed(2)}</td>
                    <td>Mixed</td>
                    <td>${money(group.totalAmount)}</td>
                    <td>${money(group.paidAmount)}</td>
                    <td>${money(group.remainingBalance)}</td>
                    <td>${escapeHtml(group.drivers.join(", "))}</td>
                    <td class="row-actions">
                        <button type="button" onclick="toggleGroupRecords('${group.key}')">${expanded ? "Hide" : "Details"}</button>
                    </td>
                </tr>
            `;

            return expanded ? `${groupRow}${group.records.map(recordDetailRow).join("")}` : groupRow;
        })
        .join("");
}

function groupWorkRecords(records) {
    const groupMap = new Map();

    records.forEach((record) => {
        const key = `${record.farmerName || ""}|${record.mobile || ""}`.toLowerCase();
        if (!groupMap.has(key)) {
            groupMap.set(key, {
                key,
                farmerName: record.farmerName,
                mobile: record.mobile,
                village: record.village,
                equipment: new Set(),
                drivers: new Set(),
                latestDate: record.workDate,
                totalHours: 0,
                totalAmount: 0,
                paidAmount: 0,
                remainingBalance: 0,
                records: []
            });
        }

        const group = groupMap.get(key);
        group.equipment.add(record.equipment);
        group.drivers.add(record.driverName);
        group.latestDate = new Date(record.workDate) > new Date(group.latestDate) ? record.workDate : group.latestDate;
        group.totalHours += Number(record.totalHours) || 0;
        group.totalAmount += Number(record.totalAmount) || 0;
        group.paidAmount += Number(record.paidAmount) || 0;
        group.remainingBalance += Number(record.remainingBalance) || 0;
        group.records.push(record);
    });

    return [...groupMap.values()]
        .map((group) => ({
            ...group,
            equipment: [...group.equipment],
            drivers: [...group.drivers],
            records: group.records.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        }))
        .sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
}

function recordDetailRow(record) {
    return `
        <tr class="record-detail-row">
            <td><small>Single work record</small></td>
            <td>${escapeHtml(record.mobile)}</td>
            <td>${escapeHtml(record.village)}</td>
            <td>${escapeHtml(record.equipment)}</td>
            <td>${formatDate(record.workDate)}<br><small>${formatTime(record.startTime)} - ${formatTime(record.endTime)}</small></td>
            <td>${record.totalHours.toFixed(2)}</td>
            <td>${money(record.equipmentRate)}</td>
            <td><input type="number" value="${record.totalAmount}" id="total-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.paidAmount}" id="paid-${record._id}" min="0" step="0.01"></td>
            <td>${money(record.remainingBalance)}</td>
            <td>${escapeHtml(record.driverName)}</td>
            <td class="row-actions">
                <button type="button" onclick="correctRecord('${record._id}')">Correct</button>
                <button type="button" class="danger" onclick="deleteRecord('${record._id}')">Delete</button>
            </td>
        </tr>
    `;
}

function toggleGroupRecords(key) {
    if (expandedRecordGroups.has(key)) {
        expandedRecordGroups.delete(key);
    } else {
        expandedRecordGroups.add(key);
    }
    loadRecords();
}

async function correctRecord(id) {
    await apiFetch(`/work-records/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            totalAmount: Number(document.getElementById(`total-${id}`).value),
            paidAmount: Number(document.getElementById(`paid-${id}`).value)
        })
    });
    await loadAll();
}

async function deleteRecord(id) {
    if (!confirm("Delete this work record and adjust farmer balance?")) return;
    await apiFetch(`/work-records/${id}`, { method: "DELETE" });
    await loadAll();
}

async function addDriver(event) {
    event.preventDefault();
    try {
        await apiFetch("/auth/users", {
            method: "POST",
            body: JSON.stringify({
                name: document.getElementById("driverFullName").value.trim(),
                username: document.getElementById("driverUsername").value.trim(),
                password: document.getElementById("driverPassword").value,
                role: "driver"
            })
        });
        event.target.reset();
        await loadUsers();
    } catch (err) {
        alert(err.message);
    }
}

async function loadUsers() {
    const users = await apiFetch("/auth/users");
    const currentUser = users.find((user) => user.id === session.id || user._id === session.id);
    if (currentUser) {
        document.getElementById("accountName").value = currentUser.name;
        document.getElementById("accountUsername").value = currentUser.username;
    }

    document.getElementById("driverList").innerHTML = users
        .map((user) => `<div class="stack-item"><div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.username)} - ${escapeHtml(user.role)}</span></div></div>`)
        .join("");
}

async function updateAccount(event) {
    event.preventDefault();
    try {
        const updatedUser = await apiFetch(`/auth/users/${session.id}`, {
            method: "PUT",
            body: JSON.stringify({
                name: document.getElementById("accountName").value.trim(),
                username: document.getElementById("accountUsername").value.trim(),
                oldPassword: document.getElementById("accountOldPassword").value,
                password: document.getElementById("accountPassword").value
            })
        });

        const nextSession = {
            ...session,
            name: updatedUser.name,
            username: updatedUser.username,
            role: updatedUser.role
        };
        localStorage.setItem("farmerAppSession", JSON.stringify(nextSession));
        document.getElementById("accountOldPassword").value = "";
        document.getElementById("accountPassword").value = "";
        alert("Admin account updated. Use the new username/password next time you log in.");
        await loadUsers();
    } catch (err) {
        alert(err.message);
    }
}

async function loadAll() {
    await Promise.all([loadSummary(), loadEquipment(), loadFarmers(), loadRecords(), loadUsers()]);
}

requireAdmin();
document.getElementById("accountForm").addEventListener("submit", updateAccount);
document.getElementById("equipmentForm").addEventListener("submit", saveEquipment);
document.getElementById("driverForm").addEventListener("submit", addDriver);
document.getElementById("adminFarmerSearch").addEventListener("input", () => {
    clearTimeout(window.adminSearchTimer);
    window.adminSearchTimer = setTimeout(loadFarmers, 250);
});
loadAll().catch((err) => alert(err.message));
