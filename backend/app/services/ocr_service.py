"""Local AI-based Document OCR processing service.

Integrates OpenCV document preprocessing, EasyOCR recognition, and structured
identity postprocessing for PAN and Aadhaar documents with strict zero-PII persistence.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Tuple
import cv2
import numpy as np
from fastapi import HTTPException, UploadFile, status

from backend.ocr_engine import extract_text_with_details
from backend.postprocess import extract_information, extract_information1, _tokens, _find_aadhaar_number, _find_pan_number
from backend.preprocess import extract_id_card

logger = logging.getLogger("uvicorn.error")

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/jpg"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
AADHAAR_REGEX = re.compile(r"^\d{12}$")


class DocumentOcrService:
    """Service handling document validation, preprocessing, OCR, and parsing."""

    @staticmethod
    def validate_file(file: UploadFile, contents: bytes) -> np.ndarray:
        """Validate file size, extension, MIME type, and OpenCV image decodability."""
        # 1. Size Validation
        if len(contents) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
            )

        if len(contents) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes).",
            )

        # 2. Extension Validation
        filename = (file.filename or "").lower()
        if not any(filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file extension. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
            )

        # 3. Content-Type Validation
        content_type = (file.content_type or "").lower()
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid MIME type '{content_type}'. Allowed types: image/jpeg, image/png.",
            )

        # 4. Image Decoding & Integrity Validation
        try:
            np_arr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Corrupted image file. Failed to parse image bytes.",
            ) from exc

        if img is None or img.size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Corrupted or unreadable image file. Unable to decode image.",
            )

        # 5. Dimension Validation
        h, w = img.shape[:2]
        if h < 100 or w < 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image resolution too low ({w}x{h}px). Minimum required dimension is 100x100 pixels.",
            )

        return img

    @staticmethod
    def mask_document_number(doc_type: str, raw_number: str) -> str:
        """Produce a safe, masked representation of the document identifier."""
        if not raw_number:
            return "NOT_DETECTED"

        clean = re.sub(r"\s+", "", raw_number.upper())
        if doc_type == "PAN":
            if len(clean) == 10:
                # Format: ABCDE****F
                return f"{clean[:5]}****{clean[9]}"
            elif len(clean) >= 5:
                return f"{clean[:4]}****"
            return "****"
        elif doc_type == "AADHAAR":
            clean_digits = re.sub(r"\D", "", raw_number)
            if len(clean_digits) == 12:
                # Format: XXXX-XXXX-1234
                return f"XXXX-XXXX-{clean_digits[-4:]}"
            elif len(clean_digits) >= 4:
                return f"XXXX-XXXX-{clean_digits[-4:]}"
            return "****-****-****"

        return "****"

    @classmethod
    def process_document(
        cls,
        img: np.ndarray,
        document_type: str,
    ) -> Tuple[dict[str, Any], float, list[str]]:
        """Execute OpenCV preprocessing, EasyOCR recognition, and postprocessing.

        Returns:
            Tuple of (extracted_fields_dict, avg_confidence, validation_messages)
        """
        doc_type_upper = document_type.upper().strip()
        validation_messages: list[str] = []

        # 1. OpenCV Preprocessing (Contour bounding & crop)
        cropped_img = img
        try:
            contour_img, _ = extract_id_card(img)
            if contour_img is not None and contour_img.size > 0:
                # Check that cropped contour is not excessively small
                ch, cw = contour_img.shape[:2]
                if ch >= 80 and cw >= 80:
                    cropped_img = contour_img
        except Exception as exc:
            logger.warning("Contour preprocessing failed, using original image: %s", exc)

        # 2. EasyOCR Text Extraction
        ocr_text, avg_confidence, recognized_tokens = extract_text_with_details(cropped_img)

        # Fallback to full image if cropped region produced no text
        if not ocr_text and cropped_img is not img:
            ocr_text, avg_confidence, recognized_tokens = extract_text_with_details(img)

        tokens = _tokens(ocr_text)

        # 3. Postprocessing based on document type
        extracted_data: dict[str, Any] = {}
        raw_doc_number = ""
        is_format_valid = False

        if doc_type_upper == "PAN":
            extracted = extract_information(ocr_text)
            raw_doc_number = extracted.get("ID") or ""
            name = extracted.get("Name") or ""
            dob = extracted.get("DOB")
            fathers_name = extracted.get("Father's Name") or ""

            # Check for document mismatch (e.g. user selected PAN but uploaded Aadhaar)
            aadhaar_candidate = _find_aadhaar_number(tokens)
            if not raw_doc_number and aadhaar_candidate:
                validation_messages.append(
                    "Document mismatch detected: The image appears to be an Aadhaar card, but PAN was selected."
                )

            # Format check
            if raw_doc_number and PAN_REGEX.match(raw_doc_number.upper()):
                is_format_valid = True
            else:
                validation_messages.append("PAN format could not be verified against the standard pattern (5 letters, 4 digits, 1 letter).")

            # Format DOB
            dob_str = dob.strftime("%Y-%m-%d") if isinstance(dob, datetime) else (str(dob) if dob else None)

            extracted_data = {
                "document_number_masked": cls.mask_document_number("PAN", raw_doc_number),
                "name": name if name else None,
                "dob": dob_str,
                "fathers_name": fathers_name if fathers_name else None,
                "is_format_valid": is_format_valid,
                "raw_number_found": bool(raw_doc_number),
            }

        elif doc_type_upper == "AADHAAR":
            extracted = extract_information1(ocr_text)
            raw_doc_number = extracted.get("ID") or ""
            name = extracted.get("Name") or ""
            gender = extracted.get("Gender") or ""
            dob = extracted.get("DOB")

            # Check for document mismatch (e.g. user selected Aadhaar but uploaded PAN)
            pan_candidate = _find_pan_number(tokens)
            if not raw_doc_number and pan_candidate:
                validation_messages.append(
                    "Document mismatch detected: The image appears to be a PAN card, but Aadhaar was selected."
                )

            # Format check (12 digits)
            clean_digits = re.sub(r"\D", "", raw_doc_number)
            if clean_digits and AADHAAR_REGEX.match(clean_digits):
                is_format_valid = True
            else:
                validation_messages.append("Aadhaar format could not be verified against the 12-digit standard sequence.")

            dob_str = dob.strftime("%Y-%m-%d") if isinstance(dob, datetime) else (str(dob) if dob else None)

            extracted_data = {
                "document_number_masked": cls.mask_document_number("AADHAAR", raw_doc_number),
                "name": name if name else None,
                "dob": dob_str,
                "gender": gender if gender else None,
                "is_format_valid": is_format_valid,
                "raw_number_found": bool(raw_doc_number),
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported document type: {document_type}. Supported types: PAN, AADHAAR.",
            )

        if not ocr_text:
            validation_messages.append("No legible text could be extracted. Please ensure adequate lighting and sharpness.")

        return extracted_data, avg_confidence, validation_messages


ocr_service = DocumentOcrService()

