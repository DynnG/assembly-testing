"""
Tests for IPA Unicode preservation and CSV/XLSX export encoding.
Validates requirement: IPA phonemes must remain readable and identical across
model output, backend processing, frontend display, and exported files.
"""

import io
import openpyxl
import pytest
from export_service import (
    IPA_VALIDATION_PHONEMES,
    generate_phoneme_dataset_csv,
    generate_phoneme_dataset_xlsx,
    generate_human_readable_report_txt,
)


SAMPLE_TEST_WORDS = [
    {
        "word_id": 1,
        "token_index": 1,
        "text": "think",
        "word": "think",
        "start_ms": 100,
        "end_ms": 420,
        "duration_ms": 320,
        "padded_start_ms": 75,
        "padded_end_ms": 445,
        "padded_duration_ms": 370,
        "assembly_confidence": 0.985,
        "predicted_phonemes_str": "θ ɪ ŋ k",
        "expected_phonemes_str": "θ ɪ ŋ k",
        "reference_source": "canonical_dictionary",
        "selected_variant_index": 0,
        "phoneme_error_rate": 0.0,
        "per_metrics": {
            "substitutions": 0,
            "deletions": 0,
            "insertions": 0,
            "matches": 4,
            "phoneme_error_rate": 0.0,
            "status": "completed",
        },
        "alignment": [
            {"operation": "match", "expected": "θ", "predicted": "θ", "position": 0},
            {"operation": "match", "expected": "ɪ", "predicted": "ɪ", "position": 1},
            {"operation": "match", "expected": "ŋ", "predicted": "ŋ", "position": 2},
            {"operation": "match", "expected": "k", "predicted": "k", "position": 3},
        ],
        "segmentation_status": "valid",
        "audio_quality_status": "normal",
        "phoneme_analysis_status": "completed",
        "requires_human_review": False,
        "segmentation_notes": None,
    },
    {
        "word_id": 2,
        "token_index": 2,
        "text": "this",
        "word": "this",
        "start_ms": 500,
        "end_ms": 750,
        "duration_ms": 250,
        "padded_start_ms": 475,
        "padded_end_ms": 775,
        "padded_duration_ms": 300,
        "assembly_confidence": 0.991,
        "predicted_phonemes_str": "ð ɪ s",
        "expected_phonemes_str": "ð ɪ s",
        "reference_source": "canonical_dictionary",
        "selected_variant_index": 0,
        "phoneme_error_rate": 0.0,
        "per_metrics": {
            "substitutions": 0,
            "deletions": 0,
            "insertions": 0,
            "matches": 3,
            "phoneme_error_rate": 0.0,
            "status": "completed",
        },
        "alignment": [
            {"operation": "match", "expected": "ð", "predicted": "ð", "position": 0},
            {"operation": "match", "expected": "ɪ", "predicted": "ɪ", "position": 1},
            {"operation": "match", "expected": "s", "predicted": "s", "position": 2},
        ],
        "segmentation_status": "valid",
        "audio_quality_status": "normal",
        "phoneme_analysis_status": "completed",
        "requires_human_review": False,
        "segmentation_notes": None,
    },
    {
        "word_id": 3,
        "token_index": 3,
        "text": "measure",
        "word": "measure",
        "start_ms": 800,
        "end_ms": 1200,
        "duration_ms": 400,
        "padded_start_ms": 775,
        "padded_end_ms": 1225,
        "padded_duration_ms": 450,
        "assembly_confidence": 0.962,
        "predicted_phonemes_str": "m ɛ ʃ ɚ",
        "expected_phonemes_str": "m ɛ ʒ ɚ",
        "reference_source": "cmudict",
        "selected_variant_index": 0,
        "phoneme_error_rate": 25.0,
        "per_metrics": {
            "substitutions": 1,
            "deletions": 0,
            "insertions": 0,
            "matches": 3,
            "phoneme_error_rate": 25.0,
            "status": "completed",
        },
        "alignment": [
            {"operation": "match", "expected": "m", "predicted": "m", "position": 0},
            {"operation": "match", "expected": "ɛ", "predicted": "ɛ", "position": 1},
            {"operation": "substitution", "expected": "ʒ", "predicted": "ʃ", "position": 2},
            {"operation": "match", "expected": "ɚ", "predicted": "ɚ", "position": 3},
        ],
        "segmentation_status": "valid",
        "audio_quality_status": "normal",
        "phoneme_analysis_status": "completed",
        "requires_human_review": True,
        "segmentation_notes": "Single consonant substitution [ʒ→ʃ] detected.",
    },
    {
        "word_id": 4,
        "token_index": 4,
        "text": "father",
        "word": "father",
        "start_ms": 1300,
        "end_ms": 1700,
        "duration_ms": 400,
        "padded_start_ms": 1275,
        "padded_end_ms": 1725,
        "padded_duration_ms": 450,
        "assembly_confidence": 0.978,
        "predicted_phonemes_str": "f ɑː ð ɚ",
        "expected_phonemes_str": "f ɑː ð ɚ",
        "reference_source": "cmudict",
        "selected_variant_index": 0,
        "phoneme_error_rate": 0.0,
        "per_metrics": {"substitutions": 0, "deletions": 0, "insertions": 0, "matches": 4, "phoneme_error_rate": 0.0, "status": "completed"},
        "alignment": [
            {"operation": "match", "expected": "f", "predicted": "f", "position": 0},
            {"operation": "match", "expected": "ɑː", "predicted": "ɑː", "position": 1},
            {"operation": "match", "expected": "ð", "predicted": "ð", "position": 2},
            {"operation": "match", "expected": "ɚ", "predicted": "ɚ", "position": 3},
        ],
        "segmentation_status": "valid",
        "audio_quality_status": "normal",
        "phoneme_analysis_status": "completed",
        "requires_human_review": False,
    },
    {
        "word_id": 5,
        "token_index": 5,
        "text": "could",
        "word": "could",
        "start_ms": 1800,
        "end_ms": 2050,
        "duration_ms": 250,
        "padded_start_ms": 1775,
        "padded_end_ms": 2075,
        "padded_duration_ms": 300,
        "assembly_confidence": 0.981,
        "predicted_phonemes_str": "k ʊ d",
        "expected_phonemes_str": "k ʊ d",
        "reference_source": "cmudict",
        "selected_variant_index": 0,
        "phoneme_error_rate": 0.0,
        "per_metrics": {"substitutions": 0, "deletions": 0, "insertions": 0, "matches": 3, "phoneme_error_rate": 0.0, "status": "completed"},
        "alignment": [
            {"operation": "match", "expected": "k", "predicted": "k", "position": 0},
            {"operation": "match", "expected": "ʊ", "predicted": "ʊ", "position": 1},
            {"operation": "match", "expected": "d", "predicted": "d", "position": 2},
        ],
        "segmentation_status": "valid",
        "audio_quality_status": "normal",
        "phoneme_analysis_status": "completed",
        "requires_human_review": False,
    },
    {
        "word_id": 6,
        "token_index": 6,
        "text": "cat",
        "word": "cat",
        "start_ms": 2100,
        "end_ms": 2350,
        "duration_ms": 250,
        "padded_start_ms": 2075,
        "padded_end_ms": 2375,
        "padded_duration_ms": 300,
        "assembly_confidence": 0.984,
        "predicted_phonemes_str": "k æ t",
        "expected_phonemes_str": "k æ t",
        "reference_source": "cmudict",
        "selected_variant_index": 0,
        "phoneme_error_rate": 0.0,
        "per_metrics": {"substitutions": 0, "deletions": 0, "insertions": 0, "matches": 3, "phoneme_error_rate": 0.0, "status": "completed"},
        "alignment": [
            {"operation": "match", "expected": "k", "predicted": "k", "position": 0},
            {"operation": "match", "expected": "æ", "predicted": "æ", "position": 1},
            {"operation": "match", "expected": "t", "predicted": "t", "position": 2},
        ],
        "segmentation_status": "valid",
        "audio_quality_status": "normal",
        "phoneme_analysis_status": "completed",
        "requires_human_review": False,
    },
]


