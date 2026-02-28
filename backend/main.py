import PyPDF2
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import mysql.connector
import shutil
import os
import re

app = FastAPI()

# ---------------- CORS ---------------- #

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- DATABASE ---------------- #


def get_db():
    return mysql.connector.connect(
        host="localhost", user="root", password="Ganga@2005", database="workflow_db"
    )


# ---------------- PDF EXTRACTION ---------------- #


def extract_text_from_pdf(path):
    text = ""
    try:
        with open(path, "rb") as file:
            reader = PyPDF2.PdfReader(file)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text
    except Exception as e:
        print("PDF Extraction Error:", e)

    print("Extracted Text:", text)
    return text.lower()


# ---------------- DOCUMENT VALIDATION ---------------- #
def validate_income_certificate(path):

    text = extract_text_from_pdf(path)

    issues = []
    score = 0
    extracted_income = None

    # Basic format validation
    if "income certificate" not in text:
        issues.append("Income certificate keyword missing")

    if "government" not in text:
        issues.append("Government authority missing")

    # Extract income amount using regex
    match = re.search(r"(\d{1,2}[,]?\d{3}[,]?\d{3})", text)

    if match:
        extracted_income = int(match.group(1).replace(",", ""))

        if extracted_income <= 600000:
            score += 25

        elif extracted_income <= 1000000:
            score += 10

        else:
            score -= 20
            issues.append("Income exceeds preferred threshold (6 lakh)")
    else:
        issues.append("Annual income amount not detected")

    return score, issues, extracted_income


def validate_caste_certificate(path, student_name):

    text = extract_text_from_pdf(path)

    issues = []
    score = 0
    detected_caste = None

    # Check student name
    if student_name.lower() not in text:
        issues.append("Student name not found in caste certificate")

    # Detect caste category
    if "scheduled caste" in text or " sc " in text:
        score += 25
        detected_caste = "SC"

    elif "scheduled tribe" in text or " st " in text:
        score += 25
        detected_caste = "ST"

    elif "obc" in text:
        score += 15
        detected_caste = "OBC"

    elif "general" in text:
        detected_caste = "General"

    else:
        issues.append("Caste category not detected")

    return score, issues, detected_caste


# ---------------- ELIGIBILITY ---------------- #


def calculate_scholarship_score(
    attendance, backlogs, threshold, caste_present, income_present
):

    score = 0
    issues = []

    if attendance >= threshold:
        score += 25
    else:
        issues.append("Attendance below required threshold")

    if backlogs == 0:
        score += 25
    else:
        issues.append("Backlogs must be zero")

    if caste_present:
        score += 25
    else:
        issues.append("Caste certificate missing")

    if income_present:
        score += 25
    else:
        issues.append("Income certificate missing")

    return score, issues


# ---------------- REQUIREMENTS ---------------- #


@app.get("/requirements/{request_type}")
def get_requirements(request_type: str):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT * FROM request_types WHERE LOWER(name)=LOWER(%s)", (request_type,)
        )
        rtype = cursor.fetchone()

        if not rtype:
            raise HTTPException(404, "Request type not found")

        cursor.execute("SELECT * FROM rules WHERE request_type_id=%s", (rtype["id"],))
        rule = cursor.fetchone()

        return {
            "attendance_threshold": rule["attendance_threshold"],
            "max_backlogs": rule["max_backlogs"],
            "required_documents": rule["required_documents"].split(","),
            "approval_chain": rule["approval_chain"].split(","),
        }

    finally:
        cursor.close()
        db.close()


# ---------------- SUBMIT ---------------- #


