"""Reporting, Compliance Analytics, and Secure Data Export Service.

Provides real-time PostgreSQL analytics queries and privacy-preserving CSV and
Excel (.xlsx) exports with formula injection defense (CWE-1236).
"""

import csv
from datetime import datetime, timedelta, timezone
import io
from typing import Any
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.models.kyc_session import KycSession
from backend.app.models.user import User
from backend.app.schemas.kyc import AdminAnalyticsResponse


def sanitize_for_spreadsheet(value: Any) -> str:
    """Sanitize string values to defend against Spreadsheet Formula Injection (CWE-1236).
    
    Prepends a single quotation mark (') if a string begins with dangerous prefix characters
    (=, +, -, @, \\t, \\r), ensuring spreadsheet software parses the cell strictly as literal text.
    """
    if value is None:
        return ""
    val_str = str(value)
    if not val_str:
        return ""
    trimmed = val_str.lstrip(" ")
    if trimmed and trimmed[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{val_str}"
    return val_str


class KycReportService:
    """Service governing administrative compliance statistics and secure reporting."""

    REPORT_HEADERS = [
        "Session ID",
        "Customer Name",
        "Customer Email",
        "Document Type",
        "Masked Document Number",
        "Workflow Status",
        "Admin Review Status",
        "Face Match Score (%)",
        "Face Match Status",
        "Submission Date (UTC)",
        "Review Date (UTC)",
        "Reviewer ID",
        "Rejection Reason",
    ]

    @classmethod
    def get_admin_analytics(cls, db: Session) -> AdminAnalyticsResponse:
        """Calculate real-time compliance metrics directly from PostgreSQL."""
        # 1. Total Registered Customers
        total_customers = db.execute(
            select(func.count(User.id)).where(User.role.has(name="CUSTOMER"))
        ).scalar() or 0

        # 2. Total KYC Applications
        total_applications = db.execute(
            select(func.count(KycSession.id))
        ).scalar() or 0

        # 3. Status Grouping
        status_rows = db.execute(
            select(KycSession.workflow_status, func.count(KycSession.id))
            .group_by(KycSession.workflow_status)
        ).all()
        status_breakdown = {str(row[0]): int(row[1]) for row in status_rows}

        approved_applications = status_breakdown.get("APPROVED", 0)
        rejected_applications = (
            status_breakdown.get("REJECTED", 0)
            + status_breakdown.get("OCR_FAILED", 0)
            + status_breakdown.get("FACE_MISMATCHED", 0)
        )
        cancelled_applications = status_breakdown.get("CANCELLED", 0)
        pending_applications = (
            status_breakdown.get("PENDING_ADMIN_REVIEW", 0)
            + status_breakdown.get("AWAITING_FACE_VERIFICATION", 0)
            + status_breakdown.get("FACE_MATCHED", 0)
            + status_breakdown.get("OCR_COMPLETED", 0)
            + status_breakdown.get("DOCUMENT_UPLOADED", 0)
            + status_breakdown.get("NOT_STARTED", 0)
            + status_breakdown.get("PENDING_REVIEW", 0)
            + status_breakdown.get("PENDING", 0)
        )

        # 4. Biometric Face Match Telemetry
        face_matches = db.execute(
            select(func.count(KycSession.id)).where(
                or_(KycSession.face_match_status == "MATCH", KycSession.face_verified.is_(True))
            )
        ).scalar() or 0

        face_mismatches = db.execute(
            select(func.count(KycSession.id)).where(KycSession.face_match_status == "NO_MATCH")
        ).scalar() or 0

        # 5. Temporal Submissions (Today and Current Week)
        now_utc = datetime.now(timezone.utc)
        start_of_today = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_week = start_of_today - timedelta(days=start_of_today.weekday())

        submitted_today = db.execute(
            select(func.count(KycSession.id)).where(KycSession.created_at >= start_of_today)
        ).scalar() or 0

        submitted_this_week = db.execute(
            select(func.count(KycSession.id)).where(KycSession.created_at >= start_of_week)
        ).scalar() or 0

        return AdminAnalyticsResponse(
            total_customers=total_customers,
            total_applications=total_applications,
            pending_applications=pending_applications,
            approved_applications=approved_applications,
            rejected_applications=rejected_applications,
            cancelled_applications=cancelled_applications,
            face_matches=face_matches,
            face_mismatches=face_mismatches,
            submitted_today=submitted_today,
            submitted_this_week=submitted_this_week,
            status_breakdown=status_breakdown,
        )

    @classmethod
    def _extract_row_data(cls, session: KycSession) -> list[str]:
        """Convert a KycSession entity into a sanitized row list."""
        cust_name = session.extracted_name or (session.user.full_name if session.user else "N/A")
        cust_email = session.user.email if session.user else "N/A"
        sub_date = session.created_at.strftime("%Y-%m-%d %H:%M:%S") if session.created_at else "N/A"
        rev_date = session.admin_reviewed_at.strftime("%Y-%m-%d %H:%M:%S") if session.admin_reviewed_at else "N/A"
        reviewer_id = str(session.admin_reviewed_by) if session.admin_reviewed_by else "N/A"
        face_score = f"{session.face_match_score}%" if session.face_match_score is not None else "N/A"

        raw_values = [
            str(session.id),
            cust_name,
            cust_email,
            session.document_type,
            session.document_number_masked or "N/A",
            session.workflow_status or session.status,
            session.admin_review_status or "PENDING",
            face_score,
            session.face_match_status or "PENDING",
            sub_date,
            rev_date,
            reviewer_id,
            session.rejection_reason or session.failure_reason or "",
        ]
        return [sanitize_for_spreadsheet(v) for v in raw_values]

    @classmethod
    def export_csv(cls, sessions: list[KycSession]) -> str:
        """Streamable CSV export with formula injection sanitization."""
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(cls.REPORT_HEADERS)

        for session in sessions:
            writer.writerow(cls._extract_row_data(session))

        return output.getvalue()

    @classmethod
    def export_excel(cls, sessions: list[KycSession]) -> bytes:
        """Streamable Excel (.xlsx) workbook export using openpyxl."""
        wb = Workbook()
        ws = wb.active
        ws.title = "KYC Applications Report"

        # Apply Header Styling
        header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Navy Blue
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center")

        ws.append(cls.REPORT_HEADERS)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align

        # Append Data Rows
        for session in sessions:
            ws.append(cls._extract_row_data(session))

        # Auto-adjust column widths
        for col in ws.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                val = str(cell.value or "")
                if len(val) > max_len:
                    max_len = len(val)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