def test_csv_utf8_bom_presence():
    """Verify CSV export starts with exact UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)."""
    csv_bytes = generate_phoneme_dataset_csv(SAMPLE_TEST_WORDS)
    assert csv_bytes[:3] == b"\xef\xbb\xbf", "CSV output must start with UTF-8 BOM"


def test_csv_ipa_character_preservation():
    """Verify every target IPA character is preserved without byte corruption in CSV."""
    csv_bytes = generate_phoneme_dataset_csv(SAMPLE_TEST_WORDS)
    decoded_text = csv_bytes.decode("utf-8-sig")

    target_phonemes = ["θ", "ð", "ŋ", "ʃ", "ʒ", "ɪ", "æ", "ʊ", "ɑː", "ɚ"]
    for phone in target_phonemes:
        assert phone in decoded_text, f"Target IPA character {phone} missing or corrupted in CSV"

    # Verify no ANSI/mojibake corruption characters exist
    corruptions = ["Ã", "É", "Â", "â", "\ufffd"]
    for c in corruptions:
        assert c not in decoded_text, f"Mojibake corruption '{c}' found in decoded CSV"


def test_xlsx_native_unicode_preservation():
    """Verify XLSX workbook preserves IPA characters in openpyxl cells."""
    xlsx_bytes = generate_phoneme_dataset_xlsx(
        recording_id="rec_test_001",
        full_transcription="think this measure father could cat",
        words=SAMPLE_TEST_WORDS,
    )
    assert len(xlsx_bytes) > 0

    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    assert "Word Phonetics" in wb.sheetnames
    assert "Overview & Metadata" in wb.sheetnames

    ws = wb["Word Phonetics"]
    # Row 2 is word 1 "think"
    pred_ipa = ws.cell(row=2, column=9).value
    exp_ipa = ws.cell(row=2, column=10).value
    assert pred_ipa == "θ ɪ ŋ k", f"Expected 'θ ɪ ŋ k', got '{pred_ipa}'"
    assert exp_ipa == "θ ɪ ŋ k", f"Expected 'θ ɪ ŋ k', got '{exp_ipa}'"

    # Row 3 is word 2 "this"
    assert ws.cell(row=3, column=9).value == "ð ɪ s"

    # Row 4 is word 3 "measure" with [ʒ→ʃ]
    assert ws.cell(row=4, column=9).value == "m ɛ ʃ ɚ"
    assert ws.cell(row=4, column=10).value == "m ɛ ʒ ɚ"
    assert ws.cell(row=4, column=12).value == 25.0
    assert ws.cell(row=4, column=22).value == "YES"

    # Row 5 is word 4 "father" with ɑː
    assert "ɑː" in ws.cell(row=5, column=9).value

    # Row 6 is word 5 "could" with ʊ
    assert "ʊ" in ws.cell(row=6, column=9).value

    # Row 7 is word 6 "cat" with æ
    assert "æ" in ws.cell(row=7, column=9).value


def test_human_readable_report_contains_all_evidence():
    """Verify human-readable text report contains required sections and Unicode IPA."""
    txt = generate_human_readable_report_txt(
        recording_id="rec_test_001",
        full_transcription="think this measure",
        words=SAMPLE_TEST_WORDS,
        ai_summary={
            "overall_summary": "Test recording with clear articulation.",
            "pronunciation_observations": [
                {
                    "word": "measure",
                    "observation": "Potential consonant substitution [ʒ→ʃ]",
                    "possible_articulation_explanation": "Voicing distinction",
                    "practice_recommendation": ["practice /ʒ/ in vision, measure"],
                }
            ],
            "speech_timing_observations": ["Speech rate is normal"],
            "limitations": ["Acoustic segmentation boundaries are heuristic"],
        },
    )

    assert "ARTICULA: PRONUNCIATION & FLUENCY EVALUATION REPORT" in txt
    assert "1. OVERALL EVALUATION SUMMARY" in txt
    assert "2. AI-ASSISTED ANALYSIS SUMMARY" in txt
    assert "TOKENS FLAGGED FOR HUMAN REVIEW" in txt
    assert "measure" in txt
    assert "θ ɪ ŋ k" in txt
    assert "m ɛ ʒ ɚ" in txt
