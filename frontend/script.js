const API = "http://127.0.0.1:8000";

// ---------------- LOGIN ----------------

function login() {

    const role = document.getElementById("role").value;
    const errorText = document.getElementById("loginError");

    if (errorText) errorText.textContent = "";

    if (!role) {
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

// ---------------- REQUIREMENTS ----------------

async function getRequirements() {

    const type = document.getElementById("request_type").value;

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

    let checklist = "<h4>Checklist</h4><ul>";
    checklist += `<li id="casteCheck">❌ Caste Certificate not uploaded</li>`;
    checklist += `<li id="incomeCheck">❌ Income Certificate not uploaded</li>`;
    checklist += "</ul>";

    document.getElementById("docChecklist").innerHTML = checklist;
}

// ---------------- DOCUMENT UPLOAD CHECK ----------------

const casteInput = document.getElementById("caste_doc");
const incomeInput = document.getElementById("income_doc");
const submitBtn = document.getElementById("submitBtn");

function validateUploads() {

    if (casteInput?.files.length > 0 &&
        incomeInput?.files.length > 0) {

        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

casteInput?.addEventListener("change", function() {
    document.getElementById("casteCheck").innerHTML =
        "✅ Caste Certificate uploaded";
    validateUploads();
});

incomeInput?.addEventListener("change", function() {
    document.getElementById("incomeCheck").innerHTML =
        "✅ Income Certificate uploaded";
    validateUploads();
});

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

        formData.append("caste_doc", casteInput.files[0]);
        formData.append("income_doc", incomeInput.files[0]);

        const res = await fetch(`${API}/submit/`, {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        showResult(data);
    }
});

function showResult(data) {

    document.getElementById("response").innerHTML = `
        <div class="result-card">
            <h3>${data.message}</h3>
            <p><strong>Eligibility Score:</strong> ${data.approval_probability}%</p>
            <p><strong>Current Stage:</strong> ${data.current_stage}</p>
        </div>
    `;
}

// ---------------- DASHBOARD ----------------

async function loadRequests() {

    const params =
        new URLSearchParams(window.location.search);
    const role = params.get("role");

    document.getElementById("roleTitle").innerText =
        role + " Dashboard";

    const res = await fetch(`${API}/requests/${role}`);
    const data = await res.json();

    let html = "";

    data.forEach(req => {
        html += `
            <div class="card">
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

// ---------------- ADMIN ----------------

function simulateDomain() {

    const domain =
        document.getElementById("domainSelect").value;

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

    const type =
        document.getElementById("adminRequestType").value;

    const res =
        await fetch(`${API}/requirements/${type}`);

    const data = await res.json();

    document.getElementById("adminRulesDisplay").innerHTML =
        `<p>Attendance: ${data.attendance_threshold}</p>
         <p>Backlogs: ${data.max_backlogs}</p>
         <p>Documents: ${data.required_documents.join(", ")}</p>
         <p>Flow: ${data.approval_chain.join(" → ")}</p>`;
}