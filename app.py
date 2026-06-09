from flask import Flask, request, jsonify, render_template
from deep_translator import GoogleTranslator
from langdetect import detect
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from nrclex import NRCLex
import logging
import nltk

nltk.download('vader_lexicon')
app = Flask(__name__)
sid = SentimentIntensityAnalyzer()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        lang = detect(text)
        logger.info(f"Detected Language: {lang}")
    except Exception as e:
        lang = "unknown"
        logger.warning(f"Language detection failed: {e}")

    try:
        translated = GoogleTranslator(source='auto', target='en').translate(text)
        logger.info(f"Translated Text: {translated}")
    except Exception as e:
        translated = text
        logger.warning(f"Translation failed, using original text: {e}")

    score = sid.polarity_scores(translated)
    compound = score.get('compound', 0)
    neg = score.get('neg', 0)
    neu = score.get('neu', 0)
    pos = score.get('pos', 0)
    logger.info(f"Sentiment Score: {score}")

    if compound >= 0.05:
        sentiment = "Positive"
        emoji = "😊"
    elif compound <= -0.05:
        sentiment = "Negative"
        emoji = "😞"
    else:
        sentiment = "Neutral"
        emoji = "😐"

    tone = "neutral"
    emotions = {}
    try:
        emotion_obj = NRCLex(translated)
        raw_scores = emotion_obj.raw_emotion_scores
        core_emotions = ['joy', 'sadness', 'anger', 'fear', 'trust', 'surprise', 'disgust', 'anticipation']
        emotions = {e: raw_scores.get(e, 0) for e in core_emotions}
        if raw_scores:
            tone = max(raw_scores, key=raw_scores.get)
        logger.info(f"Detected Tone: {tone}, Emotions: {emotions}")
    except Exception as e:
        logger.warning(f"Tone detection failed: {e}")

    return jsonify({
        "sentiment": sentiment,
        "emoji": emoji,
        "tone": tone,
        "compound": compound,
        "neg": neg,
        "neu": neu,
        "pos": pos,
        "emotions": emotions,
        "language": lang,
        "translated_text": translated
    })

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
