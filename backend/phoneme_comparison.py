"""
Articula: Expected vs. Predicted Phoneme Comparison Engine
Provides grapheme-to-phoneme (G2P) reference retrieval, IPA normalization,
sequence alignment (Levenshtein/Wagner-Fischer), Phoneme Error Rate (PER) calculation,
multiple valid pronunciation variant handling, and evidence-based pronunciation findings.
"""

from dataclasses import dataclass, field
import unicodedata
from typing import Any, Dict, List, Optional, Set, Tuple, Union

# Global lazy singletons for CMUDict and G2P to preserve fast startup and low overhead
_CMUDICT_INSTANCE = None
_G2P_INSTANCE = None


# ============================================================================
# 1. Phonetic Inventory, Articulatory Classifications, and Guidance
# ============================================================================

# Standard ARPAbet to IPA mapping
# Vowel stress (0, 1, 2) is handled dynamically in arpabet_to_ipa()
ARPABET_TO_IPA_MAP: Dict[str, str] = {
    # Consonants
    "P": "p",
    "B": "b",
    "T": "t",
    "D": "d",
    "K": "k",
    "G": "ɡ",  # Standard IPA script g (U+0261)
    "CH": "tʃ",
    "JH": "dʒ",
    "F": "f",
    "V": "v",
    "TH": "θ",
    "DH": "ð",
    "S": "s",
    "Z": "z",
    "SH": "ʃ",
    "ZH": "ʒ",
    "HH": "h",
    "M": "m",
    "EM": "m",
    "N": "n",
    "EN": "n",
    "NG": "ŋ",
    "L": "l",
    "EL": "l",
    "R": "ɹ",  # Standard English post-alveolar approximant
    "W": "w",
    "Y": "j",
    "WH": "w",
    # Vowels (base IPA)
    "AA": "ɑː",
    "AE": "æ",
    "AH": "ʌ",   # Handled: AH0 -> ə, AH1/AH2 -> ʌ
    "AO": "ɔː",
    "AW": "aʊ",
    "AY": "aɪ",
    "EH": "ɛ",
    "ER": "ɜː",  # Handled: ER0 -> ɚ, ER1/ER2 -> ɜː
    "EY": "eɪ",
    "IH": "ɪ",
    "IY": "iː",
    "OW": "oʊ",
    "OY": "ɔɪ",
    "UH": "ʊ",
    "UW": "uː",
}

