"""Server-side patient scope shared by every record endpoint.

Workers see records for patients they registered. Clinical accounts see
records registered by workers or clinical accounts. Administrators see all.
The creator's user ID remains on each record for audit and ownership.
"""
import re


CLINICAL_ROLES = {"medical_officer", "specialist"}


def patient_scope(user, alias="p"):
    """Return a parameterized SQL predicate for a trusted patients alias."""
    if not re.fullmatch(r"[a-z][a-z0-9_]*", alias):
        raise ValueError("Invalid SQL alias")
    role = user.get("role") if user else None
    if role == "admin":
        return "1=1", ()
    if role == "health_worker":
        return f"{alias}.created_by=?", (user["id"],)
    if role in CLINICAL_ROLES:
        return (f"EXISTS (SELECT 1 FROM users record_owner WHERE record_owner.id={alias}.created_by "
                "AND record_owner.role IN ('health_worker','medical_officer','specialist'))", ())
    return "0=1", ()


def can_view_patient(db, user, patient_id):
    predicate, params = patient_scope(user)
    return bool(db.execute(f"SELECT 1 FROM patients p WHERE p.id=? AND {predicate}",
                           (patient_id, *params)).fetchone())


def can_view_screening(db, user, screening_id):
    predicate, params = patient_scope(user)
    return bool(db.execute("SELECT 1 FROM screenings s JOIN patients p ON p.id=s.patient_id "
                           f"WHERE s.id=? AND {predicate}", (screening_id, *params)).fetchone())
