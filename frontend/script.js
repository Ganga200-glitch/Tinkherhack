const API = "http://127.0.0.1:8000";

let rejectRequestId = null;
let rejectRole = null;

/* =====================================================
   LOGIN
===================================================== */

function login() {
    const role = document.getElementById("role")?.value;
    const errorText = document.getElementById("loginError");

    if (errorText) errorText.textContent = "";

    if (!role) {
        if (errorText)
            errorText.textContent = "Please select a role.";
        return;
    }

    if (role === "student") {
        window.location.href = "student.html";
        return;
    }

    if (role === "admin") {
        window.location.href = "admin.html";
        return;
    }

    window.location.href = "dashboard.html?role=" + role;
}

function goHome() {
    window.location.href = "login.html";
}

/* =====================================================
   WAIT FOR PAGE LOAD
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    /* ---------------- STUDENT FILE VALIDATION ---------------- */

    const casteInput = document.getElementById("caste_doc");
    const incomeInput = document.getElementById("income_doc");
    const submitBtn = document.getElementById("submitBtn");

    function validateUploads() {
        if (!submitBtn) return;

        if (
            casteInput?.files.length > 0 &&
            incomeInput?.files.length > 0
        ) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }
    }

    casteInput?.addEventListener("change", function () {
        const check = document.getElementById("casteCheck");
        if (check) check.innerHTML = "✅ Caste Certificate uploaded";
        validateUploads();
    });

    incomeInput?.addEventListener("change", function () {
        const check = document.getElementById("incomeCheck");
        if (check) check.innerHTML = "✅ Income Certificate uploaded";
        validateUploads();
    });

    /* ---------------- SUBMIT FORM ---------------- */

    const form = document.getElementById("submitForm");

    form?.addEventListener("submit", async function (e) {

        e.preventDefault();

        const formData = new FormData();
        formData.append("student_id",
            document.getElementById("student_id").value);
        formData.append("request_type",
            document.getElementById("request_type").value);
        formData.append("role", "student");

        formData.append("caste_doc", casteInput.files[0]);
        formData.append("income_doc", incomeInput.files[0]);

        const res = await fetch(`${API}/submit/`, {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        showStudentResult(data);
    });

});

/* =====================================================
   STUDENT SECTION
===================================================== */

async function getRequirements() {

    const typeInput = document.getElementById("request_type");
    if (!typeInput) return;

    const type = typeInput.value;

    const res = await fetch(`${API}/requirements/${type}`);
    const data = await res.json();

    document.getElementById("requirements").innerHTML = `
        <div class="result-card">
            <p><strong>Minimum Attendance:</strong> ${data.attendance_threshold}%</p>
            <p><strong>Maximum Backlogs:</strong> ${data.max_backlogs}</p>
            <p><strong>Required Documents:</strong> ${data.required_documents.join(", ")}</p>
            <p><strong>Approval Flow:</strong> ${data.approval_chain.join(" → ")}</p>
        </div>
    `;

    document.getElementById("docChecklist").innerHTML = `
        <h4>Checklist</h4>
        <ul>
            <li id="casteCheck">❌ Caste Certificate not uploaded</li>
            <li id="incomeCheck">❌ Income Certificate not uploaded</li>
        </ul>
    `;
}

function showStudentResult(data) {

    const stages = [
        "Student",
        "Advisor",
        "HOD",
        "Office",
        "Principal"
    ];

    let workflowHTML = "<div class='workflow-container'>";

    stages.forEach(stage => {

        let className = "workflow-step";

        if (stage === data.current_stage) {
            className += " active";
        }

        workflowHTML += `
            <div class="${className}">
                ${stage}
            </div>
        `;
    });

    workflowHTML += "</div>";

    document.getElementById("response").innerHTML = `
        <div class="result-card">
            <h3>${data.message}</h3>

            <div class="progress-container">
                <div class="progress-bar"
                     style="width:${data.approval_probability}%">
                    ${data.approval_probability}%
                </div>
            </div>

            <h4>Workflow Tracking</h4>
            ${workflowHTML}
        </div>
    `;
}

/* =====================================================
   STUDENT HISTORY
===================================================== */