# Articulatory phonetic profiles for English phonemes
PHONEME_PROFILES: Dict[str, Dict[str, Any]] = {
    # Consonants - Dental fricatives
    "θ": {
        "category": "consonant",
        "manner": "fricative",
        "place": "dental",
        "voicing": "voiceless",
        "name": "voiceless dental fricative",
        "guidance": "Place your tongue tip gently between your upper and lower teeth, allowing air to flow continuously through the gap without stopping it.",
        "practice_words": ["think", "thank", "theater", "breath", "path", "mouth"],
    },
    "ð": {
        "category": "consonant",
        "manner": "fricative",
        "place": "dental",
        "voicing": "voiced",
        "name": "voiced dental fricative",
        "guidance": "Place your tongue tip lightly between your teeth while vibrating your vocal cords, maintaining a smooth continuous air stream.",
        "practice_words": ["this", "that", "these", "other", "father", "breathe"],
    },
    # Consonants - Alveolar plosives
    "t": {
        "category": "consonant",
        "manner": "plosive",
        "place": "alveolar",
        "voicing": "voiceless",
        "name": "voiceless alveolar plosive",
        "guidance": "Touch your tongue tip firmly against the ridge behind your upper front teeth (alveolar ridge) and release with a sharp burst of air.",
        "practice_words": ["time", "top", "water", "cat", "street"],
    },
    "d": {
        "category": "consonant",
        "manner": "plosive",
        "place": "alveolar",
        "voicing": "voiced",
        "name": "voiced alveolar plosive",
        "guidance": "Touch your tongue tip against the alveolar ridge and vibrate your vocal cords as you release the closure.",
        "practice_words": ["day", "door", "leader", "bed", "hundred"],
    },
    # Consonants - Bilabial plosives
    "p": {
        "category": "consonant",
        "manner": "plosive",
        "place": "bilabial",
        "voicing": "voiceless",
        "name": "voiceless bilabial plosive",
        "guidance": "Press both lips firmly together to block airflow, then release with a clear puff of air.",
        "practice_words": ["pen", "purpose", "apple", "stop", "public"],
    },
    "b": {
        "category": "consonant",
        "manner": "plosive",
        "place": "bilabial",
        "voicing": "voiced",
        "name": "voiced bilabial plosive",
        "guidance": "Press both lips together and vibrate your vocal cords upon release.",
        "practice_words": ["book", "baby", "about", "cab", "global"],
    },
    # Consonants - Velar plosives
    "k": {
        "category": "consonant",
        "manner": "plosive",
        "place": "velar",
        "voicing": "voiceless",
        "name": "voiceless velar plosive",
        "guidance": "Raise the back of your tongue to touch the soft palate (velum) and release cleanly without voicing.",
        "practice_words": ["cat", "key", "market", "black", "speak"],
    },
    "ɡ": {
        "category": "consonant",
        "manner": "plosive",
        "place": "velar",
        "voicing": "voiced",
        "name": "voiced velar plosive",
        "guidance": "Raise the back of your tongue against the soft palate while vibrating your vocal cords as you release.",
        "practice_words": ["go", "give", "again", "big", "organize"],
    },
    # Consonants - Fricatives
    "f": {
        "category": "consonant",
        "manner": "fricative",
        "place": "labiodental",
        "voicing": "voiceless",
        "name": "voiceless labiodental fricative",
        "guidance": "Rest your upper front teeth lightly on your lower lip and breathe out with continuous friction.",
        "practice_words": ["fast", "four", "coffee", "life", "effective"],
    },
    "v": {
        "category": "consonant",
        "manner": "fricative",
        "place": "labiodental",
        "voicing": "voiced",
        "name": "voiced labiodental fricative",
        "guidance": "Rest your top teeth on your lower lip and vibrate your vocal cords to make a buzzing friction sound.",
        "practice_words": ["voice", "very", "seven", "love", "evaluate"],
    },
    "s": {
        "category": "consonant",
        "manner": "fricative",
        "place": "alveolar",
        "voicing": "voiceless",
        "name": "voiceless alveolar fricative",
        "guidance": "Bring tongue tip close to the alveolar ridge without touching, producing a clear hiss without voice.",
        "practice_words": ["see", "sun", "sister", "pass", "speech"],
    },
    "z": {
        "category": "consonant",
        "manner": "fricative",
        "place": "alveolar",
        "voicing": "voiced",
        "name": "voiced alveolar fricative",
        "guidance": "Maintain the same tongue position as /s/ while vibrating your vocal cords to produce a continuous buzz.",
        "practice_words": ["zoo", "zero", "music", "is", "requires"],
    },
    "ʃ": {
        "category": "consonant",
        "manner": "fricative",
        "place": "post-alveolar",
        "voicing": "voiceless",
        "name": "voiceless postalveolar fricative",
        "guidance": "Curve the blade of your tongue behind the alveolar ridge with slightly rounded lips and exhale continuously.",
        "practice_words": ["she", "shop", "action", "wish", "recognition"],
    },
    "ʒ": {
        "category": "consonant",
        "manner": "fricative",
        "place": "post-alveolar",
        "voicing": "voiced",
        "name": "voiced postalveolar fricative",
        "guidance": "Use the /ʃ/ tongue and lip shape while vibrating your vocal cords.",
        "practice_words": ["vision", "measure", "decision", "casual", "beige"],
    },
    # Consonants - Affricates
    "tʃ": {
        "category": "consonant",
        "manner": "affricate",
        "place": "post-alveolar",
        "voicing": "voiceless",
        "name": "voiceless postalveolar affricate",
        "guidance": "Start with your tongue in the /t/ position behind your upper teeth, then quickly release into a /ʃ/ friction.",
        "practice_words": ["chair", "church", "teacher", "match", "challenge"],
    },
    "dʒ": {
        "category": "consonant",
        "manner": "affricate",
        "place": "post-alveolar",
        "voicing": "voiced",
        "name": "voiced postalveolar affricate",
        "guidance": "Start with your tongue in the /d/ position, then release into a voiced /ʒ/ friction.",
        "practice_words": ["job", "judge", "major", "page", "challenge"],
    },
    # Consonants - Nasals
    "m": {
        "category": "consonant",
        "manner": "nasal",
        "place": "bilabial",
        "voicing": "voiced",
        "name": "bilabial nasal",
        "guidance": "Close both lips completely and let air pass through your nose while vibrating your vocal cords.",
        "practice_words": ["man", "make", "summer", "time", "communication"],
    },
    "n": {
        "category": "consonant",
        "manner": "nasal",
        "place": "alveolar",
        "voicing": "voiced",
        "name": "alveolar nasal",
        "guidance": "Press your tongue tip against the alveolar ridge and let air escape through your nasal cavity.",
        "practice_words": ["no", "new", "dinner", "sun", "confidence"],
    },
    "ŋ": {
        "category": "consonant",
        "manner": "nasal",
        "place": "velar",
        "voicing": "voiced",
        "name": "velar nasal",
        "guidance": "Press the back of your tongue against the soft palate and direct the airflow entirely through your nose.",
        "practice_words": ["sing", "ring", "thinking", "english", "listening"],
    },
    # Consonants - Approximants / Liquids
    "l": {
        "category": "consonant",
        "manner": "lateral-approximant",
        "place": "alveolar",
        "voicing": "voiced",
        "name": "alveolar lateral approximant",
        "guidance": "Place the tip of your tongue firmly on the alveolar ridge, letting air flow smoothly along the sides.",
        "practice_words": ["light", "learn", "follow", "call", "multicultural"],
    },
    "ɹ": {
        "category": "consonant",
        "manner": "approximant",
        "place": "post-alveolar",
        "voicing": "voiced",
        "name": "postalveolar approximant (English R)",
        "guidance": "Curl the sides of your tongue against the upper back molars while keeping the tongue tip back without touching the roof of your mouth.",
        "practice_words": ["red", "run", "research", "requires", "pronunciation"],
    },
    "w": {
        "category": "consonant",
        "manner": "approximant",
        "place": "labio-velar",
        "voicing": "voiced",
        "name": "voiced labio-velar approximant",
        "guidance": "Round your lips tightly into a small circle while raising the back of your tongue toward the soft palate.",
        "practice_words": ["we", "water", "away", "well", "worked"],
    },
    "j": {
        "category": "consonant",
        "manner": "approximant",
        "place": "palatal",
        "voicing": "voiced",
        "name": "palatal approximant (Y sound)",
        "guidance": "Raise the front of your tongue toward the hard palate, gliding smoothly into the following vowel.",
        "practice_words": ["yes", "year", "yellow", "music", "you"],
    },
    "h": {
        "category": "consonant",
        "manner": "fricative",
        "place": "glottal",
        "voicing": "voiceless",
        "name": "voiceless glottal fricative",
        "guidance": "Expel air gently through an open glottis without creating oral restriction.",
        "practice_words": ["he", "hello", "house", "ahead"],
    },
    "ʔ": {
        "category": "consonant",
        "manner": "plosive",
        "place": "glottal",
        "voicing": "voiceless",
        "name": "glottal stop",
        "guidance": "Briefly close the vocal folds to momentarily stop airflow before the onset of the sound.",
        "practice_words": ["button", "uh-oh"],
    },
    "ɾ": {
        "category": "consonant",
        "manner": "tap",
        "place": "alveolar",
        "voicing": "voiced",
        "name": "alveolar tap/flap",
        "guidance": "Quickly tap your tongue tip against the alveolar ridge once (as in American English 'water' or 'butter').",
        "practice_words": ["water", "butter", "city", "better"],
    },
    # Vowels
    "iː": {
        "category": "vowel",
        "height": "close",
        "backness": "front",
        "roundedness": "unrounded",
        "name": "close front unrounded vowel (long E)",
        "guidance": "Smile slightly and raise your tongue high toward the front of your mouth, holding the vowel steady.",
        "practice_words": ["see", "team", "speech", "effective", "feed"],
    },
    "ɪ": {
        "category": "vowel",
        "height": "near-close",
        "backness": "near-front",
        "roundedness": "unrounded",
        "name": "near-close near-front unrounded vowel (short I)",
        "guidance": "Keep your mouth slightly open and relaxed with your tongue just below the /iː/ position.",
        "practice_words": ["sit", "think", "listening", "this", "english"],
    },
    "eɪ": {
        "category": "vowel",
        "diphthong": True,
        "name": "closing diphthong (face vowel)",
        "guidance": "Start with an open-mid front vowel /e/ and glide upward toward /ɪ/.",
        "practice_words": ["say", "main", "explain", "communication", "great"],
    },
    "ɛ": {
        "category": "vowel",
        "height": "open-mid",
        "backness": "front",
        "roundedness": "unrounded",
        "name": "open-mid front unrounded vowel (short E)",
        "guidance": "Drop your lower jaw moderately with your tongue flat in the middle-front of the mouth.",
        "practice_words": ["bed", "well", "effective", "red", "best"],
    },
    "æ": {
        "category": "vowel",
        "height": "near-open",
        "backness": "front",
        "roundedness": "unrounded",
        "name": "near-open front unrounded vowel (short A)",
        "guidance": "Open your mouth wide and flatten your tongue forward, as in 'cat'.",
        "practice_words": ["cat", "active", "adapt", "challenge", "that"],
    },
    "ɑː": {
        "category": "vowel",
        "height": "open",
        "backness": "back",
        "roundedness": "unrounded",
        "name": "open back unrounded vowel (father vowel)",
        "guidance": "Open your mouth fully with a relaxed, low tongue positioned toward the back.",
        "practice_words": ["father", "calm", "last", "part", "dark"],
    },
    "ɑ": {
        "category": "vowel",
        "height": "open",
        "backness": "back",
        "roundedness": "unrounded",
        "name": "open back unrounded vowel",
        "guidance": "Drop your jaw with your tongue low and back, producing an open back sound.",
        "practice_words": ["hot", "stop", "body", "confidence"],
    },
    "ɒ": {
        "category": "vowel",
        "height": "open",
        "backness": "back",
        "roundedness": "rounded",
        "name": "open back rounded vowel (British short O)",
        "guidance": "Open your mouth wide while lightly rounding your lips.",
        "practice_words": ["want", "lot", "confidence", "not", "box"],
    },
    "ɔː": {
        "category": "vowel",
        "height": "open-mid",
        "backness": "back",
        "roundedness": "rounded",
        "name": "open-mid back rounded vowel (thought vowel)",
        "guidance": "Round your lips firmly with the back of your tongue raised to mid-height.",
        "practice_words": ["thought", "for", "automatic", "law", "all"],
    },
    "ɔ": {
        "category": "vowel",
        "height": "open-mid",
        "backness": "back",
        "roundedness": "rounded",
        "name": "open-mid back rounded vowel",
        "guidance": "Round lips moderately with the back of the tongue raised.",
        "practice_words": ["dog", "caught", "call"],
    },
    "oʊ": {
        "category": "vowel",
        "diphthong": True,
        "name": "closing diphthong (goat vowel)",
        "guidance": "Start with mid-back rounded /o/ and glide toward /ʊ/ as your lips round more tightly.",
        "practice_words": ["go", "smoke", "hello", "boat", "home"],
    },
    "əʊ": {
        "category": "vowel",
        "diphthong": True,
        "name": "closing diphthong (British goat vowel)",
        "guidance": "Start at central schwa /ə/ and round your lips gliding smoothly toward /ʊ/.",
        "practice_words": ["go", "hello", "post", "smoke"],
    },
    "ʊ": {
        "category": "vowel",
        "height": "near-close",
        "backness": "near-back",
        "roundedness": "rounded",
        "name": "near-close near-back rounded vowel (foot vowel)",
        "guidance": "Round your lips lightly and relax the tongue near the back high position.",
        "practice_words": ["foot", "put", "good", "book", "could"],
    },
    "uː": {
        "category": "vowel",
        "height": "close",
        "backness": "back",
        "roundedness": "rounded",
        "name": "close back rounded vowel (goose vowel)",
        "guidance": "Purse your lips tightly into a small circle with the back of your tongue raised high.",
        "practice_words": ["to", "you", "improve", "room", "blue"],
    },
    "ʌ": {
        "category": "vowel",
        "height": "open-mid",
        "backness": "back",
        "roundedness": "unrounded",
        "name": "open-mid back unrounded vowel (strut vowel)",
        "guidance": "Keep your lips relaxed and jaw slightly lowered with the tongue center-back.",
        "practice_words": ["cup", "multicultural", "public", "um", "pronunciation"],
    },
    "ə": {
        "category": "vowel",
        "height": "mid",
        "backness": "central",
        "roundedness": "unrounded",
        "name": "mid-central vowel (schwa)",
        "guidance": "Completely relax all mouth, tongue, and jaw muscles in a neutral central position.",
        "practice_words": ["the", "of", "about", "canada", "purpose"],
    },
    "ɜː": {
        "category": "vowel",
        "height": "open-mid",
        "backness": "central",
        "roundedness": "unrounded",
        "name": "open-mid central unrounded vowel (nurse vowel)",
        "guidance": "Hold the tongue central with the jaw moderately open without lip rounding.",
        "practice_words": ["work", "worked", "learned", "purpose", "research"],
    },
    "ɚ": {
        "category": "vowel",
        "rhotacized": True,
        "name": "rhotacized schwa (unstressed rhotic vowel)",
        "guidance": "Produce a relaxed central schwa while retracting the tongue body for rhotic resonance.",
        "practice_words": ["butter", "water", "teacher", "leader", "wildfires"],
    },
    "ə˞": {
        "category": "vowel",
        "rhotacized": True,
        "name": "rhotic schwa (r-colored vowel)",
        "guidance": "Maintain a central schwa with r-colored tongue curl or retraction.",
        "practice_words": ["from", "butter", "water"],
    },
    "ɝ": {
        "category": "vowel",
        "rhotacized": True,
        "name": "stressed rhotacized vowel",
        "guidance": "Produce a stressed mid-central vowel with tongue curled slightly back for rhotic resonance.",
        "practice_words": ["bird", "work", "learn", "word"],
    },
    "aɪ": {
        "category": "vowel",
        "diphthong": True,
        "name": "closing diphthong (price vowel)",
        "guidance": "Open your jaw wide for /a/ and glide upward toward the near-close front /ɪ/.",
        "practice_words": ["i", "think", "my", "wildfires", "requires", "time"],
    },
    "aʊ": {
        "category": "vowel",
        "diphthong": True,
        "name": "closing diphthong (mouth vowel)",
        "guidance": "Open your mouth for /a/ and round your lips gliding smoothly up to /ʊ/.",
        "practice_words": ["now", "out", "about", "sound", "house"],
    },
    "ɔɪ": {
        "category": "vowel",
        "diphthong": True,
        "name": "closing diphthong (choice vowel)",
        "guidance": "Start with rounded lips at /ɔ/ and glide smoothly toward /ɪ/ while relaxing lip rounding.",
        "practice_words": ["voice", "boy", "oil", "join", "choice"],
    },
    "iə": {
        "category": "vowel",
        "diphthong": True,
        "name": "centering diphthong (near vowel)",
        "guidance": "Start at /ɪ/ and glide toward a relaxed central schwa /ə/.",
        "practice_words": ["year", "near", "hear", "beer"],
    },
    "eə": {
        "category": "vowel",
        "diphthong": True,
        "name": "centering diphthong (square vowel)",
        "guidance": "Start at /ɛ/ and glide toward central schwa /ə/.",
        "practice_words": ["air", "care", "chair", "where"],
    },
    "ʊə": {
        "category": "vowel",
        "diphthong": True,
        "name": "centering diphthong (cure vowel)",
        "guidance": "Start with rounded /ʊ/ and glide toward central schwa /ə/.",
        "practice_words": ["cure", "tour", "pure"],
    },
}


