"""AI-Based Facial Verification Service.

Integrates Haar Cascade face detection, face extraction, and local FaceNet deep
embeddings comparison via DeepFace. Complies with zero-PII retention principles:
never stores raw biometric embeddings or selfie photographs in the database.
"""

import logging
import os
import uuid
from pathlib import Path
from typing import Any, Tuple
import cv2
import numpy as np
from fastapi import HTTPException, status

# Ensure DeepFace stores weights locally inside project's data directory
PROJECT_ROOT = Path(__file__).resolve().parents[3]
os.environ.setdefault("DEEPFACE_HOME", str(PROJECT_ROOT / "data"))
os.environ.setdefault("PYTHONUTF8", "1")

from backend.face_verification import (
    FaceQualityError,
    cascade_path,
    deepface_face_comparison,
    detect_and_extract_face,
)
from backend.app.core.config import settings

logger = logging.getLogger("uvicorn.error")

MAX_SELFIE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
TEMP_FACES_DIR = PROJECT_ROOT / "data" / "temp_faces"


class FaceVerificationService:
    """Service handling face detection, extraction, quality validation, and biometric similarity."""

    @staticmethod
    def get_temp_face_path(session_id: uuid.UUID) -> Path:
        """Get the temporary file path for a session's extracted document face portrait."""
        TEMP_FACES_DIR.mkdir(parents=True, exist_ok=True)
        return TEMP_FACES_DIR / f"{session_id}.jpg"

    @classmethod
    def cache_document_face(cls, session_id: uuid.UUID, document_img: np.ndarray) -> bool:
        """Detect and temporarily store the cropped face from an uploaded identity document."""
        try:
            face_crop = detect_and_extract_face(document_img)
            if face_crop is None or face_crop.size == 0:
                logger.warning("No face portrait detected on document for session %s", session_id)
                return False

            temp_path = cls.get_temp_face_path(session_id)
            cv2.imwrite(str(temp_path), face_crop)
            logger.info("Cached extracted document face crop at %s for session %s", temp_path, session_id)
            return True
        except FaceQualityError as exc:
            logger.warning("Document face extraction quality issue for session %s: %s", session_id, exc)
            return False
        except Exception as exc:
            logger.error("Failed to extract or cache document face for session %s: %s", session_id, exc)
            return False

    @classmethod
    def load_cached_document_face(cls, session_id: uuid.UUID) -> np.ndarray | None:
        """Load the temporary cropped document face from disk if present."""
        temp_path = cls.get_temp_face_path(session_id)
        if not temp_path.exists():
            return None
        img = cv2.imread(str(temp_path))
        if img is None or img.size == 0:
            return None
        return img

    @classmethod
    def cleanup_cached_document_face(cls, session_id: uuid.UUID) -> None:
        """Immediately delete the temporary cropped face file to maintain privacy."""
        temp_path = cls.get_temp_face_path(session_id)
        try:
            if temp_path.exists():
                temp_path.unlink()
                logger.info("Cleaned up temporary face crop for session %s", session_id)
        except Exception as exc:
            logger.warning("Failed to clean up temp face file %s: %s", temp_path, exc)

    @classmethod
    def validate_and_decode_selfie(cls, contents: bytes) -> np.ndarray:
        """Validate selfie file size, decodability, and channel count."""
        if len(contents) > MAX_SELFIE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Selfie image exceeds maximum allowed size of {MAX_SELFIE_SIZE_BYTES // (1024 * 1024)} MB.",
            )
        if len(contents) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded selfie file is empty.",
            )

        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None or img.size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded selfie could not be decoded as an image. Please provide a valid JPG or PNG file.",
            )
        return img

    @classmethod
    def count_faces(cls, img: np.ndarray) -> int:
        """Detect and count human faces in an image using the Haar Cascade model."""
        if img is None or img.size == 0:
            return 0
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            raise RuntimeError(f"Could not load face detector cascade from {cascade_path}")
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        return len(faces)

    @classmethod
    def extract_selfie_face(cls, img: np.ndarray) -> Tuple[np.ndarray, list[str]]:
        """Validate face presence, check single-face requirement, and extract face crop."""
        validation_messages: list[str] = []
        face_count = cls.count_faces(img)

        if face_count == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No human face detected in the live selfie. Please ensure adequate lighting and center your face in the camera.",
            )
        if face_count > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Multiple faces detected ({face_count}) in selfie. Only one person must be present in the camera frame.",
            )

        try:
            crop = detect_and_extract_face(img)
            if crop is None or crop.size == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Face detected but could not be cleanly extracted. Please adjust distance and lighting.",
                )
            validation_messages.append("Single human face successfully identified and cropped from selfie.")
            return crop, validation_messages
        except FaceQualityError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Face quality insufficient: {str(exc)}",
            ) from exc

    @classmethod
    def compare_faces(
        cls,
        doc_face: np.ndarray,
        selfie_face: np.ndarray,
        threshold: float = settings.FACE_SIMILARITY_THRESHOLD,
    ) -> dict[str, Any]:
        """Perform local facial verification using DeepFace Facenet embeddings."""
        try:
            result = deepface_face_comparison(doc_face, selfie_face)
        except Exception as exc:
            logger.error("DeepFace verification failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI face comparison engine encountered an internal processing error.",
            ) from exc

        raw_distance = float(result.get("distance", 1.0))
        applied_threshold = float(result.get("threshold", threshold))
        is_match = bool(result.get("verified", raw_distance <= applied_threshold))

        # Calculate a human-readable similarity percentage between 0% and 100%
        # At distance 0.0 -> 100% similarity
        # At distance = threshold (e.g. 0.40) -> 60% similarity
        # At distance >= 1.0 -> 0% similarity
        similarity_score = max(0.0, min(100.0, (1.0 - min(raw_distance, 1.0)) * 100.0))
        similarity_score = round(similarity_score, 2)

        return {
            "distance": round(raw_distance, 4),
            "threshold": round(applied_threshold, 4),
            "is_match": is_match,
            "similarity_score": similarity_score,
            "model": result.get("model", "Facenet"),
        }

