"""Shared text normalisation, reproduced exactly from the frozen SAGE-FJD source."""
import html
import re

import pandas as pd


def clean_text_series(series):
    """Step-3 lexical cleaning."""
    cleaned = series.fillna("").astype(str).map(html.unescape)
    cleaned = cleaned.str.replace(r"<[^>]+>", " ", regex=True)
    cleaned = cleaned.str.replace(r"[\r\n\t]+", " ", regex=True)
    cleaned = cleaned.str.replace(r"\s+", " ", regex=True).str.strip()
    return cleaned


def clean_semantic_text(value):
    """Step-5 semantic cleaning."""
    if pd.isna(value):
        return ""
    text = html.unescape(str(value))
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split()).strip()


def normalize_template(value):
    """Step-6 campaign template normalisation."""
    if pd.isna(value):
        return ""
    text = html.unescape(str(value)).lower()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"https?://\S+|www\.\S+", " __url__ ", text)
    text = re.sub(r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b", " __email__ ", text)
    text = re.sub(r"\d+", " 0 ", text)
    text = re.sub(r"[^a-z0-9_]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()