# ============================================================================
# 2. Phoneme Normalization and Tokenization
# ============================================================================

# Multi-character IPA tokens recognized by Wav2Vec2 and reference systems
KNOWN_MULTI_CHAR_IPA: List[str] = [
    "tʃ", "dʒ", "aɪ", "eɪ", "oʊ", "aʊ", "ɔɪ", "əʊ",
    "iː", "uː", "ɔː", "ɑː", "ɜː", "aː", "eː", "oː",
    "iə", "eə", "ʊə", "ə˞", "ɑːɹ", "ɔːɹ", "ts", "dz"
]


def normalize_ipa_symbol(symbol: str) -> str:
    """
    Normalizes phonetic symbols across transcription systems:
    - Normalizes Unicode representations (NFC).
    - Unifies Latin 'g' (U+0067) to IPA script 'ɡ' (U+0261) used by Wav2Vec2/eSpeak.
    - Unifies length marker ascii ':' to IPA length mark 'ː' (U+02D0).
    - Removes combining tie bars (U+0361, U+035C).
    - Strips stress markers (ˈ, ˌ) from individual phoneme identities.
    """
    if not symbol:
        return ""

    s = unicodedata.normalize("NFC", symbol)
    # Remove stress marks and pitch numbers
    s = s.replace("ˈ", "").replace("ˌ", "").replace("'", "")
    # Remove tie bars
    s = s.replace("\u0361", "").replace("\u035c", "")
    # Normalize g to IPA ɡ
    s = s.replace("g", "ɡ")
    # Normalize length mark
    s = s.replace(":", "ː")
    # Strip eSpeak tone digits if any (e.g. 'a5' -> 'a')
    if len(s) > 1 and s[-1].isdigit():
        s = s[:-1]
    return s.strip()