@app.post("/submit/")
def submit_request(
    student_id: int = Form(...),
    request_type: str = Form(...),
    role: str = Form(...),
    caste_doc: UploadFile = File(None),
    income_doc: UploadFile = File(None),
):

    if role.lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can submit")

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        # ---------------- FETCH STUDENT ----------------
        cursor.execute(
            "SELECT * FROM users WHERE id=%s AND role='student'", (student_id,)
        )
        student = cursor.fetchone()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        # ---------------- FETCH REQUEST TYPE ----------------
        cursor.execute(
            "SELECT * FROM request_types WHERE LOWER(name)=LOWER(%s)", (request_type,)
        )
        rtype = cursor.fetchone()

        if not rtype:
            raise HTTPException(status_code=404, detail="Request type not found")

        # ---------------- FETCH RULE ----------------
        cursor.execute("SELECT * FROM rules WHERE request_type_id=%s", (rtype["id"],))
        rule = cursor.fetchone()

        if not rule:
            raise HTTPException(status_code=404, detail="Rules not configured")

        threshold = rule["attendance_threshold"]
        approval_chain = rule["approval_chain"].split(",")

        # ---------------- ELIGIBILITY SCORE ----------------
        caste_present = caste_doc is not None
        income_present = income_doc is not None

        eligibility_score, eligibility_issues = calculate_scholarship_score(
            student["attendance"],
            student["backlogs"],
            threshold,
            caste_present,
            income_present,
        )

        # ---------------- SAVE FILES ----------------
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)

        caste_path = None
        income_path = None

        if caste_doc:
            caste_path = os.path.join(upload_dir, caste_doc.filename)
            with open(caste_path, "wb") as buffer:
                shutil.copyfileobj(caste_doc.file, buffer)

        if income_doc:
            income_path = os.path.join(upload_dir, income_doc.filename)
            with open(income_path, "wb") as buffer:
                shutil.copyfileobj(income_doc.file, buffer)

        # =====================================================
        # STRICT DOCUMENT VALIDATION (YOUR ORIGINAL LOGIC)
        # =====================================================

        document_score = 0
        document_issues = []

        # ---- Caste Validation ----
        if caste_path:
            text = extract_text_from_pdf(caste_path)

            mandatory = ["government", "caste certificate", "authority"]
            missing = [m for m in mandatory if m not in text]

            if missing:
                document_issues.append("Invalid caste certificate format")
            elif student["name"].lower() not in text:
                document_issues.append("Student name not found in caste certificate")
            else:
                document_score += 100
        else:
            document_issues.append("Caste certificate not uploaded")

        # ---- Income Validation ----
        if income_path:
            text = extract_text_from_pdf(income_path)

            mandatory = ["income certificate", "annual income", "government"]
            missing = [m for m in mandatory if m not in text]

            if missing:
                document_issues.append("Invalid income certificate format")
            else:
                document_score += 100
        else:
            document_issues.append("Income certificate not uploaded")

        # If both uploaded → average
        if caste_path and income_path:
            document_score = document_score / 2

        # =====================================================
        # NEW POLICY INTELLIGENCE (ADDED FEATURE)
        # =====================================================

        ai_notes = []
        policy_bonus = 0
        extracted_income = None
        detected_caste = None

        caste_text = extract_text_from_pdf(caste_path) if caste_path else ""
        income_text = extract_text_from_pdf(income_path) if income_path else ""

        # ---- Income Policy ----
        income_match = re.search(r"(\d{1,2}[,]?\d{3}[,]?\d{3})", income_text)

        if income_match:
            extracted_income = int(income_match.group(1).replace(",", ""))

            if extracted_income <= 600000:
                policy_bonus += 25
                ai_notes.append("Income below 6 lakh – High approval priority")

            elif extracted_income <= 1000000:
                policy_bonus += 10
                ai_notes.append("Income moderate – Medium priority")

            else:
                policy_bonus -= 20
                ai_notes.append("Income above 10 lakh – Lower approval priority")
        else:
            ai_notes.append("Income amount not clearly detected")

        # ---- Caste Policy ----
        if "scheduled caste" in caste_text or " sc " in caste_text:
            policy_bonus += 25
            detected_caste = "SC"
            ai_notes.append("SC category detected – Higher priority")

        elif "scheduled tribe" in caste_text or " st " in caste_text:
            policy_bonus += 25
            detected_caste = "ST"
            ai_notes.append("ST category detected – Higher priority")

        elif "obc" in caste_text:
            policy_bonus += 15
            detected_caste = "OBC"
            ai_notes.append("OBC category detected – Priority consideration")

        elif "general" in caste_text:
            detected_caste = "General"
            ai_notes.append("General category – Standard evaluation")

        else:
            ai_notes.append("Caste category not clearly detected")

        # =====================================================
        # FINAL SCORE (YOUR LOGIC + POLICY BONUS)
        # =====================================================

        # Keep your strict penalty rule
        if document_score < 50:
            final_score = eligibility_score * 0.4
        else:
            final_score = (eligibility_score + document_score) / 2

        # Add policy bonus on top
        final_score += policy_bonus

        # Clamp between 0 and 100
        if final_score > 100:
            final_score = 100
        if final_score < 0:
            final_score = 0

        # ---------------- INSERT REQUEST ----------------
        cursor.execute(
            """
            INSERT INTO requests
            (student_id, request_type_id, status,
             approval_probability, current_stage, document_path)
            VALUES (%s, %s, %s, %s, %s, %s)
        """,
            (
                student_id,
                rtype["id"],
                "Pending",
                final_score,
                approval_chain[0],
                f"Caste:{caste_path},Income:{income_path}",
            ),
        )

        db.commit()

        return {
            "message": "Request submitted",
            "approval_probability": final_score,
            "eligibility_score": eligibility_score,
            "document_authenticity_score": document_score,
            "policy_bonus": policy_bonus,
            "validation_issues": eligibility_issues,
            "document_issues": document_issues,
            "ai_notes": ai_notes,
            "detected_income": extracted_income,
            "detected_caste": detected_caste,
            "current_stage": approval_chain[0],
        }

    finally:
        cursor.close()
        db.close()


