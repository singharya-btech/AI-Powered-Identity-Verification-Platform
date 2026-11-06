"""AI Model Initialization and Verification Script.

Pre-downloads and verifies AI model weights required for:
1. DeepFace / FaceNet facial embeddings comparison
2. OpenCV Haar Cascade facial detection
3. EasyOCR text detection and recognition

This script is run during container builds or startup to ensure models
are present in persistent cache volumes without repeated downloads.
Biometric data and customer PII are strictly never saved in these volumes.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [init_models]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("init_models")

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def verify_haar_cascade() -> bool:
    """Verify that OpenCV Haar Cascade classifier model is present and valid."""
    logger.info("Checking Haar Cascade face detection model...")
    cascade_relative = Path("data") / "models" / "haarcascade_frontalface_default.xml"
    cascade_path = PROJECT_ROOT / cascade_relative

    if not cascade_path.exists():
        logger.error("Haar Cascade model NOT found at: %s", cascade_path)
        return False

    file_size_kb = cascade_path.stat().st_size / 1024
    logger.info("Found Haar Cascade at %s (%.1f KB)", cascade_path, file_size_kb)

    try:
        import cv2

        classifier = cv2.CascadeClassifier(str(cascade_path))
        if classifier.empty():
            logger.error("Failed to load Haar Cascade from %s (empty classifier)", cascade_path)
            return False
        logger.info("Haar Cascade successfully loaded and validated.")
        return True
    except Exception as exc:
        logger.error("Error validating Haar Cascade classifier: %s", exc)
        return False


def verify_deepface_facenet() -> bool:
    """Verify that FaceNet weights for DeepFace are present."""
    logger.info("Checking DeepFace FaceNet model weights...")
    deepface_home = os.environ.get("DEEPFACE_HOME", str(PROJECT_ROOT / "data"))
    weights_path = Path(deepface_home) / ".deepface" / "weights" / "facenet_weights.pth"

    if not weights_path.exists():
        # Fallback check directly in PROJECT_ROOT / data
        alt_path = PROJECT_ROOT / "data" / ".deepface" / "weights" / "facenet_weights.pth"
        if alt_path.exists():
            weights_path = alt_path

    if not weights_path.exists():
        logger.warning(
            "FaceNet weights not found at %s. Weights will be downloaded on first verification request.",
            weights_path,
        )
        return False

    file_size_mb = weights_path.stat().st_size / (1024 * 1024)
    logger.info("Found FaceNet weights at %s (%.2f MB)", weights_path, file_size_mb)
    if file_size_mb < 80.0:
        logger.warning("FaceNet weight file appears truncated (< 80 MB): %.2f MB", file_size_mb)
        return False

    logger.info("DeepFace FaceNet weights validated successfully.")
    return True


def init_easyocr(download_enabled: bool = True) -> bool:
    """Verify or pre-download EasyOCR recognition models."""
    logger.info("Checking EasyOCR models...")
    try:
        import easyocr

        logger.info("Initializing EasyOCR reader (languages=['en'], gpu=False)...")
        # EasyOCR checks ~/.EasyOCR/model or specified model_storage_directory
        reader = easyocr.Reader(["en"], gpu=False, download_enabled=download_enabled)
        logger.info("EasyOCR English recognition model successfully initialized and cached.")
        return True
    except Exception as exc:
        logger.error("Failed to initialize EasyOCR: %s", exc)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize and verify AI models for E-KYC Platform.")
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Do not download EasyOCR models if missing, only check existing files.",
    )
    args = parser.parse_args()

    logger.info("Starting AI models verification for E-KYC Platform...")
    logger.info("Project Root: %s", PROJECT_ROOT)

    haar_ok = verify_haar_cascade()
    deepface_ok = verify_deepface_facenet()
    easyocr_ok = init_easyocr(download_enabled=not args.no_download)

    logger.info("--- Model Verification Summary ---")
    logger.info("Haar Cascade Face Detection: %s", "READY" if haar_ok else "MISSING")
    logger.info("DeepFace FaceNet Embeddings:  %s", "READY" if deepface_ok else "MISSING / PENDING DOWNLOAD")
    logger.info("EasyOCR English Recognition: %s", "READY" if easyocr_ok else "FAILED")

    if haar_ok and deepface_ok and easyocr_ok:
        logger.info("All AI models are fully verified and ready for production inference.")
        return 0
    elif haar_ok and (deepface_ok or easyocr_ok):
        logger.warning("Core models verified with non-fatal warnings.")
        return 0
    else:
        logger.error("Critical AI model components failed verification.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