def tokenize_phoneme_sequence(phoneme_input: Union[str, List[str]]) -> List[str]:
    """
    Tokenizes phoneme sequences into discrete phonetic sound units.
    Operates on phoneme tokens, preserving multi-character sounds (e.g. /tʃ/, /dʒ/, /oʊ/, /aɪ/).
    
    Accepts:
    - Space-separated IPA string: "θ ˈɪ ŋ k" -> ["θ", "ɪ", "ŋ", "k"]
    - Token list: ["s", "m", "oʊ", "k"] -> ["s", "m", "oʊ", "k"]
    - Continuous IPA string: parses greedily using known IPA phonemes.
    """
    if isinstance(phoneme_input, list):
        tokens = []
        for t in phoneme_input:
            norm = normalize_ipa_symbol(str(t))
            if norm:
                tokens.append(norm)
        return tokens

    if not isinstance(phoneme_input, str):
        return []

    raw = phoneme_input.strip()
    if not raw:
        return []

    # If space-separated, split on whitespace and normalize each token
    if " " in raw:
        tokens = []
        for part in raw.split():
            norm = normalize_ipa_symbol(part)
            if norm:
                tokens.append(norm)
        return tokens

    # Continuous string fallback: greedy multi-char matching
    clean_str = normalize_ipa_symbol(raw)
    tokens: List[str] = []
    i = 0
    n = len(clean_str)

    # Sort multi-char phonemes longest-first for greedy matching
    sorted_multi = sorted(KNOWN_MULTI_CHAR_IPA, key=len, reverse=True)

    while i < n:
        matched = False
        for mc in sorted_multi:
            if clean_str[i : i + len(mc)] == mc:
                tokens.append(mc)
                i += len(mc)
                matched = True
                break
        if not matched:
            tokens.append(clean_str[i])
            i += 1

    return tokens


