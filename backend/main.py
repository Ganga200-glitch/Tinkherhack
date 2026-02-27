import PyPDF2
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import mysql.connector
import shutil
import os

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
        host="localhost",
        user="root",
        password="Ganga@2005",
        database="workflow_db"
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

def validate_caste_certificate(path, student_name):
    text = extract_text_from_pdf(path)

    required = [
        "government",
        "caste certificate",
        student_name.lower(),
        "issued",
        "authority"
    ]

    score = 0
    issues = []

    for word in required:
        if word in text:
            score += 20
        else:
            issues.append(f"Missing keyword: {word}")

    return score, issues


def validate_income_certificate(path):
    text = extract_text_from_pdf(path)

    required = [
        "income certificate",
        "annual income",
        "government",
        "year"
    ]

    score = 0
    issues = []

    for word in required:
        if word in text:
            score += 25
        else:
            issues.append(f"Missing keyword: {word}")

    return score, issues

# ---------------- ELIGIBILITY ---------------- #

def calculate_scholarship_score(attendance, backlogs, threshold,
                                caste_present, income_present):

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
            "SELECT * FROM request_types WHERE LOWER(name)=LOWER(%s)",
            (request_type,)
        )
        rtype = cursor.fetchone()

        if not rtype:
            raise HTTPException(404, "Request type not found")

        cursor.execute(
            "SELECT * FROM rules WHERE request_type_id=%s",
            (rtype["id"],)
        )
        rule = cursor.fetchone()

        return {
            "attendance_threshold": rule["attendance_threshold"],
            "max_backlogs": rule["max_backlogs"],
            "required_documents": rule["required_documents"].split(","),
            "approval_chain": rule["approval_chain"].split(",")
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
    income_doc: UploadFile = File(None)
):

    if role.lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can submit")

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        # ---------------- FETCH STUDENT ----------------
        cursor.execute(
            "SELECT * FROM users WHERE id=%s AND role='student'",
            (student_id,)
        )
        student = cursor.fetchone()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        # ---------------- FETCH REQUEST TYPE ----------------
        cursor.execute(
            "SELECT * FROM request_types WHERE LOWER(name)=LOWER(%s)",
            (request_type,)
        )
        rtype = cursor.fetchone()

        if not rtype:
            raise HTTPException(status_code=404, detail="Request type not found")

        # ---------------- FETCH RULE ----------------
        cursor.execute(
            "SELECT * FROM rules WHERE request_type_id=%s",
            (rtype["id"],)
        )
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
            income_present
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

        # ---------------- STRICT DOCUMENT VALIDATION ----------------

        document_score = 0
        document_issues = []

        # ---- Caste Certificate Validation ----
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

        # ---- Income Certificate Validation ----
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

        # If both documents uploaded → average score
        if caste_path and income_path:
            document_score = document_score / 2

        # ---------------- FINAL SCORE LOGIC ----------------

        # STRICT PENALTY IF DOCUMENT INVALID
        if document_score < 50:
            final_score = eligibility_score * 0.4
        else:
            final_score = (eligibility_score + document_score) / 2

        # ---------------- INSERT REQUEST ----------------
        cursor.execute("""
            INSERT INTO requests
            (student_id, request_type_id, status,
             approval_probability, current_stage, document_path)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            student_id,
            rtype["id"],
            "Pending",
            final_score,
            approval_chain[0],
            f"Caste:{caste_path},Income:{income_path}"
        ))

        db.commit()

        return {
            "message": "Request submitted",
            "approval_probability": final_score,
            "eligibility_score": eligibility_score,
            "document_authenticity_score": document_score,
            "validation_issues": eligibility_issues,
            "document_issues": document_issues,
            "current_stage": approval_chain[0]
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

        cursor.execute("""
            SELECT approval_chain FROM rules
            WHERE request_type_id=%s
        """, (request["request_type_id"],))
        rule = cursor.fetchone()

        chain = rule["approval_chain"].split(",")

        index = chain.index(role)

        if index == len(chain)-1:
            cursor.execute("""
                UPDATE requests
                SET status='Approved', current_stage='Completed'
                WHERE id=%s
            """, (request_id,))
        else:
            next_stage = chain[index+1]
            cursor.execute("""
                UPDATE requests
                SET current_stage=%s
                WHERE id=%s
            """, (next_stage, request_id))

        db.commit()
        return {"message":"Moved to next stage"}

    finally:
        cursor.close()
        db.close()

# ---------------- REJECT ---------------- #

@app.post("/reject/{request_id}/{role}")
def reject(request_id: int, role: str, reason: str = Form(...)):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("""
            UPDATE requests
            SET status='Rejected',
                current_stage='Rejected',
                rejection_reason=%s
            WHERE id=%s
        """, (reason, request_id))

        db.commit()
        return {"message":"Rejected successfully"}

    finally:
        cursor.close()
        db.close()

# ---------------- STUDENT TRACKING ---------------- #

@app.get("/student_requests/{student_id}")
def student_requests(student_id: int):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id, status,
                   approval_probability,
                   current_stage,
                   rejection_reason
            FROM requests
            WHERE student_id=%s
            ORDER BY id DESC
        """, (student_id,))

        return cursor.fetchall()

    finally:
        cursor.close()
        db.close()