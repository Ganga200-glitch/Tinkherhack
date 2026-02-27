const API = "http://127.0.0.1:8000";

// ---------------- LOGIN ----------------

function login() {
    const role = document.getElementById("role").value;

    if (role === "student") {
        window.location.href = "student.html";
    } else {
        window.location.href = "dashboard.html?role=" + role;
    }
}

function goHome() {
    window.location.href = "login.html";
}

// ---------------- REQUIREMENTS ----------------

async function getRequirements() {

    const type = document.getElementById("request_type").value;

    const res = await fetch(`${API}/requirements/${type}`);
    const data = await res.json();

    document.getElementById("requirements").innerHTML = `
        <p><strong>Attendance ≥</strong> ${data.attendance_threshold}</p>
        <p><strong>Max Backlogs:</strong> ${data.max_backlogs}</p>
        <p><strong>Documents Required:</strong> ${data.required_documents.join(", ")}</p>
        <p><strong>Approval Flow:</strong> ${data.approval_chain.join(" → ")}</p>
    `;
}

// ---------------- SUBMIT ----------------

document.addEventListener("submit", async function(e) {

    if (e.target.id === "submitForm") {

        e.preventDefault();

        const formData = new FormData();
        formData.append("student_id",
            document.getElementById("student_id").value);
        formData.append("request_type",
            document.getElementById("request_type").value);
        formData.append("role", "student");

        const casteFile =
            document.getElementById("caste_doc").files[0];
        const incomeFile =
            document.getElementById("income_doc").files[0];

        if (casteFile) formData.append("caste_doc", casteFile);
        if (incomeFile) formData.append("income_doc", incomeFile);

        const res = await fetch(`${API}/submit/`, {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        document.getElementById("response").textContent =
            JSON.stringify(data, null, 2);
    }
});

// ---------------- DASHBOARD ----------------

async function loadRequests() {

    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");

    document.getElementById("roleTitle").innerText =
        role + " Dashboard";

    const res = await fetch(`${API}/requests/${role}`);
    const data = await res.json();

    let html = "";

    data.forEach(req => {
        html += `
            <div class="request-card">
                <p><strong>Name:</strong> ${req.name}</p>
                <p><strong>Attendance:</strong> ${req.attendance}</p>
                <p><strong>Backlogs:</strong> ${req.backlogs}</p>
                <p><strong>Score:</strong> ${req.approval_probability}</p>
                <button onclick="approve(${req.id}, '${role}')">
                    Approve
                </button>
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
// -------- DOMAIN SIMULATION --------

function simulateDomain() {

    const domain =
        document.getElementById("domainSelect").value;

    let preview = "";

    if (domain === "college") {
        preview = `
            <p><strong>Flow:</strong>
            Student → Advisor → HOD → Office → Principal</p>
            <p><strong>Validation:</strong>
            Attendance, Backlogs, Documents</p>
        `;
    }

    if (domain === "healthcare") {
        preview = `
            <p><strong>Flow:</strong>
            Patient → Doctor → Insurance → Hospital Admin</p>
            <p><strong>Validation:</strong>
            Insurance eligibility, Medical documents</p>
        `;
    }

    if (domain === "government") {
        preview = `
            <p><strong>Flow:</strong>
            Citizen → Officer → Department Head → Collector</p>
            <p><strong>Validation:</strong>
            Income proof, Identity verification</p>
        `;
    }

    document.getElementById("domainPreview").innerHTML = preview;
}

// -------- ADMIN VIEW RULE --------

async function adminViewRules() {

    const type =
        document.getElementById("adminRequestType").value;

    const res =
        await fetch(`${API}/requirements/${type}`);

    const data = await res.json();

    document.getElementById("adminRulesDisplay").innerHTML = `
        <p><strong>Attendance:</strong> ${data.attendance_threshold}</p>
        <p><strong>Max Backlogs:</strong> ${data.max_backlogs}</p>
        <p><strong>Documents:</strong> ${data.required_documents.join(", ")}</p>
        <p><strong>Approval Chain:</strong> ${data.approval_chain.join(" → ")}</p>
    `;
}