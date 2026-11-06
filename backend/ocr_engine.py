import os
import easyocr
import logging

logging_str = "[%(asctime)s: %(levelname)s: %(module)s]: %(message)s"
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
logging.basicConfig(filename=os.path.join(log_dir,"ekyc_logs.log"), level=logging.INFO, format=logging_str, filemode="a")

_reader = None


def extract_text(image, confidence_threshold=0.3, languages=("en",)):
    global _reader
    if image is None:
        return ""
    try:
        if _reader is None:
            _reader = easyocr.Reader(list(languages))
        results = _reader.readtext(image)
        recognized = [text.strip() for _, text, confidence in results
                      if confidence >= confidence_threshold and text.strip()]
        logging.info("OCR completed: %d text regions passed confidence threshold", len(recognized))
        return "|".join(recognized)
    except Exception as e:
        logging.exception("OCR failed")
        return ""


def extract_text_with_details(image, confidence_threshold=0.3, languages=("en",)):
    """Extract recognized text alongside detection confidence and regions."""
    global _reader
    if image is None:
        return "", 0.0, []
    try:
        if _reader is None:
            _reader = easyocr.Reader(list(languages))
        results = _reader.readtext(image)
        recognized = []
        confidences = []
        for _, text, confidence in results:
            clean_text = text.strip()
            if confidence >= confidence_threshold and clean_text:
                recognized.append(clean_text)
                confidences.append(float(confidence))
        avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0
        logging.info("OCR details: %d regions, avg confidence: %.2f", len(recognized), avg_confidence)
        return "|".join(recognized), avg_confidence, recognized
    except Exception as e:
        logging.exception("OCR with details failed")
        return "", 0.0, []
    