async function loadStudentRequests() {

    const studentId =
        document.getElementById("student_id")?.value;

    if (!studentId) {
        alert("Please enter your Student ID first.");
        return;
    }

    const res =
        await fetch(`${API}/student_requests/${studentId}`);

    const data = await res.json();

    let html = "";

    if (data.length === 0) {
        html = "<p>No applications found.</p>";
    }

    data.forEach(req => {

        let statusColor = "#f6c23e";

        if (req.status === "Approved")
            statusColor = "#1cc88a";

        if (req.status === "Rejected")
            statusColor = "#e74a3b";

        html += `
            <div class="request-card">
                <p><strong>Status:</strong>
                    <span style="color:${statusColor}">
                        ${req.status}
                    </span>
                </p>
                <p><strong>Score:</strong>
                    ${req.approval_probability}%</p>
                <p><strong>Current Stage:</strong>
                    ${req.current_stage}</p>
        `;

        if (req.status === "Rejected" && req.rejection_reason) {
            html += `
                <p style="color:#e74a3b;">
                    <strong>Rejection Reason:</strong>
                    ${req.rejection_reason}
                </p>
            `;
        }

        html += `</div>`;
    });

    document.getElementById("myRequests").innerHTML = html;
}

/* =====================================================
   AUTHORITY DASHBOARD
===================================================== */

async function loadRequests() {

    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");

    const roleTitle = document.getElementById("roleTitle");
    if (roleTitle)
        roleTitle.innerText = role + " Dashboard";

    const res = await fetch(`${API}/requests/${role}`);
    const data = await res.json();

    let html = "";

    data.forEach(req => {

        html += `
            <div class="request-card">
                <p><strong>Name:</strong> ${req.name}</p>
                <p><strong>Attendance:</strong> ${req.attendance}%</p>
                <p><strong>Backlogs:</strong> ${req.backlogs}</p>
                <p><strong>Score:</strong> ${req.approval_probability}%</p>

                <div class="button-group">
                    <button onclick="approve(${req.id}, '${role}')">
                        Approve
                    </button>

                    <button class="reject-btn"
                        onclick="openRejectModal(${req.id}, '${role}')">
                        Reject
                    </button>
                </div>
            </div>
        `;
    });

    document.getElementById("requests").innerHTML = html;
}

async function approve(id, role) {
    await fetch(`${API}/approve/${id}/${role}`, {
        method: "POST"
    });
    loadRequests();
}

/* ---------------- REJECT MODAL ---------------- */

function openRejectModal(id, role) {
    rejectRequestId = id;
    rejectRole = role;
    document.getElementById("rejectModal").style.display = "flex";
}

function closeModal() {
    document.getElementById("rejectModal").style.display = "none";
    document.getElementById("rejectReason").value = "";
}

async function confirmReject() {

    const reason =
        document.getElementById("rejectReason").value.trim();

    if (!reason) {
        alert("Rejection reason is required.");
        return;
    }

    const formData = new FormData();
    formData.append("reason", reason);

    await fetch(
        `${API}/reject/${rejectRequestId}/${rejectRole}`,
        {
            method: "POST",
            body: formData
        }
    );

    closeModal();
    loadRequests();
}

/* =====================================================
   ADMIN
===================================================== */

function simulateDomain() {

    const select = document.getElementById("domainSelect");
    if (!select) return;

    const domain = select.value;

    let preview = "";

    if (domain === "college")
        preview = "Student → Advisor → HOD → Office → Principal";

    if (domain === "healthcare")
        preview = "Patient → Doctor → Insurance → Hospital Admin";

    if (domain === "government")
        preview = "Citizen → Officer → Department → Collector";

    document.getElementById("domainPreview").innerText = preview;
}

async function adminViewRules() {

    const typeInput =
        document.getElementById("adminRequestType");

    if (!typeInput) return;

    const type = typeInput.value;

    const res =
        await fetch(`${API}/requirements/${type}`);

    const data = await res.json();

    document.getElementById("adminRulesDisplay").innerHTML = `
        <p><strong>Attendance:</strong> ${data.attendance_threshold}</p>
        <p><strong>Backlogs:</strong> ${data.max_backlogs}</p>
        <p><strong>Documents:</strong> ${data.required_documents.join(", ")}</p>
        <p><strong>Flow:</strong> ${data.approval_chain.join(" → ")}</p>
    `;
}