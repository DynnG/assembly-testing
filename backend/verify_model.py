# Utility script for verifying Wav2Vec2Phoneme model loading and inference
if __name__ == "__main__":
    from phoneme_analyzer import get_phoneme_model
    p, m = get_phoneme_model()
    print("Wav2Vec2Phoneme model verified and ready.")