def arpabet_to_ipa(arpabet_tokens: List[str]) -> List[str]:
    """
    Converts ARPAbet phoneme sequence (from CMUDict or G2P) to normalized IPA phonemes.
    Correctly resolves stress-dependent vowels:
    - AH0 -> /ə/ (schwa), AH1/AH2 -> /ʌ/ (wedge)
    - ER0 -> /ɚ/ (unstressed rhotic vowel), ER1/ER2 -> /ɜː/ (stressed nurse vowel)
    - R -> /ɹ/ (postalveolar approximant)
    - G -> /ɡ/ (IPA script g)
    """
    ipa_tokens = []
    for token in arpabet_tokens:
        clean = token.strip().upper()
        if not clean:
            continue

        # Extract stress digit (0, 1, 2) if present
        stress = None
        base = clean
        if clean[-1].isdigit():
            stress = int(clean[-1])
            base = clean[:-1]

        # Handle stress-conditioned vowels
        if base == "AH":
            ipa_sym = "ə" if stress == 0 else "ʌ"
        elif base == "ER":
            ipa_sym = "ɚ" if stress == 0 else "ɜː"
        elif base in ARPABET_TO_IPA_MAP:
            ipa_sym = ARPABET_TO_IPA_MAP[base]
        else:
            # Fallback for unexpected token
            ipa_sym = base.lower()

        normalized = normalize_ipa_symbol(ipa_sym)
        if normalized:
            ipa_tokens.append(normalized)

    return ipa_tokens


# ============================================================================
# 3. Reference Pronunciation Generator (CMUDict, G2P, Canonical Dictionary)
# ============================================================================

@dataclass
class ExpectedPronunciationResult:
    """Structured representation of expected reference phonemes for an intended word."""
    word: str
    normalized_word: str
    expected_phonemes: List[str]
    expected_phonemes_str: str
    reference_source: str  # "canonical_dictionary" | "cmudict" | "g2p_model" | "unsupported"
    all_variants: List[List[str]] = field(default_factory=list)
    selected_variant_index: int = 0
    accent_or_variety: str = "General English"
    status: str = "available"  # "available" | "fallback_g2p" | "unsupported"
    notes: Optional[str] = None


