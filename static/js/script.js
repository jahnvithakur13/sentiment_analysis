// ===== DOM REFS =====
const analyzeBtn = document.getElementById("analyzeBtn");
const commentBox = document.getElementById("comment");
const loadingOverlay = document.getElementById("loadingOverlay");
const idleState = document.getElementById("idleState");
const resultsContent = document.getElementById("resultsContent");
const charCount = document.getElementById("charCount");
const langBadge = document.getElementById("langBadge");
const langText = document.getElementById("langText");
const historyList = document.getElementById("historyList");

// Result elements
const resultEmoji = document.getElementById("resultEmoji");
const resultSentiment = document.getElementById("resultSentiment");
const resultTone = document.getElementById("resultTone");
const scoreBadge = document.getElementById("scoreBadge");
const gaugeScore = document.getElementById("gaugeScore");
const translatedText = document.getElementById("translatedText");
const translatedCard = document.getElementById("translatedCard");

// ===== STATE =====
let gaugeChart = null;
let barChart = null;
let radarChart = null;
const history = [];

// ===== CHAR COUNTER =====
commentBox.addEventListener("input", () => {
  const len = commentBox.value.length;
  charCount.textContent = len;
  if (len > 500) commentBox.value = commentBox.value.slice(0, 500);
});

// ===== QUICK FILL CHIPS =====
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    commentBox.value = chip.dataset.text;
    charCount.textContent = chip.dataset.text.length;
    commentBox.focus();
  });
});

// ===== ANALYZE =====
analyzeBtn.addEventListener("click", async () => {
  const comment = commentBox.value.trim();
  if (!comment) {
    shakeElement(commentBox);
    return;
  }

  // Show loading
  loadingOverlay.classList.remove("hidden");
  analyzeBtn.disabled = true;

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: comment }),
    });

    const data = await response.json();
    if (data.error) { alert("Error: " + data.error); return; }

    loadingOverlay.classList.add("hidden");
    showResults(data, comment);
    addToHistory(data, comment);
    updateLangBadge(data.language);
    commentBox.value = "";
    charCount.textContent = "0";

  } catch (err) {
    console.error(err);
    alert("Server error — please try again 🙏");
  } finally {
    loadingOverlay.classList.add("hidden");
    analyzeBtn.disabled = false;
  }
});

// ===== SHOW RESULTS =====
function showResults(data, originalText) {
  // Show results, hide idle
  idleState.classList.add("hidden");
  // Force re-animate by toggling hidden
  resultsContent.classList.add("hidden");
  void resultsContent.offsetWidth;
  resultsContent.classList.remove("hidden");

  const compound = data.compound ?? estimateCompound(data.sentiment);

  // Hero
  resultEmoji.textContent = data.emoji;
  resultSentiment.textContent = data.sentiment;
  resultSentiment.className = "sentiment-value " + data.sentiment;
  resultTone.textContent = "tone: " + data.tone;
  scoreBadge.textContent = (compound >= 0 ? "+" : "") + compound.toFixed(2);
  scoreBadge.style.color = compound > 0.05 ? "var(--positive)" : compound < -0.05 ? "var(--negative)" : "var(--neutral)";

  // Gauge
  gaugeScore.textContent = (compound >= 0 ? "+" : "") + compound.toFixed(2);
  drawGauge(compound);

  // Bar chart (vader scores)
  const neg = data.neg ?? 0;
  const neu = data.neu ?? 0;
  const pos = data.pos ?? 0;
  drawBarChart(neg, neu, pos);

  // Radar (emotions)
  const emotions = data.emotions ?? generateEmotionFallback(data.tone, data.sentiment);
  drawRadar(emotions);

  // Translated text
  if (data.translated_text && data.translated_text !== originalText) {
    translatedCard.style.display = "block";
    translatedText.textContent = data.translated_text;
  } else {
    translatedCard.style.display = "none";
  }
}

