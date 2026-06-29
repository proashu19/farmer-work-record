const API_BASE = "http://localhost:5500/api";
const session = JSON.parse(localStorage.getItem("farmerAppSession") || "null");
const params = new URLSearchParams(window.location.search);
const farmerName = params.get("name") || "";
const farmerMobile = params.get("mobile") || "";

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

function requireAdmin() {
    if (!session || session.role !== "admin") {
        alert("Admin login required.");
        window.location.href = "index.html";
    }
}

function goDashboard() {
    window.location.href = "dashboard.html";
}

async function loadDetails() {
    const query = new URLSearchParams({ name: farmerName, mobile: farmerMobile });
    const records = await apiFetch(`/work-records/farmer-history?${query.toString()}`);

    document.getElementById("detailFarmerName").textContent = farmerName || "Farmer";
    document.getElementById("detailFarmerMeta").textContent = farmerMobile;

    if (records.length === 0) {
        document.getElementById("detailRecordsTable").innerHTML = `
            <tr><td colspan="11" class="empty-state">No saved work records found for this farmer.</td></tr>
        `;
        return;
    }

    const village = records[0].village || "";
    document.getElementById("detailFarmerMeta").textContent = `${farmerMobile}${village ? " - " + village : ""}`;

    const totals = records.reduce(
        (sum, record) => {
            sum.total += Number(record.totalAmount) || 0;
            sum.paid += Number(record.paidAmount) || 0;
            sum.remaining += Number(record.remainingBalance) || 0;
            return sum;
        },
        { total: 0, paid: 0, remaining: 0 }
    );

    document.getElementById("detailTotal").textContent = money(totals.total);
    document.getElementById("detailPaid").textContent = money(totals.paid);
    document.getElementById("detailRemaining").textContent = money(totals.remaining);
    document.getElementById("detailRecordsTable").innerHTML = records.map(recordRow).join("");
}

function recordRow(record) {
    return `
        <tr>
            <td>${formatDate(record.workDate)}<br><small>${formatTime(record.startTime)} - ${formatTime(record.endTime)}</small></td>
            <td><input value="${escapeHtml(record.farmerName)}" id="name-${record._id}"></td>
            <td><input value="${escapeHtml(record.mobile)}" id="mobile-${record._id}"></td>
            <td><input value="${escapeHtml(record.village)}" id="village-${record._id}"></td>
            <td><input value="${escapeHtml(record.equipment)}" id="equipment-${record._id}"></td>
            <td><input type="number" value="${record.totalHours}" id="hours-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.equipmentRate}" id="rate-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.totalAmount}" id="total-${record._id}" min="0" step="0.01"></td>
            <td><input type="number" value="${record.paidAmount}" id="paid-${record._id}" min="0" step="0.01"></td>
            <td>${money(record.remainingBalance)}</td>
            <td class="no-print"><button type="button" onclick="saveRecord('${record._id}')">Save</button></td>
        </tr>
    `;
}

async function saveRecord(id) {
    await apiFetch(`/work-records/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            farmerName: document.getElementById(`name-${id}`).value.trim(),
            mobile: document.getElementById(`mobile-${id}`).value.trim(),
            village: document.getElementById(`village-${id}`).value.trim(),
            equipment: document.getElementById(`equipment-${id}`).value.trim(),
            totalHours: Number(document.getElementById(`hours-${id}`).value),
            equipmentRate: Number(document.getElementById(`rate-${id}`).value),
            totalAmount: Number(document.getElementById(`total-${id}`).value),
            paidAmount: Number(document.getElementById(`paid-${id}`).value)
        })
    });
    alert("Work record updated.");
    await loadDetails();
}

requireAdmin();
loadDetails().catch((err) => alert(err.message));