class ExpectedPhonemeGenerator:
    """
    Multi-tiered reference pronunciation generator:
    1. Curated domain reference dictionary (exact canonical baseline for thesis test sets).
    2. CMU Pronouncing Dictionary (comprehensive English lexicon supporting multiple pronunciation variants).
    3. G2P Neural/Rule Model (g2p_en for out-of-vocabulary words, names, neologisms).
    4. Graceful handling for unknown words, symbols, and unsupported tokens.
    """

    def __init__(self, canonical_overrides: Optional[Dict[str, str]] = None):
        self.canonical_overrides = canonical_overrides or {}
        self._cmudict_dict: Optional[Dict[str, List[List[str]]]] = None
        self._g2p_model = None

    def _get_cmudict(self) -> Optional[Dict[str, List[List[str]]]]:
        """Lazy loader for CMU Pronouncing Dictionary."""
        if self._cmudict_dict is not None:
            return self._cmudict_dict
        try:
            import cmudict
            self._cmudict_dict = cmudict.dict()
            return self._cmudict_dict
        except Exception:
            return None

    def _get_g2p_model(self):
        """Lazy loader for g2p_en out-of-vocabulary grapheme-to-phoneme fallback model."""
        if self._g2p_model is not None:
            return self._g2p_model
        try:
            from g2p_en import G2p
            self._g2p_model = G2p()
            return self._g2p_model
        except Exception:
            return None

    def generate_expected(
        self,
        word: str,
        preferred_accent: str = "General English",
    ) -> ExpectedPronunciationResult:
        """
        Retrieves expected phonetic representation for the given intended word.
        Preserves word-level association, supports multiple variants, and records the source.
        """
        raw_word = str(word).strip()
        cleaned_word = raw_word.lower().strip(".,!?;:\"'()[]{}/*-")

        if not cleaned_word:
            return ExpectedPronunciationResult(
                word=raw_word,
                normalized_word="",
                expected_phonemes=[],
                expected_phonemes_str="",
                reference_source="unsupported",
                status="unsupported",
                notes="Word is empty or consists entirely of punctuation.",
            )

        # 1. Tier 1: Canonical Curated Overrides (Domain dictionary)
        if cleaned_word in self.canonical_overrides:
            canon_str = self.canonical_overrides[cleaned_word]
            tokens = tokenize_phoneme_sequence(canon_str)
            return ExpectedPronunciationResult(
                word=raw_word,
                normalized_word=cleaned_word,
                expected_phonemes=tokens,
                expected_phonemes_str=" ".join(tokens),
                reference_source="canonical_dictionary",
                all_variants=[tokens],
                selected_variant_index=0,
                accent_or_variety=preferred_accent,
                status="available",
                notes="Curated research baseline pronunciation.",
            )

        # 2. Tier 2: CMU Pronouncing Dictionary
        cmu = self._get_cmudict()
        if cmu and cleaned_word in cmu:
            raw_variants = cmu[cleaned_word]
            variants_ipa: List[List[str]] = []
            for v in raw_variants:
                ipa_seq = arpabet_to_ipa(v)
                if ipa_seq and ipa_seq not in variants_ipa:
                    variants_ipa.append(ipa_seq)

            if variants_ipa:
                primary = variants_ipa[0]
                variant_note = f"{len(variants_ipa)} valid pronunciation variants available." if len(variants_ipa) > 1 else None
                return ExpectedPronunciationResult(
                    word=raw_word,
                    normalized_word=cleaned_word,
                    expected_phonemes=primary,
                    expected_phonemes_str=" ".join(primary),
                    reference_source="cmudict",
                    all_variants=variants_ipa,
                    selected_variant_index=0,
                    accent_or_variety=preferred_accent,
                    status="available",
                    notes=variant_note,
                )

        # 3. Tier 3: G2P Model Fallback for Out-of-Vocabulary words / names
        g2p = self._get_g2p_model()
        if g2p:
            try:
                g2p_raw = g2p(cleaned_word)
                # Filter punctuation from g2p output
                arpabet_filtered = [t for t in g2p_raw if isinstance(t, str) and t.strip() and t.isalnum()]
                if arpabet_filtered:
                    ipa_seq = arpabet_to_ipa(arpabet_filtered)
                    if ipa_seq:
                        return ExpectedPronunciationResult(
                            word=raw_word,
                            normalized_word=cleaned_word,
                            expected_phonemes=ipa_seq,
                            expected_phonemes_str=" ".join(ipa_seq),
                            reference_source="g2p_model",
                            all_variants=[ipa_seq],
                            selected_variant_index=0,
                            accent_or_variety=preferred_accent,
                            status="fallback_g2p",
                            notes="Generated via neural/rule grapheme-to-phoneme model (word not present in dictionary).",
                        )
            except Exception as g2p_exc:
                pass

        # 4. Tier 4: Unsupported / Unknown Word Fallback
        return ExpectedPronunciationResult(
            word=raw_word,
            normalized_word=cleaned_word,
            expected_phonemes=[],
            expected_phonemes_str="",
            reference_source="unsupported",
            all_variants=[],
            selected_variant_index=0,
            accent_or_variety=preferred_accent,
            status="unsupported",
            notes=f"Word '{cleaned_word}' could not be phonetically resolved in reference dictionaries or G2P.",
        )


# ============================================================================
# 4. Phoneme Alignment (Levenshtein / Wagner-Fischer Edit Distance)
# ============================================================================