// ===== GAUGE CHART =====
function drawGauge(compound) {
  const ctx = document.getElementById("gaugeChart").getContext("2d");
  if (gaugeChart) gaugeChart.destroy();

  // Map compound (-1 to +1) → arc value (0 to 2)
  const normalized = (compound + 1) / 2; // 0 to 1

  const color = compound > 0.05
    ? "#A3E635"
    : compound < -0.05
    ? "#F43F5E"
    : "#FACC15";

  // Build a doughnut that looks like a semicircle gauge
  gaugeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [normalized, 1 - normalized, 1], // filled, empty, hidden bottom
        backgroundColor: [color, "rgba(255,255,255,0.06)", "transparent"],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      animation: { animateRotate: true, duration: 800, easing: "easeOutCubic" },
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

// ===== BAR CHART =====
function drawBarChart(neg, neu, pos) {
  const ctx = document.getElementById("barChart").getContext("2d");
  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Negative", "Neutral", "Positive"],
      datasets: [{
        data: [neg, neu, pos],
        backgroundColor: ["rgba(244, 63, 94, 0.75)", "rgba(250, 204, 21, 0.75)", "rgba(163, 230, 53, 0.75)"],
        borderColor: ["#F43F5E", "#FACC15", "#A3E635"],
        borderWidth: 1.5,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      animation: { duration: 700, easing: "easeOutQuart" },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#9B98B8", font: { family: "'DM Sans'", size: 12 } }
        },
        y: {
          min: 0,
          max: 1,
          grid: { color: "rgba(255,255,255,0.04)" },
          border: { display: false },
          ticks: { color: "#5A5778", font: { size: 11 }, stepSize: 0.25 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E1B35",
          borderColor: "rgba(124,58,237,0.3)",
          borderWidth: 1,
          titleColor: "#F1F0FF",
          bodyColor: "#9B98B8",
          padding: 10,
          callbacks: { label: ctx => ` Score: ${ctx.raw.toFixed(3)}` }
        }
      }
    }
  });
}

// ===== RADAR CHART =====
function drawRadar(emotions) {
  const ctx = document.getElementById("radarChart").getContext("2d");
  if (radarChart) radarChart.destroy();

  const labels = Object.keys(emotions).map(e => e.charAt(0).toUpperCase() + e.slice(1));
  const values = Object.values(emotions);

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: "rgba(124, 58, 237, 0.18)",
        borderColor: "#7C3AED",
        borderWidth: 2,
        pointBackgroundColor: "#EC4899",
        pointBorderColor: "transparent",
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      animation: { duration: 800 },
      scales: {
        r: {
          min: 0,
          grid: { color: "rgba(255,255,255,0.06)" },
          angleLines: { color: "rgba(255,255,255,0.06)" },
          pointLabels: {
            color: "#9B98B8",
            font: { family: "'DM Sans'", size: 11 }
          },
          ticks: { display: false, stepSize: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E1B35",
          borderColor: "rgba(124,58,237,0.3)",
          borderWidth: 1,
          titleColor: "#F1F0FF",
          bodyColor: "#9B98B8",
          padding: 10,
        }
      }
    }
  });
}

// ===== HISTORY =====
function addToHistory(data, text) {
  const item = { data, text, time: new Date() };
  history.unshift(item);
  if (history.length > 5) history.pop();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">your analyses will show here ✨</div>';
    return;
  }

  historyList.innerHTML = history.map((item, i) => `
    <div class="history-item" onclick="reloadHistory(${i})">
      <div class="history-emoji">${item.data.emoji}</div>
      <div class="history-info">
        <div class="history-snippet">${item.text}</div>
        <div class="history-meta">${formatTime(item.time)} · tone: ${item.data.tone}</div>
      </div>
      <div class="history-badge ${item.data.sentiment}">${item.data.sentiment}</div>
    </div>
  `).join("");
}

function reloadHistory(i) {
  showResults(history[i].data, history[i].text);
}

// ===== LANGUAGE BADGE =====
function updateLangBadge(lang) {
  const langNames = {
    en: "English", hi: "Hindi", fr: "French", de: "German",
    es: "Spanish", zh: "Chinese", ja: "Japanese", ar: "Arabic",
    pt: "Portuguese", ru: "Russian", it: "Italian", ko: "Korean"
  };
  const name = langNames[lang] || lang?.toUpperCase() || "Unknown";
  langText.textContent = `detected: ${name}`;
  langBadge.classList.add("detected");
}

// ===== HELPERS =====
function estimateCompound(sentiment) {
  if (sentiment === "Positive") return 0.6;
  if (sentiment === "Negative") return -0.6;
  return 0;
}

function generateEmotionFallback(tone, sentiment) {
  const base = { joy: 0, sadness: 0, anger: 0, fear: 0, trust: 0, surprise: 0, disgust: 0, anticipation: 0 };
  if (tone && base[tone] !== undefined) base[tone] = 3;
  if (sentiment === "Positive") { base.joy = Math.max(base.joy, 2); base.trust = 1; }
  if (sentiment === "Negative") { base.sadness = Math.max(base.sadness, 2); }
  return base;
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function shakeElement(el) {
  el.style.animation = "none";
  el.offsetWidth; // reflow
  el.style.animation = "shake 0.4s ease";
  el.style.borderColor = "var(--negative)";
  el.style.boxShadow = "0 0 0 3px rgba(244,63,94,0.15)";
  setTimeout(() => {
    el.style.animation = "";
    el.style.borderColor = "";
    el.style.boxShadow = "";
  }, 1000);
}

// Add shake animation to style
const shakeStyle = document.createElement("style");
shakeStyle.textContent = `@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}`;
document.head.appendChild(shakeStyle);

