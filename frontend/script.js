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

    // File upload listeners
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

    // Submit form
    const form = document.getElementById("submitForm");

    form?.addEventListener("submit", async function (e) {

        e.preventDefault();

        const formData = new FormData();
        formData.append("student_id",
            document.getElementById("student_id").value);
        formData.append("request_type",
            document.getElementById("request_type").value);
        formData.append("role", "student");

        formData.append("caste_doc", casteInput?.files[0]);
        formData.append("income_doc", incomeInput?.files[0]);

        const res = await fetch(`${API}/submit/`, {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        showStudentResult(data);
        loadStudentRequests(); // refresh immediately after submit
    });

    /* 🔥 AUTO REFRESH STUDENT DASHBOARD (Safe Version) */
    setInterval(() => {
        const studentId = document.getElementById("student_id")?.value;

        // Only refresh if student page is active and ID exists
        if (studentId && document.getElementById("myRequests")) {
            loadStudentRequests();
        }
    }, 5000); // every 5 seconds

});

    incomeInput?.addEventListener("change", function () {
        const check = document.getElementById("incomeCheck");
        if (check) check.innerHTML = "✅ Income Certificate uploaded";
        validateUploads();
    });

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

        // 🔥 Auto refresh tracking after submit
        loadStudentRequests();
    });



/* =====================================================
   STUDENT SECTION
===================================================== */

async function getRequirements() {

    const type = document.getElementById("request_type").value;

    if (!type) {
        alert("Select request type first");
        return;
    }

    const res = await fetch(`${API}/requirements/${type}`);

    if (!res.ok) {
        alert("Failed to load requirements");
        return;
    }

    const data = await res.json();

    document.getElementById("requirements").innerHTML = `
        <div class="result-card">
            <h4>AI Requirements Analysis</h4>
            <p><strong>Minimum Attendance:</strong> ${data.attendance_threshold}%</p>
            <p><strong>Maximum Backlogs:</strong> ${data.max_backlogs}</p>
            <p><strong>Required Documents:</strong> ${data.required_documents.join(", ")}</p>
            <p><strong>Approval Flow:</strong> ${data.approval_chain.join(" → ")}</p>
        </div>
    `;
}

function showStudentResult(data) {

    const probability = Math.round(data.approval_probability);

    /* ===============================
       AI DECISION LOGIC (Frontend)
    =============================== */

    let recommendation = "";
    let badgeClass = "";
    let confidence = "";

    if (probability >= 75) {
        recommendation = "Likely to be Approved";
        badgeClass = "badge-green";
        confidence = "High Confidence";
    }
    else if (probability >= 50) {
        recommendation = "Moderate Risk - Needs Review";
        badgeClass = "badge-yellow";
        confidence = "Medium Confidence";
    }
    else {
        recommendation = "High Risk of Rejection";
        badgeClass = "badge-red";
        confidence = "Low Confidence";
    }

    let documentStatus = "";
    if (data.document_authenticity_score >= 70) {
        documentStatus = `<span class="badge-green">Documents Verified</span>`;
    }
    else if (data.document_authenticity_score >= 40) {
        documentStatus = `<span class="badge-yellow">Documents Partially Valid</span>`;
    }
    else {
        documentStatus = `<span class="badge-red">Documents Suspicious / Invalid</span>`;
    }

    /* ===============================
       WORKFLOW TRACKING
    =============================== */

    const stages = ["Student", "Advisor", "HOD", "Office", "Principal"];
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

    /* ===============================
       ISSUE DISPLAY
    =============================== */

    let issuesHTML = "";

    if (data.validation_issues?.length > 0) {
        issuesHTML += `
            <h4>Eligibility Issues</h4>
            <ul>
                ${data.validation_issues.map(i => `<li>${i}</li>`).join("")}
            </ul>
        `;
    }

    if (data.document_issues?.length > 0) {
        issuesHTML += `
            <h4>Document Validation Issues</h4>
            <ul>
                ${data.document_issues.map(i => `<li>${i}</li>`).join("")}
            </ul>
        `;
    }

    /* ===============================
       FINAL UI OUTPUT
    =============================== */

    document.getElementById("response").innerHTML = `
        <div class="result-card">

            <h3>${data.message}</h3>

            <div class="ai-decision ${badgeClass}">
                ${recommendation}
            </div>

            <p><strong>Confidence Level:</strong> ${confidence}</p>

            <div class="progress-container">
                <div class="progress-bar"
                     style="width:${probability}%">
                    ${probability}%
                </div>
            </div>

            <p><strong>Eligibility Score:</strong> ${data.eligibility_score ?? "-"}%</p>
            <p><strong>Document Authenticity Score:</strong> ${data.document_authenticity_score ?? "-"}%</p>

            <p><strong>Document Status:</strong> ${documentStatus}</p>

            ${issuesHTML}

            <h4>Workflow Tracking</h4>
            ${workflowHTML}

        </div>
    `;
}
/* =====================================================
   STUDENT HISTORY  (ONLY ONE VERSION)
===================================================== */

async function loadStudentRequests() {

    const studentId =
        document.getElementById("student_id")?.value;

    if (!studentId) return;

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

        html += `
                ${renderFlowCircle(req.current_stage)}
            </div>
        `;
    });

    document.getElementById("myRequests").innerHTML = html;
}

/* =====================================================
   FLOW RENDER (Single Version)
===================================================== */

function renderFlowCircle(stage) {

    const stages = ["Advisor", "HOD", "Office", "Principal"];

    let html = `<div class="flow">`;

    stages.forEach(s => {

        let cls = "flow-step";

        if (stage === "Rejected") {
            cls += " rejected";
        }
        else if (stage === "Completed") {
            cls += " completed";
        }
        else if (s === stage) {
            cls += " active";
        }

        html += `<span class="${cls}">${s}</span>`;
    });

    html += `</div>`;

    return html;
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

/* =====================================================
   REJECT MODAL
===================================================== */

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