def align_phoneme_sequences(
    expected_tokens: List[str],
    predicted_tokens: List[str],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Performs sequence alignment between expected reference phonemes and predicted phonemes
    using the Wagner-Fischer dynamic programming algorithm.
    
    Identifies:
    - match: identical phoneme
    - substitution: expected phoneme replaced by different predicted phoneme
    - deletion: expected phoneme missing from prediction
    - insertion: extraneous predicted phoneme not in reference
    
    Returns:
        (alignment_list, per_metrics_dict)
    """
    n = len(expected_tokens)
    m = len(predicted_tokens)

    # Cost table
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    # Operations table for traceback: 'M'=Match, 'S'=Sub, 'D'=Del, 'I'=Ins
    ops = [[""] * (m + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        dp[i][0] = i
        ops[i][0] = "D"

    for j in range(1, m + 1):
        dp[0][j] = j
        ops[0][j] = "I"

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            exp_p = expected_tokens[i - 1]
            pred_p = predicted_tokens[j - 1]

            if exp_p == pred_p:
                match_cost = dp[i - 1][j - 1]
                del_cost = dp[i - 1][j] + 1
                ins_cost = dp[i][j - 1] + 1

                min_c = min(match_cost, del_cost, ins_cost)
                dp[i][j] = min_c
                if min_c == match_cost:
                    ops[i][j] = "M"
                elif min_c == del_cost:
                    ops[i][j] = "D"
                else:
                    ops[i][j] = "I"
            else:
                sub_cost = dp[i - 1][j - 1] + 1
                del_cost = dp[i - 1][j] + 1
                ins_cost = dp[i][j - 1] + 1

                min_c = min(sub_cost, del_cost, ins_cost)
                dp[i][j] = min_c
                if min_c == sub_cost:
                    ops[i][j] = "S"
                elif min_c == del_cost:
                    ops[i][j] = "D"
                else:
                    ops[i][j] = "I"

    # Traceback to build alignment sequence
    i = n
    j = m
    rev_alignment: List[Dict[str, Any]] = []

    while i > 0 or j > 0:
        op = ops[i][j]
        if op == "M":
            rev_alignment.append({
                "operation": "match",
                "expected": expected_tokens[i - 1],
                "predicted": predicted_tokens[j - 1],
                "expected_index": i - 1,
                "predicted_index": j - 1,
            })
            i -= 1
            j -= 1
        elif op == "S":
            rev_alignment.append({
                "operation": "substitution",
                "expected": expected_tokens[i - 1],
                "predicted": predicted_tokens[j - 1],
                "expected_index": i - 1,
                "predicted_index": j - 1,
            })
            i -= 1
            j -= 1
        elif op == "D":
            rev_alignment.append({
                "operation": "deletion",
                "expected": expected_tokens[i - 1],
                "predicted": None,
                "expected_index": i - 1,
                "predicted_index": None,
            })
            i -= 1
        elif op == "I":
            rev_alignment.append({
                "operation": "insertion",
                "expected": None,
                "predicted": predicted_tokens[j - 1],
                "expected_index": None,
                "predicted_index": j - 1,
            })
            j -= 1
        else:
            break

    rev_alignment.reverse()

    # Assign sequential step position numbers
    alignment: List[Dict[str, Any]] = []
    substitutions = 0
    deletions = 0
    insertions = 0
    matches = 0

    for pos, item in enumerate(rev_alignment):
        item["position"] = pos
        alignment.append(item)
        op = item["operation"]
        if op == "substitution":
            substitutions += 1
        elif op == "deletion":
            deletions += 1
        elif op == "insertion":
            insertions += 1
        elif op == "match":
            matches += 1

    # Phoneme Error Rate (PER) Formula:
    # PER = (S + D + I) / N * 100
    if n > 0:
        per = round(((substitutions + deletions + insertions) / n) * 100.0, 2)
        per_status = "valid"
    else:
        if m == 0:
            per = 0.0
            per_status = "empty_sequences"
        else:
            per = 100.0
            per_status = "reference_unavailable"

    metrics = {
        "substitutions": substitutions,
        "deletions": deletions,
        "insertions": insertions,
        "matches": matches,
        "reference_phoneme_count": n,
        "predicted_phoneme_count": m,
        "total_edits": substitutions + deletions + insertions,
        "phoneme_error_rate": per,
        "status": per_status,
        "formula": "PER = (S + D + I) / N * 100",
    }

    return alignment, metrics


def select_best_variant_alignment(
    all_variants: List[List[str]],
    predicted_tokens: List[str],
) -> Tuple[int, List[str], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Handles words with multiple valid pronunciations (e.g. US vs UK, alternate lexical forms).
    Compares predicted phonemes against every legitimate reference variant and selects the
    variant yielding the minimal edit distance, preventing valid accents from being flagged as errors.
    
    Returns:
        (best_variant_index, best_variant_tokens, best_alignment, best_metrics)
    """
    if not all_variants:
        alignment, metrics = align_phoneme_sequences([], predicted_tokens)
        return 0, [], alignment, metrics

    best_index = 0
    best_tokens = all_variants[0]
    best_alignment, best_metrics = align_phoneme_sequences(best_tokens, predicted_tokens)
    best_edits = best_metrics["total_edits"]

    for idx in range(1, len(all_variants)):
        variant = all_variants[idx]
        cur_alignment, cur_metrics = align_phoneme_sequences(variant, predicted_tokens)
        cur_edits = cur_metrics["total_edits"]

        # Prefer fewer total edits, or lower PER on tie
        if cur_edits < best_edits or (cur_edits == best_edits and cur_metrics["phoneme_error_rate"] < best_metrics["phoneme_error_rate"]):
            best_index = idx
            best_tokens = variant
            best_alignment = cur_alignment
            best_metrics = cur_metrics
            best_edits = cur_edits

    return best_index, best_tokens, best_alignment, best_metrics


# ============================================================================
# 5. Evidence-Based Pronunciation Findings Generator
# ============================================================================

def classify_phonetic_token(token: Optional[str]) -> Dict[str, Any]:
    """Retrieves articulatory classification and profile for a phoneme token."""
    if not token:
        return {"category": "unknown", "name": "unknown"}

    norm = normalize_ipa_symbol(token)
    if norm in PHONEME_PROFILES:
        return PHONEME_PROFILES[norm]

    # Heuristic fallback for unlisted phonemes
    vowels = {"a", "e", "i", "o", "u", "æ", "ʌ", "ə", "ɪ", "ɛ", "ʊ", "ɒ", "ɑ", "y"}
    if any(v in norm for v in vowels):
        return {"category": "vowel", "name": f"vowel sound /{norm}/"}
    return {"category": "consonant", "name": f"consonant sound /{norm}/"}


def generate_pronunciation_findings(
    word: str,
    alignment: List[Dict[str, Any]],
    reference_source: str,
    audio_clip: Optional[str] = None,
    expected_phonemes_str: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Converts raw phonetic differences into structured, evidence-based observations.
    Categorizes differences into consonant/vowel substitutions, deletions, and insertions.
    Prepares clear articulatory guidance and practice targets for future feedback generation.
    
    IMPORTANT:
    Flags observations with confidence_level='requires_validation' and
    validation_status='unvalidated_single_occurrence' to avoid premature clinical diagnoses.
    """
    findings: List[Dict[str, Any]] = []

    for item in alignment:
        op = item["operation"]
        if op == "match":
            continue

        exp = item.get("expected")
        pred = item.get("predicted")
        pos = item.get("position", 0)

        exp_profile = classify_phonetic_token(exp)
        pred_profile = classify_phonetic_token(pred)

        exp_cat = exp_profile.get("category", "unknown")
        pred_cat = pred_profile.get("category", "unknown")

        # Determine observed characteristic
        if op == "substitution":
            if exp_cat == "consonant" and pred_cat == "consonant":
                characteristic = "potential_consonant_substitution"
            elif exp_cat == "vowel" and pred_cat == "vowel":
                characteristic = "potential_vowel_substitution"
            else:
                characteristic = "potential_phoneme_substitution"

            target_phone = exp
            rec_guidance = exp_profile.get("guidance") or f"Practice clear articulation of target /{exp}/."
            rec_name = exp_profile.get("name") or f"/{exp}/"
            recommendation = f"Target {rec_name} was recognized as /{pred}/. {rec_guidance}"

        elif op == "deletion":
            characteristic = "potential_consonant_deletion" if exp_cat == "consonant" else "potential_vowel_deletion"
            target_phone = exp
            rec_guidance = exp_profile.get("guidance") or f"Ensure complete articulation of /{exp}/."
            rec_name = exp_profile.get("name") or f"/{exp}/"
            recommendation = f"Target {rec_name} was not detected in this word. {rec_guidance}"

        elif op == "insertion":
            characteristic = "potential_consonant_insertion" if pred_cat == "consonant" else "potential_vowel_insertion"
            target_phone = pred
            recommendation = f"Additional /{pred}/ detected at position {pos}. Practice producing the word without inserting this extra sound."

        else:
            continue

        finding = {
            "word": word,
            "identified_word": word,
            "observed_characteristic": characteristic,
            "target_phoneme": target_phone,
            "expected_phoneme": exp,
            "predicted_phoneme": pred,
            "difference_type": op,
            "phoneme_position": pos,
            "phonetic_category": exp_cat if op != "insertion" else pred_cat,
            "articulatory_description": exp_profile.get("name") if op != "insertion" else pred_profile.get("name"),
            "supporting_audio_clip": audio_clip,
            "reference_pronunciation": f"/{expected_phonemes_str}/" if expected_phonemes_str else None,
            "reference_source": reference_source,
            "evidence": "phoneme_sequence_comparison",
            "confidence_level": "requires_validation",
            "validation_status": "unvalidated_single_occurrence",
            "recommendation": recommendation,
            "suggested_practice_target": f"Practice /{target_phone}/ in syllable onsets and codas.",
            "practice_words": exp_profile.get("practice_words") or [],
            "notes": (
                "Single-instance acoustic observation. Differences may arise from acoustic segmentation, "
                "connected-speech coarticulation, background noise, or model receptive field limitations "
                "rather than a persistent learner pronunciation difficulty."
            ),
        }
        findings.append(finding)

    return findings


# ============================================================================
# 6. High-Level Comparison Pipeline
# ============================================================================

def compare_word_phonemes(
    word: str,
    predicted_tokens: List[str],
    generator: ExpectedPhonemeGenerator,
    assembly_confidence: Optional[float] = None,
    audio_clip: Optional[str] = None,
    preferred_accent: str = "General English",
) -> Dict[str, Any]:
    """
    Executes the end-to-end Expected vs Predicted Phoneme Comparison for an individual word.
    Produces the target structured schema matching project requirements.
    """
    # 1. Retrieve expected reference phonemes (supporting multiple variants)
    ref_result = generator.generate_expected(word, preferred_accent=preferred_accent)

    # 2. Select best-matching pronunciation variant and align sequences
    if ref_result.all_variants:
        best_idx, selected_tokens, alignment, per_metrics = select_best_variant_alignment(
            ref_result.all_variants,
            predicted_tokens,
        )
    else:
        best_idx = 0
        selected_tokens = ref_result.expected_phonemes
        alignment, per_metrics = align_phoneme_sequences(selected_tokens, predicted_tokens)

    # 3. Generate evidence-based pronunciation findings
    findings = generate_pronunciation_findings(
        word=word,
        alignment=alignment,
        reference_source=ref_result.reference_source,
        audio_clip=audio_clip,
        expected_phonemes_str=" ".join(selected_tokens),
    )

    # 4. Determine analysis status and human review recommendation
    has_substitutions_or_deletions = any(
        item["operation"] in ("substitution", "deletion") for item in alignment
    )
    requires_review = False
    if assembly_confidence is not None and assembly_confidence < 0.85:
        requires_review = True
    elif per_metrics["phoneme_error_rate"] > 0:
        requires_review = True
    elif ref_result.status == "unsupported":
        requires_review = True

    analysis_status = "completed"
    if ref_result.status == "unsupported" and not predicted_tokens:
        analysis_status = "unsupported"
    elif not predicted_tokens:
        analysis_status = "prediction_missing"

    return {
        "word": word,
        "assembly_confidence": assembly_confidence,
        "expected_phonemes": selected_tokens,
        "expected_phonemes_str": " ".join(selected_tokens),
        "predicted_phonemes": predicted_tokens,
        "predicted_phonemes_str": " ".join(predicted_tokens),
        "reference_source": ref_result.reference_source,
        "reference_variants": [" ".join(v) for v in ref_result.all_variants],
        "selected_variant_index": best_idx,
        "accent_or_variety": ref_result.accent_or_variety,
        "alignment": alignment,
        "phoneme_error_rate": per_metrics["phoneme_error_rate"],
        "per_metrics": per_metrics,
        "pronunciation_findings": findings,
        "findings_count": len(findings),
        "analysis_status": analysis_status,
        "requires_human_review": requires_review,
    }
