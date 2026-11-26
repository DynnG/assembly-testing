"""
Articula Export Service: Preserves Unicode IPA Phonetics for CSV & XLSX exports.
Ensures exact preservation of phonetic symbols (θ, ð, ŋ, ʃ, ʒ, ɪ, ə, æ, ʊ, ɑ, etc.)
across CSV (UTF-8 with BOM / utf-8-sig) and XLSX (native OpenPyXL Unicode cells).
"""

import csv
import io
from typing import Any, Dict, List, Optional
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


IPA_VALIDATION_PHONEMES = [
    "θ", "ð", "ŋ", "ʃ", "ʒ", "ɪ", "ə", "æ", "ʊ", "ɑ",
    "tʃ", "dʒ", "aɪ", "eɪ", "oʊ", "aʊ", "ɔɪ", "iː", "uː", "ɔː", "ɑː", "ɜː"
]


def format_alignment_str(alignment: Optional[List[Dict[str, Any]]]) -> str:
    """Formats alignment list into a readable human-inspectable string."""
    if not alignment:
        return ""
    parts = []
    for step in alignment:
        op = step.get("operation")
        exp = step.get("expected") or "∅"
        pred = step.get("predicted") or "∅"
        if op == "match":
            parts.append(f"{exp}")
        elif op == "substitution":
            parts.append(f"[{exp}→{pred}]")
        elif op == "deletion":
            parts.append(f"[-{exp}]")
        elif op == "insertion":
            parts.append(f"[+{pred}]")
    return " ".join(parts)


