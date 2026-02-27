from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
        password="Ganga@2005",  # CHANGE THIS
        database="workflow_db"
    )

# ---------------- INTELLIGENT LAYER (Scholarship Rule) ---------------- #

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
        issues.append("Backlogs present (Must be zero)")

    if caste_present:
        score += 25
    else:
        issues.append("Caste certificate missing")

    if income_present:
        score += 25
    else:
        issues.append("Income certificate missing")

    return score, issues

# ---------------- GET REQUIREMENTS ---------------- #

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
            raise HTTPException(status_code=404, detail="Request type not found")

        cursor.execute(
            "SELECT * FROM rules WHERE request_type_id=%s",
            (rtype["id"],)
        )
        rule = cursor.fetchone()

        if not rule:
            raise HTTPException(status_code=404, detail="Rules not configured")

        required_docs = []
        if rule["required_documents"]:
            required_docs = rule["required_documents"].split(",")

        return {
            "attendance_threshold": rule["attendance_threshold"],
            "max_backlogs": rule["max_backlogs"],
            "required_documents": required_docs,
            "approval_chain": rule["approval_chain"].split(",")
        }

    finally:
        cursor.close()
        db.close()

# ---------------- SUBMIT REQUEST ---------------- #

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
        # Fetch student
        cursor.execute(
            "SELECT * FROM users WHERE id=%s AND role='student'",
            (student_id,)
        )
        student = cursor.fetchone()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        # Fetch request type
        cursor.execute(
            "SELECT * FROM request_types WHERE LOWER(name)=LOWER(%s)",
            (request_type,)
        )
        rtype = cursor.fetchone()

        if not rtype:
            raise HTTPException(status_code=404, detail="Request type not found")

        # Fetch rule
        cursor.execute(
            "SELECT * FROM rules WHERE request_type_id=%s",
            (rtype["id"],)
        )
        rule = cursor.fetchone()

        if not rule:
            raise HTTPException(status_code=404, detail="Rules not configured")

        threshold = rule["attendance_threshold"]
        approval_chain = rule["approval_chain"].split(",")

        # Document presence check
        caste_present = caste_doc is not None
        income_present = income_doc is not None

        # Scholarship-specific scoring
        score, issues = calculate_scholarship_score(
            student["attendance"],
            student["backlogs"],
            threshold,
            caste_present,
            income_present
        )

        # Save files
        upload_dir = "../uploads"
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

        # Insert request
        cursor.execute("""
            INSERT INTO requests
            (student_id, request_type_id, status,
             approval_probability, current_stage, document_path)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            student_id,
            rtype["id"],
            "Pending",
            score,
            approval_chain[0],
            f"Caste:{caste_path},Income:{income_path}"
        ))

        db.commit()

        return {
            "message": "Request submitted",
            "approval_probability": score,
            "current_stage": approval_chain[0],
            "validation_issues": issues
        }

    finally:
        cursor.close()
        db.close()

# ---------------- DASHBOARD ---------------- #

@app.get("/requests/{role}")
def get_requests(role: str):

    valid_roles = ["Advisor", "HOD", "Office", "Principal"]

    if role not in valid_roles:
        raise HTTPException(status_code=403, detail="Unauthorized role")

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT r.id, u.name, u.attendance, u.backlogs,
                   r.approval_probability, r.current_stage
            FROM requests r
            JOIN users u ON r.student_id = u.id
            WHERE r.current_stage=%s AND r.status='Pending'
        """, (role,))

        return cursor.fetchall()

    finally:
        cursor.close()
        db.close()

# ---------------- APPROVE ---------------- #

@app.post("/approve/{request_id}/{role}")
def approve_request(request_id: int, role: str):

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT * FROM requests WHERE id=%s",
            (request_id,)
        )
        request = cursor.fetchone()

        if not request:
            raise HTTPException(status_code=404, detail="Request not found")

        cursor.execute("""
            SELECT approval_chain
            FROM rules
            WHERE request_type_id=%s
        """, (request["request_type_id"],))
        rule = cursor.fetchone()

        chain = rule["approval_chain"].split(",")

        if request["current_stage"] != role:
            raise HTTPException(status_code=403, detail="Not authorized")

        index = chain.index(role)

        if index == len(chain) - 1:
            cursor.execute("""
                UPDATE requests
                SET status='Approved', current_stage='Completed'
                WHERE id=%s
            """, (request_id,))
        else:
            next_stage = chain[index + 1]
            cursor.execute("""
                UPDATE requests
                SET current_stage=%s
                WHERE id=%s
            """, (next_stage, request_id))

        db.commit()

        return {"message": "Moved to next stage"}

    finally:
        cursor.close()
        db.close()