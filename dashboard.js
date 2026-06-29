const API_BASE = "http://localhost:5500/api";
const session = JSON.parse(localStorage.getItem("farmerAppSession") || "null");
let equipmentCache = [];
let farmerCache = [];
let recordCache = [];
let workRecordGroups = [];
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
    farmerCache = await apiFetch(`/farmers/review-queue?search=${encodeURIComponent(query)}`);
    const table = document.getElementById("farmersTable");

    if (farmerCache.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No pending driver work. Saved records are available in Work Records.</td>
            </tr>
        `;
        return;
    }

    table.innerHTML = farmerCache
        .map(
            (farmer) => `
                <tr>
                    <td><input value="${escapeHtml(farmer.name)}" data-field="name" data-id="${farmer._id}"></td>
                    <td><input value="${escapeHtml(farmer.mobile)}" data-field="mobile" data-id="${farmer._id}"></td>
                    <td><input value="${escapeHtml(farmer.village)}" data-field="village" data-id="${farmer._id}"></td>
                    <td>${money(farmer.balance)}<br><small>${farmer.pendingCount} pending records</small></td>
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
    const records = await apiFetch(`/farmers/${id}/history?pending=1`);
    await Promise.all(
        records.map((record) =>
            apiFetch(`/work-records/${record._id}`, {
                method: "PUT",
                body: JSON.stringify({
                    farmerName: payload.name,
                    mobile: payload.mobile,
                    village: payload.village,
                    equipment: record.equipment,
                    totalHours: record.totalHours,
                    equipmentRate: record.equipmentRate,
                    totalAmount: record.totalAmount,
                    paidAmount: record.paidAmount
                })
            })
        )
    );
    alert("Farmer work saved to Work Records.");
    await loadAll();
    closeHistoryPanel();
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
    const records = await apiFetch(`/farmers/${id}/history?pending=1`);
    const farmer = farmerCache.find((item) => item._id === id);
    const panel = document.getElementById("farmerHistoryPanel");

    panel.classList.remove("hidden");
    panel.innerHTML = `
        <div class="topbar">
            <div>
                <p class="eyebrow">Pending Individual Work Table</p>
                <h2>${escapeHtml(farmer?.name || "Farmer History")}</h2>
                <p class="hint">${escapeHtml(farmer?.mobile || "")} ${farmer?.village ? "- " + escapeHtml(farmer.village) : ""}</p>
            </div>
            <button type="button" class="secondary" onclick="closeHistoryPanel()">Close</button>
        </div>
        ${records.length ? farmerHistoryTable(records) : '<p class="empty-state">No pending work for this farmer. Saved data is in Work Records.</p>'}
    `;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeHistoryPanel() {
    const panel = document.getElementById("farmerHistoryPanel");
    panel.classList.add("hidden");
    panel.innerHTML = "";
}

function farmerHistoryTable(records) {
    const groups = groupWorkRecords(records);

    return groups
        .map(
            (group) => `
                <div class="history-group">
                    <div class="history-group-header">
                        <strong>${escapeHtml(group.farmerName)} - ${escapeHtml(group.mobile)}</strong>
                        <span>${group.records.length} records | Total ${money(group.totalAmount)} | Paid ${money(group.paidAmount)} | Due ${money(group.remainingBalance)}</span>
                    </div>
                    <div class="table-wrap">
                        <table class="individual-history-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Address</th>
                                    <th>Equipment</th>
                                    <th>Date</th>
                                    <th>Work Session Hours</th>
                                    <th>Rate</th>
                                    <th>Total Rs</th>
                                    <th>Paid Rs</th>
                                    <th>Remaining</th>
                                    <th>Driver</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.records.map(historyRecordRow).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `
        )
        .join("");
}

function historyRecordRow(record) {
    return `
        <tr>
            <td><input value="${escapeHtml(record.farmerName)}" id="history-name-${record._id}"></td>
            <td><input value="${escapeHtml(record.mobile)}" id="history-mobile-${record._id}"></td>
            <td><input value="${escapeHtml(record.village)}" id="history-village-${record._id}"></td>
            <td><input value="${escapeHtml(record.equipment)}" id="history-equipment-${record._id}"></td>
            <td>${formatDate(record.workDate)}<br><small>${formatTime(record.startTime)} - ${formatTime(record.endTime)}</small></td>
            <td><input type="number" value="${record.totalHours}" id="history-hours-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.equipmentRate}" id="history-rate-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.totalAmount}" id="history-total-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.paidAmount}" id="history-paid-${record._id}" min="0" step="0.01"></td>
            <td>${money(record.remainingBalance)}</td>
            <td>${escapeHtml(record.driverName)}</td>
            <td class="row-actions">
                <button type="button" onclick="saveHistoryRecord('${record._id}')">Save</button>
                <button type="button" class="danger" onclick="deleteRecord('${record._id}')">Delete</button>
            </td>
        </tr>
    `;
}

async function saveHistoryRecord(id) {
    await apiFetch(`/work-records/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            farmerName: document.getElementById(`history-name-${id}`).value.trim(),
            mobile: document.getElementById(`history-mobile-${id}`).value.trim(),
            village: document.getElementById(`history-village-${id}`).value.trim(),
            equipment: document.getElementById(`history-equipment-${id}`).value.trim(),
            totalHours: Number(document.getElementById(`history-hours-${id}`).value),
            equipmentRate: Number(document.getElementById(`history-rate-${id}`).value),
            totalAmount: Number(document.getElementById(`history-total-${id}`).value),
            paidAmount: Number(document.getElementById(`history-paid-${id}`).value)
        })
    });
    alert("Work record saved.");
    await loadAll();
    closeHistoryPanel();
}

async function loadRecords() {
    const search = document.getElementById("workRecordSearch")?.value.trim().toLowerCase() || "";
    recordCache = (await apiFetch("/work-records")).filter((record) => record.adminSaved === true);
    const table = document.getElementById("recordsTable");

    workRecordGroups = groupWorkRecords(recordCache).filter((group) => {
        if (!search) return true;
        return [group.farmerName, group.mobile, group.village].some((value) => String(value || "").toLowerCase().includes(search));
    });

    const visibleGroups = search ? workRecordGroups : workRecordGroups.slice(0, 5);

    if (visibleGroups.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="3" class="empty-state">No saved work records found.</td>
            </tr>
        `;
        return;
    }

    table.innerHTML = visibleGroups
        .map((group) => {
            const groupIndex = workRecordGroups.findIndex((item) => item.key === group.key);
            return `
                <tr class="merged-record-row">
                    <td><strong>${escapeHtml(group.farmerName)}</strong><br><small>${group.records.length} work records</small></td>
                    <td>${escapeHtml(group.mobile)}</td>
                    <td class="row-actions">
                        <button type="button" onclick="openWorkRecordDetails(${groupIndex})">Details</button>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function openWorkRecordDetails(groupIndex) {
    const group = workRecordGroups[groupIndex];
    if (!group) return;

    const params = new URLSearchParams({
        name: group.farmerName,
        mobile: group.mobile
    });
    window.location.href = `work-record-details.html?${params.toString()}`;
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

function workRecordEditableRow(record) {
    return `
        <tr>
            <td><input value="${escapeHtml(record.farmerName)}" id="work-name-${record._id}"></td>
            <td><input value="${escapeHtml(record.mobile)}" id="work-mobile-${record._id}"></td>
            <td><input value="${escapeHtml(record.village)}" id="work-village-${record._id}"></td>
            <td><input value="${escapeHtml(record.equipment)}" id="work-equipment-${record._id}"></td>
            <td>${formatDate(record.workDate)}<br><small>${formatTime(record.startTime)} - ${formatTime(record.endTime)}</small></td>
            <td><input type="number" value="${record.totalHours}" id="work-hours-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.equipmentRate}" id="work-rate-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.totalAmount}" id="work-total-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.paidAmount}" id="work-paid-${record._id}" min="0" step="0.01"></td>
            <td>${money(record.remainingBalance)}</td>
            <td>${escapeHtml(record.driverName)}</td>
            <td class="row-actions">
                <button type="button" onclick="saveWorkRecordDetail('${record._id}')">Save</button>
                <button type="button" class="danger" onclick="deleteRecord('${record._id}')">Delete</button>
            </td>
        </tr>
    `;
}

async function saveWorkRecordDetail(id) {
    await apiFetch(`/work-records/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            farmerName: document.getElementById(`work-name-${id}`).value.trim(),
            mobile: document.getElementById(`work-mobile-${id}`).value.trim(),
            village: document.getElementById(`work-village-${id}`).value.trim(),
            equipment: document.getElementById(`work-equipment-${id}`).value.trim(),
            totalHours: Number(document.getElementById(`work-hours-${id}`).value),
            equipmentRate: Number(document.getElementById(`work-rate-${id}`).value),
            totalAmount: Number(document.getElementById(`work-total-${id}`).value),
            paidAmount: Number(document.getElementById(`work-paid-${id}`).value)
        })
    });
    alert("Work record updated.");
    await loadAll();
    closeWorkRecordDetails();
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
document.getElementById("workRecordSearch").addEventListener("input", () => {
    clearTimeout(window.workRecordSearchTimer);
    window.workRecordSearchTimer = setTimeout(loadRecords, 250);
});
loadAll().catch((err) => alert(err.message));