def generate_phoneme_dataset_csv(words: List[Dict[str, Any]]) -> bytes:
    """
    Generates a technical dataset CSV encoded with UTF-8 with BOM (utf-8-sig)
    for seamless opening in Microsoft Excel and UTF-8 data science pipelines.
    Preserves all IPA characters without entity escaping or character corruption.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    headers = [
        "word_index",
        "word",
        "start_ms",
        "end_ms",
        "raw_duration_ms",
        "padded_start_ms",
        "padded_end_ms",
        "padded_duration_ms",
        "assembly_confidence",
        "predicted_phonemes_ipa",
        "reference_phonemes_ipa",
        "reference_source",
        "selected_variant_index",
        "phoneme_error_rate_pct",
        "per_status",
        "substitutions",
        "deletions",
        "insertions",
        "matches",
        "alignment_summary",
        "segmentation_status",
        "audio_quality_status",
        "phoneme_analysis_status",
        "requires_human_review",
        "quality_notes",
    ]
    writer.writerow(headers)

    for idx, w in enumerate(words):
        per_m = w.get("per_metrics") or {}
        alignment = w.get("alignment") or []
        row = [
            w.get("token_index") or (idx + 1),
            w.get("text") or w.get("word") or "",
            w.get("start_ms") if w.get("start_ms") is not None else w.get("start", ""),
            w.get("end_ms") if w.get("end_ms") is not None else w.get("end", ""),
            w.get("duration_ms", ""),
            w.get("padded_start_ms", ""),
            w.get("padded_end_ms", ""),
            w.get("padded_duration_ms", ""),
            round(w.get("assembly_confidence") or w.get("confidence") or 0.0, 4) if (w.get("confidence") is not None or w.get("assembly_confidence") is not None) else "",
            w.get("predicted_phonemes_str") or w.get("phoneme_prediction") or "",
            w.get("expected_phonemes_str") or w.get("reference_phonemes") or "",
            w.get("reference_source", ""),
            w.get("selected_variant_index", 0),
            w.get("phoneme_error_rate") if w.get("phoneme_error_rate") is not None else "",
            per_m.get("status", w.get("analysis_status", "")),
            per_m.get("substitutions", ""),
            per_m.get("deletions", ""),
            per_m.get("insertions", ""),
            per_m.get("matches", ""),
            format_alignment_str(alignment),
            w.get("segmentation_status", "valid"),
            w.get("audio_quality_status", "normal"),
            w.get("phoneme_analysis_status", w.get("analysis_status", "completed")),
            "YES" if w.get("requires_human_review") else "NO",
            w.get("segmentation_notes") or w.get("quality_notes") or "",
        ]
        writer.writerow(row)

    # Encode with utf-8-sig (UTF-8 BOM) for Excel compatibility
    return output.getvalue().encode("utf-8-sig")


def generate_phoneme_dataset_xlsx(
    recording_id: str,
    full_transcription: str,
    words: List[Dict[str, Any]],
    pronunciation_findings: Optional[List[Dict[str, Any]]] = None,
    evaluation_metrics: Optional[Dict[str, Any]] = None,
    ai_summary: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Generates a professionally formatted multi-sheet Excel workbook (.xlsx)
    guaranteeing native Unicode preservation of IPA symbols.
    """
    wb = openpyxl.Workbook()

    # Styling definitions
    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    accent_fill = PatternFill(start_color="0D9488", end_color="0D9488", fill_type="solid")
    accent_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    cell_font = Font(name="Segoe UI", size=9, color="111827")
    ipa_font = Font(name="Lucida Sans Unicode", size=10, color="0F172A")
    flag_font = Font(name="Segoe UI", size=9, bold=True, color="BE123C")
    valid_font = Font(name="Segoe UI", size=9, color="047857")

    thin_border = Border(
        left=Side(style="thin", color="E5E7EB"),
        right=Side(style="thin", color="E5E7EB"),
        top=Side(style="thin", color="E5E7EB"),
        bottom=Side(style="thin", color="E5E7EB"),
    )

    # -------------------------------------------------------------
    # Sheet 1: Technical Word Phonemes
    # -------------------------------------------------------------
    ws_words = wb.active
    ws_words.title = "Word Phonetics"

    headers_words = [
        "Index", "Word", "Start (ms)", "End (ms)", "Duration (ms)",
        "Padded Start", "Padded End", "ASR Confidence",
        "Predicted Phonemes (IPA)", "Expected Phonemes (IPA)", "Reference Source",
        "PER (%)", "PER Status", "Subs", "Dels", "Ins", "Matches",
        "Alignment Operations", "Segmentation Status", "Audio Quality",
        "Analysis Status", "Needs Review", "Technical Notes"
    ]
    ws_words.append(headers_words)

    for col_idx in range(1, len(headers_words) + 1):
        cell = ws_words.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws_words.row_dimensions[1].height = 28

    for row_idx, w in enumerate(words, start=2):
        per_m = w.get("per_metrics") or {}
        alignment = w.get("alignment") or []
        pred_ipa = w.get("predicted_phonemes_str") or w.get("phoneme_prediction") or ""
        exp_ipa = w.get("expected_phonemes_str") or w.get("reference_phonemes") or ""
        requires_review = bool(w.get("requires_human_review"))

        row_vals = [
            w.get("token_index") or (row_idx - 1),
            w.get("text") or w.get("word") or "",
            w.get("start_ms") if w.get("start_ms") is not None else w.get("start", ""),
            w.get("end_ms") if w.get("end_ms") is not None else w.get("end", ""),
            w.get("duration_ms", ""),
            w.get("padded_start_ms", ""),
            w.get("padded_end_ms", ""),
            round(w.get("assembly_confidence") or w.get("confidence") or 0.0, 4) if (w.get("confidence") is not None or w.get("assembly_confidence") is not None) else "",
            pred_ipa,
            exp_ipa,
            w.get("reference_source", ""),
            w.get("phoneme_error_rate") if w.get("phoneme_error_rate") is not None else "",
            per_m.get("status", w.get("analysis_status", "")),
            per_m.get("substitutions", ""),
            per_m.get("deletions", ""),
            per_m.get("insertions", ""),
            per_m.get("matches", ""),
            format_alignment_str(alignment),
            w.get("segmentation_status", "valid"),
            w.get("audio_quality_status", "normal"),
            w.get("phoneme_analysis_status", w.get("analysis_status", "completed")),
            "YES" if requires_review else "NO",
            w.get("segmentation_notes") or w.get("quality_notes") or "",
        ]
        ws_words.append(row_vals)

        for col_idx in range(1, len(row_vals) + 1):
            cell = ws_words.cell(row=row_idx, column=col_idx)
            cell.border = thin_border
            # Use dedicated Unicode font for IPA columns
            if col_idx in (9, 10, 18):
                cell.font = ipa_font
            elif col_idx == 22 and requires_review:
                cell.font = flag_font
            else:
                cell.font = cell_font

            if col_idx in (1, 3, 4, 5, 6, 7, 8, 12, 14, 15, 16, 17, 22):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

        ws_words.row_dimensions[row_idx].height = 20

    # -------------------------------------------------------------
    # Sheet 2: Pronunciation Findings & Feedback
    # -------------------------------------------------------------
    ws_findings = wb.create_sheet(title="Pronunciation Findings")
    headers_findings = [
        "Word", "Observed Difference", "Target Phoneme", "Detected Phoneme",
        "Difference Type", "Sequence Position", "Articulatory Profile",
        "Practice Guidance", "Suggested Practice Words", "Validation Status", "Research Notes"
    ]
    ws_findings.append(headers_findings)

    for col_idx in range(1, len(headers_findings) + 1):
        cell = ws_findings.cell(row=1, column=col_idx)
        cell.fill = accent_fill
        cell.font = accent_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws_findings.row_dimensions[1].height = 28

    findings_list = pronunciation_findings or []
    if not findings_list and words:
        for w in words:
            for f in w.get("pronunciation_findings", []):
                findings_list.append(f)

    for r_idx, f in enumerate(findings_list, start=2):
        practice_words_str = ", ".join(f.get("practice_words", []))
        f_row = [
            f.get("word", ""),
            f.get("observed_characteristic", ""),
            f.get("expected_phoneme") or f.get("target_phoneme") or "",
            f.get("predicted_phoneme") or "",
            f.get("difference_type", ""),
            f.get("phoneme_position", ""),
            f.get("articulatory_description", ""),
            f.get("recommendation", ""),
            practice_words_str,
            f.get("validation_status", "unvalidated_single_occurrence"),
            f.get("notes", ""),
        ]
        ws_findings.append(f_row)
        for col_idx in range(1, len(f_row) + 1):
            cell = ws_findings.cell(row=r_idx, column=col_idx)
            cell.border = thin_border
            if col_idx in (3, 4):
                cell.font = ipa_font
            else:
                cell.font = cell_font
            cell.alignment = Alignment(horizontal="left", vertical="center")

        ws_findings.row_dimensions[r_idx].height = 22

    # -------------------------------------------------------------
    # Sheet 3: Overall Summary & System Metadata
    # -------------------------------------------------------------
    ws_meta = wb.create_sheet(title="Overview & Metadata")
    ws_meta.append(["Property", "Value", "Technical Description"])
    ws_meta.cell(row=1, column=1).fill = header_fill
    ws_meta.cell(row=1, column=1).font = header_font
    ws_meta.cell(row=1, column=2).fill = header_fill
    ws_meta.cell(row=1, column=2).font = header_font
    ws_meta.cell(row=1, column=3).fill = header_fill
    ws_meta.cell(row=1, column=3).font = header_font
    ws_meta.row_dimensions[1].height = 25

    meta_rows = [
        ("Recording ID", recording_id, "Unique identifier for this audio analysis session"),
        ("Full Transcription", full_transcription, "Verbatim speech recognition output from AssemblyAI"),
        ("Total Words", len(words), "Total number of words segmented and processed"),
        ("Analyzed Words", len([w for w in words if w.get("phoneme_analysis_status") == "completed" or w.get("analysis_status") == "completed"]), "Words with successful acoustic phoneme prediction"),
        ("Words Requiring Review", len([w for w in words if w.get("requires_human_review")]), "Tokens flagged for potential segmentation anomalies or acoustic discrepancies"),
        ("Acoustic Model", "facebook/wav2vec2-lv-60-espeak-cv-ft", "Hugging Face acoustic model for phonetic prediction"),
        ("ASR Provider", "AssemblyAI Speech-to-Text v2", "Cloud speech-to-text with word-level timestamps"),
        ("Unicode Preservation", "UTF-8 / OpenPyXL Native Unicode", "Guarantees uncorrupted IPA symbols (θ, ð, ŋ, ʃ, ʒ, ɪ, ə, æ, ʊ, ɑ)"),
    ]

    if ai_summary and isinstance(ai_summary, dict):
        if ai_summary.get("overall_summary"):
            meta_rows.append(("AI Analysis Summary", ai_summary["overall_summary"], "Evidence-constrained AI interpretation"))
        if ai_summary.get("limitations"):
            meta_rows.append(("Technical Limitations", "; ".join(ai_summary["limitations"]), "Disclosed analysis caveats"))

    for r_idx, (prop, val, desc) in enumerate(meta_rows, start=2):
        ws_meta.append([prop, str(val), desc])
        for col_idx in range(1, 4):
            c = ws_meta.cell(row=r_idx, column=col_idx)
            c.border = thin_border
            c.font = cell_font
            c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws_meta.row_dimensions[r_idx].height = 20

    # Auto-adjust column widths across all sheets
    for ws in wb.worksheets:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = cell.value
                if val:
                    lines = str(val).split("\n")
                    max_len = max(max_len, max(len(l) for l in lines))
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 11), 50)

    # Save to memory bytes
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def generate_human_readable_report_txt(
    recording_id: str,
    full_transcription: str,
    words: List[Dict[str, Any]],
    pronunciation_findings: Optional[List[Dict[str, Any]]] = None,
    evaluation_metrics: Optional[Dict[str, Any]] = None,
    ai_summary: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Generates a structured, human-readable text report designed for researchers and learners.
    """
    lines = []
    lines.append("=" * 80)
    lines.append("ARTICULA: PRONUNCIATION & FLUENCY EVALUATION REPORT")
    lines.append("=" * 80)
    lines.append(f"Recording ID:       {recording_id}")
    lines.append(f"Full Transcription: \"{full_transcription}\"")
    lines.append("")

    # Section A: Overall Evaluation
    total_words = len(words)
    analyzed_words = len([w for w in words if w.get("phoneme_analysis_status") == "completed" or w.get("analysis_status") == "completed"])
    review_words = [w for w in words if w.get("requires_human_review")]

    lines.append("-" * 80)
    lines.append("1. OVERALL EVALUATION SUMMARY")
    lines.append("-" * 80)
    lines.append(f"Total Words Processed:        {total_words}")
    lines.append(f"Successfully Analyzed:        {analyzed_words}")
    lines.append(f"Tokens Requiring Review:      {len(review_words)}")

    if evaluation_metrics:
        sr = evaluation_metrics.get("speech_rate", {})
        if sr.get("speech_rate_wpm") is not None:
            lines.append(f"Speech Rate:                  {sr['speech_rate_wpm']} WPM (Words: {sr.get('word_count')}, Interval: {sr.get('response_interval_seconds')}s)")
        pm = evaluation_metrics.get("pause_metrics", {})
        if pm.get("pause_count") is not None:
            lines.append(f"Silent Pauses:                {pm['pause_count']} pauses (Mean duration: {pm.get('mean_pause_duration_seconds', 'N/A')}s, Total silence: {pm.get('total_pause_duration_seconds', 0)}s)")

    lines.append("")

    # Section B: AI-Assisted Interpretation
    if ai_summary and isinstance(ai_summary, dict):
        lines.append("-" * 80)
        lines.append("2. AI-ASSISTED ANALYSIS SUMMARY")
        lines.append("-" * 80)
        if ai_summary.get("overall_summary"):
            lines.append(ai_summary["overall_summary"])
            lines.append("")

        if ai_summary.get("pronunciation_observations"):
            lines.append("Key Pronunciation Observations:")
            for obs in ai_summary["pronunciation_observations"]:
                lines.append(f"  • [{obs.get('word')}]: {obs.get('observation')}")
                if obs.get("possible_articulation_explanation"):
                    lines.append(f"    Articulation: {obs['possible_articulation_explanation']}")
                if obs.get("practice_recommendation"):
                    lines.append(f"    Practice:     {', '.join(obs['practice_recommendation'])}")
            lines.append("")

        if ai_summary.get("speech_timing_observations"):
            lines.append("Speech Timing Observations:")
            for to in ai_summary["speech_timing_observations"]:
                lines.append(f"  • {to}")
            lines.append("")

        if ai_summary.get("limitations"):
            lines.append("Important Analysis Limitations:")
            for lim in ai_summary["limitations"]:
                lines.append(f"  • {lim}")
            lines.append("")

    # Section C: Word Pronunciation Baseline
    lines.append("-" * 80)
    lines.append("3. WORD-LEVEL PRONUNCIATION SUMMARY")
    lines.append("-" * 80)
    for w in words:
        w_idx = w.get("token_index") or w.get("word_id", "?")
        w_text = w.get("text") or w.get("word", "")
        pred = w.get("predicted_phonemes_str") or w.get("phoneme_prediction") or "none"
        exp = w.get("expected_phonemes_str") or w.get("reference_phonemes") or "none"
        per = w.get("phoneme_error_rate")
        per_str = f"{per}%" if per is not None else "N/A"
        flag = " [REVIEW]" if w.get("requires_human_review") else ""
        lines.append(f"  #{w_idx:02d} {w_text:15s} | Expected: /{exp}/ | Predicted: /{pred}/ | PER: {per_str}{flag}")
    lines.append("")

    # Section D: Words Requiring Human Review
    if review_words:
        lines.append("-" * 80)
        lines.append("4. TOKENS FLAGGED FOR HUMAN REVIEW")
        lines.append("-" * 80)
        for w in review_words:
            w_idx = w.get("token_index") or w.get("word_id", "?")
            w_text = w.get("text") or w.get("word", "")
            w_conf = round(w.get("assembly_confidence") or w.get("confidence") or 0.0, 2)
            w_dur = w.get("duration_ms", "N/A")
            pred = w.get("predicted_phonemes_str") or w.get("phoneme_prediction") or "none"
            exp = w.get("expected_phonemes_str") or w.get("reference_phonemes") or "none"
            per = w.get("phoneme_error_rate")
            per_str = f"{per}%" if per is not None else "N/A"
            notes = w.get("segmentation_notes") or w.get("quality_notes") or "discrepancy detected"
            lines.append(f"  Word #{w_idx}: \"{w_text}\" | Duration: {w_dur}ms | Conf: {w_conf} | Expected: /{exp}/ | Predicted: /{pred}/ | PER: {per_str}")
            lines.append(f"    Reason: {notes}")
        lines.append("")

    lines.append("=" * 80)
    lines.append("Note: Generated for academic research and learner feedback.")
    lines.append("Pronunciation measurements should be interpreted alongside acoustic context and accent variation.")
    lines.append("=" * 80)

    return "\n".join(lines)