# ---------------- APPROVE ---------------- #


@app.post("/approve/{request_id}/{role}")
def approve(request_id: int, role: str):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM requests WHERE id=%s", (request_id,))
        request = cursor.fetchone()

        cursor.execute(
            """
            SELECT approval_chain FROM rules
            WHERE request_type_id=%s
        """,
            (request["request_type_id"],),
        )
        rule = cursor.fetchone()

        chain = rule["approval_chain"].split(",")

        index = chain.index(role)

        if index == len(chain) - 1:
            cursor.execute(
                """
                UPDATE requests
                SET status='Approved', current_stage='Completed'
                WHERE id=%s
            """,
                (request_id,),
            )
        else:
            next_stage = chain[index + 1]
            cursor.execute(
                """
                UPDATE requests
                SET current_stage=%s
                WHERE id=%s
            """,
                (next_stage, request_id),
            )

        db.commit()
        return {"message": "Moved to next stage"}

    finally:
        cursor.close()
        db.close()


# ---------------- REJECT ---------------- #


@app.post("/reject/{request_id}/{role}")
def reject(request_id: int, role: str, reason: str = Form(...)):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM requests WHERE id=%s", (request_id,))
        request = cursor.fetchone()

        if not request:
            raise HTTPException(status_code=404, detail="Request not found")

        # DEBUG PRINT
        print("Current Stage:", request["current_stage"])
        print("Role Trying to Reject:", role)

        # Case-insensitive comparison
        if request["current_stage"].strip().lower() != role.strip().lower():
            raise HTTPException(status_code=403, detail="Not authorized to reject")

        cursor.execute("""
            UPDATE requests
            SET status='Rejected',
                current_stage='Rejected',
                rejection_reason=%s
            WHERE id=%s
        """, (reason, request_id))

        db.commit()

        return {"message": "Rejected "}

    finally:
        cursor.close()
        db.close()

# ---------------- STUDENT TRACKING ---------------- #


@app.get("/student_requests/{student_id}")
def student_requests(student_id: int):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, status,
                   approval_probability,
                   current_stage,
                   rejection_reason
            FROM requests
            WHERE student_id=%s
            ORDER BY id DESC
        """,
            (student_id,),
        )

        return cursor.fetchall()

    finally:
        cursor.close()
        db.close()


# ---------------- DASHBOARD PENDING REQUESTS ---------------- #


@app.get("/requests/{role}")
def get_requests(role: str):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT r.id, u.name, u.attendance, u.backlogs,
                   r.approval_probability, r.current_stage
            FROM requests r
            JOIN users u ON r.student_id = u.id
            WHERE LOWER(r.current_stage)=LOWER(%s)
            AND r.status='Pending'
        """,
            (role,),
        )

        return cursor.fetchall()

    finally:
        cursor.close()
        db.close()
