(() => {
  "use strict";

  const subjects = [
    "MATEMÁTICA PARA LA INFORMÁTICA",
    "PROGRAMACIÓN I",
    "HARDWARE DE COMPUTADORAS",
    "TALLER DE SISTEMAS OPERATIVOS",
    "OFIMÁTICA Y TECNOLOGÍA Y MULTIMEDIA",
    "DISEÑO Y PROGRAMACIÓN WEB I",
    "ESTADÍSTICA",
    "PROGRAMACIÓN II",
    "ESTRUCTURA DE DATOS",
    "REDES DE COMPUTADORAS I",
    "PROGRAMACIÓN PARA DISPOSITIVOS MÓVILES I - II",
    "ANÁLISIS Y DISEÑO DE SISTEMAS I",
    "DISEÑO Y PROGRAMACIÓN WEB II",
    "BASE DE DATOS I",
    "GESTIÓN Y MEJORAMIENTO DE LA CALIDAD DE SOFTWARE",
    "REDES DE COMPUTADORAS II",
    "ANÁLISIS Y DISEÑO DE SISTEMAS II",
    "BASE DE DATOS II",
    "ÉTICA PROFESIONAL",
    "EMPRENDIMIENTO PRODUCTIVO",
    "TALLER DE MODALIDAD DE GRADUACIÓN"
  ];

  const progressKey = "cuestionario-sistemas-2026-progress-v1";
  const normalize = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const normalizeAnswer = (value) => normalize(value).replace(/\b(?:y|e|and)\b/g, " ").replace(/\s+/g, " ").trim();

  function getSectionType(title) {
    const normalized = normalize(title);
    if (normalized.includes("verdadero")) return "truefalse";
    if (normalized.includes("opcion multiple")) return "multiple";
    if (normalized.includes("complemento")) return "short";
    if (normalized.includes("desarrollo")) return "essay";
    return null;
  }

  function splitOptionLine(line) {
    const chunks = line.split(/\s+(?=[?*]\s+)/).map((part) => part.trim()).filter(Boolean);
    const options = [];
    for (const chunk of chunks) {
      const option = chunk
        .replace(/^[?*]\s*/, "")
        .replace(/^[a-d][).]\s*/i, "")
        .trim();
      if (option) options.push(option);
    }

    if (options.length > 1 || /^[?*]\s*/.test(line)) return options;

    const labeled = line.split(/\s+(?=[a-d][).]\s)/i).map((part) => part.trim());
    if (labeled.length > 1 || /^[a-d][).]\s/i.test(line)) {
      return labeled
        .map((part) => part.replace(/^[a-d][).]\s*/i, "").trim())
        .filter(Boolean);
    }

    return null;
  }

  function parseQuestions(rawText) {
    if (typeof rawText !== "string" || !rawText.trim()) {
      throw new Error("No se encontró el texto del cuestionario.");
    }

    const subjectMap = new Map(subjects.map((subject) => [normalize(subject), subject]));
    const questions = [];
    let subject = "";
    let section = null;
    let current = null;
    let ethicsSectionSeen = false;
    let skipCurrentSubject = false;

    function finishQuestion() {
      if (!current) return;
      current.prompt = current.prompt.replace(/\s+/g, " ").trim();
      if (current.subject === "ÉTICA PROFESIONAL") {
        current.prompt = current.prompt
          .replace(/\s+ÁMBITO\s+(?:SOCIAL|PROFESIONAL|PERSONAL):\s*$/i, "")
          .replace(/\?\s+\.$/, "?");
      }
      current.options = [...new Set(current.options.map((option) => option.trim()).filter(Boolean))];
      if (current.prompt) {
        current.id = `${questions.length}-${normalize(current.subject)}-${normalize(current.section)}-${normalize(current.prompt).slice(0, 72)}`;
        questions.push(current);
      }
      current = null;
    }

    function finishSection() {
      finishQuestion();
      section = null;
    }

    const lines = rawText
      .replace(/^\uFEFF/, "")
      .replace(/([^\r\n])\s+((?:I{1,3}|IV)\s*\.?\s*-?\s*PREGUNTAS\s+DE)/gi, "$1\n$2")
      .replace(/(Falso)\s+(?=\d{1,2}\s*[-.)]\s)/gi, "$1\n")
      .replace(/([^\r\n])\s+(?=\d{1,2}\s*(?:\.\s*-?|-|\))\s*(?:¿|\p{Lu}))/gu, "$1\n")
      .split(/\r\n|\n|\r/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const matchedSubject = subjectMap.get(normalize(line));
      if (matchedSubject) {
        finishSection();
        subject = matchedSubject;
        skipCurrentSubject = false;
        if (matchedSubject === "ÉTICA PROFESIONAL") {
          skipCurrentSubject = ethicsSectionSeen;
          ethicsSectionSeen = true;
          section = { title: "Preguntas abiertas", type: "essay" };
        } else if (matchedSubject === "EMPRENDIMIENTO PRODUCTIVO") {
          section = { title: "Cuestionario de emprendimiento", type: "multiple" };
        }
        continue;
      }

      if (skipCurrentSubject) continue;
      if (/^PREGUNTAS\s*:?$/i.test(line) && subject === "ÉTICA PROFESIONAL") continue;
      const sectionMatch = line.match(/^[IVXLCDM]+\s*\.?\s*-?\s*PREGUNTAS\s+DE\s+(.+)$/i);
      if (sectionMatch) {
        finishSection();
        const type = getSectionType(sectionMatch[1]);
        section = type ? { title: sectionMatch[1].trim(), type } : null;
        continue;
      }
      if (!section || !subject) continue;

      const questionMatch = line.match(/^(\d{1,2})\s*(?:\.\s*-?|-|\))\s*(.*)$/);
      if (questionMatch) {
        finishQuestion();
        const prompt = questionMatch[2].trim();
        if (section.type === "essay" && (prompt.startsWith("**") || (prompt.length > 10 && prompt === prompt.toLocaleUpperCase("es")))) continue;
        current = {
          subject,
          section: section.title,
          type: section.type,
          number: Number(questionMatch[1]),
          prompt: "",
          options: [],
          answer: ""
        };
        if (prompt) addQuestionLine(prompt);
        continue;
      }

      if (current) addQuestionLine(line);
    }
    finishSection();
    questions.push(...parsePracticeQuestions(rawText));
    return questions;

    function addQuestionLine(line) {
      const answerMatch = line.match(/^Respuesta\s*:\s*(.+)$/i);
      if (answerMatch) {
        current.answer = answerMatch[1].trim();
        return;
      }

      if (current.type === "multiple") {
        const inlineChoices = line.match(/\s+(?:[?*]\s+|[a-d][).]\s+)/i);
        if (inlineChoices && inlineChoices.index > 0) {
          const prompt = line.slice(0, inlineChoices.index).trim();
          const optionText = line.slice(inlineChoices.index).trim();
          if (prompt) current.prompt += `${current.prompt ? " " : ""}${prompt}`;
          const options = splitOptionLine(optionText);
          if (options) {
            current.options.push(...options);
            return;
          }
        }
        const options = splitOptionLine(line);
        if (options) {
          current.options.push(...options);
          return;
        }
      }

      if (current.type === "truefalse" && /^(?:[?*]\s*)?(?:Verdadero|Falso)\b/i.test(line)) return;
      current.prompt += `${current.prompt ? " " : ""}${line}`;
    }
  }

  function parsePracticeQuestions(rawText) {
    const questions = [];
    let category = "";
    let current = null;
    let inExercises = false;

    function finishQuestion() {
      if (!current) return;
      current.prompt = current.prompt.replace(/\s+/g, " ").trim();
      current.id = `practice-${normalize(current.section)}-${current.number}-${normalize(current.prompt).slice(0, 72)}`;
      if (current.prompt) questions.push(current);
      current = null;
    }

    const lines = rawText.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const categoryMatch = line.match(/^\d+\.\s+(.+)$/);
      if (categoryMatch && categoryMatch[1] === categoryMatch[1].toLocaleUpperCase("es") &&
        normalize(categoryMatch[1]).includes("fundamentos del analisis de sistemas")) {
        inExercises = true;
      }

      if (!inExercises) continue;

      const matchedSubject = normalize(line);
      if (subjects.some((name) => normalize(name) === matchedSubject) &&
        matchedSubject !== normalize("ANÁLISIS Y DISEÑO DE SISTEMAS I")) {
        finishQuestion();
        break;
      }

      if (categoryMatch && categoryMatch[1] === categoryMatch[1].toLocaleUpperCase("es")) {
        finishQuestion();
        category = categoryMatch[1].trim();
        continue;
      }

      const exerciseMatch = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/);
      if (exerciseMatch) {
        finishQuestion();
        current = {
          subject: "ANÁLISIS Y DISEÑO DE SISTEMAS I",
          section: `Ejercicios prácticos · ${category}`,
          type: "practice",
          number: Number(exerciseMatch[1]),
          prompt: exerciseMatch[2].trim(),
          options: [],
          answer: ""
        };
        if (exerciseMatch[3]) current.prompt += `: ${exerciseMatch[3].trim()}`;
        continue;
      }

      if (current && line.startsWith("-")) {
        current.prompt += `: ${line.replace(/^-\s*/, "").trim()}`;
      } else if (current && /^(?:Guía|Ejemplo|Respuesta|Por qué|Estos ejercicios)\s*:?/i.test(line)) {
        finishQuestion();
      }
    }

    finishQuestion();
    return questions;
  }

  const elements = {
    setupScreen: document.querySelector("#setup-screen"),
    subjectSelect: document.querySelector("#subject-select"),
    lengthSelect: document.querySelector("#length-select"),
    shuffleToggle: document.querySelector("#shuffle-toggle"),
    selectionSummary: document.querySelector("#selection-summary"),
    startButton: document.querySelector("#start-button"),
    quizScreen: document.querySelector("#quiz-screen"),
    exitButton: document.querySelector("#exit-button"),
    sessionSubject: document.querySelector("#session-subject"),
    questionCounter: document.querySelector("#question-counter"),
    progressPercent: document.querySelector("#progress-percent"),
    progressTrack: document.querySelector(".progress-track[role='progressbar']"),
    sessionProgress: document.querySelector("#session-progress"),
    questionType: document.querySelector("#question-type"),
    questionNumber: document.querySelector("#question-number"),
    questionPrompt: document.querySelector("#question-prompt"),
    answerArea: document.querySelector("#answer-area"),
    feedback: document.querySelector("#feedback"),
    checkButton: document.querySelector("#check-button"),
    selfGrade: document.querySelector("#self-grade"),
    markCorrect: document.querySelector("#mark-correct"),
    markReview: document.querySelector("#mark-review"),
    lockedHint: document.querySelector("#locked-hint"),
    resultScreen: document.querySelector("#result-screen"),
    resultSummary: document.querySelector("#result-summary"),
    scorePercent: document.querySelector("#score-percent"),
    scoreFraction: document.querySelector("#score-fraction"),
    correctCount: document.querySelector("#correct-count"),
    reviewCount: document.querySelector("#review-count"),
    finishedCount: document.querySelector("#finished-count"),
    restartButton: document.querySelector("#restart-button")
  };

  let allQuestions;
  try {
    allQuestions = parseQuestions(window.PDF_QUESTIONS_TEXT);
  } catch (error) {
    elements.selectionSummary.textContent = `No se pudieron cargar las preguntas: ${error.message}`;
    elements.startButton.disabled = true;
    return;
  }

  const responses = new Map();
  const sessionResults = new Map();
  let currentQuestions = [];
  let currentIndex = 0;
  let answerChecked = false;
  let selfAssessmentPending = false;

  allQuestions.forEach((question) => {
    const answerKey = window.PDF_ANSWER_KEY?.[question.id];
    if (answerKey) Object.assign(question, answerKey);
  });

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    elements.subjectSelect.append(option);
  });

  function getAvailableQuestions() {
    const subject = elements.subjectSelect.value;
    return subject === "GENERAL"
      ? [...allQuestions]
      : allQuestions.filter((question) => question.subject === subject);
  }

  function getSessionLength(availableCount) {
    const requested = elements.lengthSelect.value;
    return requested === "all" ? availableCount : Math.min(Number(requested), availableCount);
  }

  function updateSelectionSummary() {
    const availableCount = getAvailableQuestions().length;
    const sessionLength = getSessionLength(availableCount);
    const label = sessionLength === availableCount
      ? `${availableCount} ${availableCount === 1 ? "pregunta disponible" : "preguntas disponibles"}`
      : `${sessionLength} de ${availableCount} preguntas`;
    elements.selectionSummary.textContent = `${label} · ${subjects.length} materias para elegir.`;
    elements.startButton.disabled = availableCount === 0;
  }

  function startSession() {
    const available = getAvailableQuestions();
    const sessionLength = getSessionLength(available.length);
    if (!sessionLength) {
      updateSelectionSummary();
      return;
    }

    currentQuestions = available;
    if (elements.shuffleToggle.checked) {
      for (let index = currentQuestions.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [currentQuestions[index], currentQuestions[randomIndex]] = [currentQuestions[randomIndex], currentQuestions[index]];
      }
    }
    currentQuestions = currentQuestions.slice(0, sessionLength);
    currentIndex = 0;
    sessionResults.clear();
    responses.clear();
    answerChecked = false;
    selfAssessmentPending = false;
    elements.sessionSubject.textContent = elements.subjectSelect.value === "GENERAL"
      ? "MODO GENERAL"
      : elements.subjectSelect.value;
    elements.setupScreen.hidden = true;
    elements.resultScreen.hidden = true;
    elements.quizScreen.hidden = false;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderQuestion() {
    const question = currentQuestions[currentIndex];
    if (!question) {
      showResults();
      return;
    }

    answerChecked = false;
    selfAssessmentPending = false;
    elements.feedback.hidden = true;
    elements.feedback.classList.remove("is-correct");
    elements.selfGrade.hidden = true;
    elements.answerArea.replaceChildren();
    elements.questionCounter.textContent = `Pregunta ${currentIndex + 1} de ${currentQuestions.length}`;
    elements.questionNumber.textContent = String(question.number).padStart(2, "0");
    elements.questionType.textContent = typeLabel(question.type);
    elements.questionPrompt.textContent = question.prompt;

    updateSessionProgress();
    elements.checkButton.textContent = "Comprobar respuesta";
    elements.checkButton.disabled = false;
    elements.lockedHint.hidden = false;

    if (question.type === "multiple" && question.options.length) {
      renderOptions(question, question.options);
    } else if (question.type === "truefalse") {
      renderOptions(question, ["Verdadero", "Falso"]);
    } else {
      const textarea = document.createElement("textarea");
      textarea.className = "answer-text";
      textarea.placeholder = question.type === "essay" || question.type === "practice"
        ? "Escribe tu respuesta con tus propias palabras…"
        : "Escribe tu respuesta…";
      textarea.setAttribute("aria-label", "Tu respuesta");
      textarea.autocomplete = "off";
      textarea.addEventListener("input", () => {
        responses.set(question.id, textarea.value);
        elements.checkButton.disabled = !textarea.value.trim();
      });
      elements.answerArea.append(textarea);
      elements.checkButton.disabled = true;
    }
  }

  function renderOptions(question, options) {
    const list = document.createElement("div");
    list.className = "answer-options";
    options.forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "answer-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `answer-${question.id}`;
      const value = question.type === "truefalse" ? option : index;
      input.value = String(value);
      input.addEventListener("change", () => {
        responses.set(question.id, value);
        list.querySelectorAll(".answer-option").forEach((item) => item.classList.remove("selected"));
        label.classList.add("selected");
        elements.checkButton.disabled = false;
      });
      label.append(input, document.createTextNode(option));
      list.append(label);
    });
    elements.answerArea.append(list);
    elements.checkButton.disabled = true;
  }

  function typeLabel(type) {
    return {
      truefalse: "Verdadero o falso",
      multiple: "Opción múltiple",
      short: "Completa la frase",
      essay: "Pregunta de desarrollo",
      practice: "Ejercicio práctico"
    }[type] || "Pregunta";
  }

  function showFeedback(message, heading, isCorrect = false) {
    elements.feedback.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = heading;
    elements.feedback.append(title, document.createTextNode(message));
    elements.feedback.classList.toggle("is-correct", isCorrect);
    elements.feedback.hidden = false;
  }

  function checkAnswer() {
    const question = currentQuestions[currentIndex];
    if (!question) return;

    if (answerChecked && !selfAssessmentPending) {
      moveNext();
      return;
    }

    const response = responses.get(question.id);
    if (response === undefined || (typeof response === "string" && !response.trim())) {
      showFeedback("Responde esta pregunta antes de continuar.", "FALTA TU RESPUESTA");
      return;
    }

    if (question.autoCheck) {
      let matched = false;
      if (question.type === "multiple") {
        matched = response === question.choiceIndex;
      } else {
        const answerNormalizer = question.type === "short" ? normalizeAnswer : normalize;
        const actual = answerNormalizer(String(response));
        const expected = answerNormalizer(question.answer);
        matched = actual === expected || (actual.length >= 3 && (actual.includes(expected) || expected.includes(actual)));
      }
      const answerLabel = question.type === "multiple"
        ? question.options[question.choiceIndex]
        : question.answer;
      showFeedback(
        matched
          ? `¡Correcto! Respuesta: ${answerLabel}.${question.explanation ? ` ${question.explanation}` : ""}`
          : `La respuesta correcta es: ${answerLabel}.${question.explanation ? ` ${question.explanation}` : ""}`,
        matched ? "¡BIEN HECHO!" : "SIGUE PRACTICANDO",
        matched
      );
      sessionResults.set(question.id, matched ? "correct" : "review");
      answerChecked = true;
      disableAnswerControls();
      updateSessionProgress();
      elements.checkButton.textContent = currentIndex === currentQuestions.length - 1 ? "Ver mi resultado" : "Siguiente pregunta";
      elements.lockedHint.hidden = true;
      saveProgress(question, matched ? "correct" : "review");
      return;
    }

    if (question.reference) {
      showFeedback(
        `${question.reference}${question.explanation ? ` Método o explicación: ${question.explanation}` : ""} Compara tu respuesta con esta referencia.`,
        "RESPUESTA DE REFERENCIA"
      );
    } else {
      showFeedback(
        "No hay una respuesta modelo disponible. Compara tu respuesta con tus apuntes y evalúate.",
        "AUTOEVALUACIÓN"
      );
    }
    answerChecked = true;
    selfAssessmentPending = true;
    disableAnswerControls();
    elements.selfGrade.hidden = false;
    elements.checkButton.disabled = true;
    elements.lockedHint.textContent = "Marca cómo te fue para desbloquear la siguiente pregunta.";
  }

  function markQuestion(status) {
    const question = currentQuestions[currentIndex];
    if (!question || !selfAssessmentPending) return;
    sessionResults.set(question.id, status);
    selfAssessmentPending = false;
    elements.selfGrade.hidden = true;
    updateSessionProgress();
    elements.checkButton.disabled = false;
    elements.checkButton.textContent = currentIndex === currentQuestions.length - 1 ? "Ver mi resultado" : "Siguiente pregunta";
    elements.lockedHint.hidden = true;
    showFeedback(
      status === "correct" ? "La marcaste como acertada." : "La guardamos para repasarla después.",
      "AUTOEVALUACIÓN GUARDADA",
      status === "correct"
    );
    saveProgress(question, status);
  }

  function disableAnswerControls() {
    elements.answerArea.querySelectorAll("input, textarea").forEach((control) => {
      control.disabled = true;
    });
  }

  function updateSessionProgress() {
    const percent = Math.round((sessionResults.size / currentQuestions.length) * 100);
    elements.progressPercent.textContent = `${percent}%`;
    elements.sessionProgress.style.width = `${percent}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(percent));
  }

  function saveProgress(question, status) {
    let progress = {};
    try {
      progress = JSON.parse(localStorage.getItem(progressKey) || "{}");
      progress[question.id] = status;
      localStorage.setItem(progressKey, JSON.stringify(progress));
    } catch (error) {
      console.error("No se pudo guardar el progreso.", error);
    }
  }

  function moveNext() {
    if (sessionResults.size < currentIndex + 1) return;
    if (currentIndex === currentQuestions.length - 1) {
      showResults();
      return;
    }
    currentIndex += 1;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showResults() {
    const total = currentQuestions.length;
    const correct = [...sessionResults.values()].filter((status) => status === "correct").length;
    const review = total - correct;
    const score = total ? Math.round((correct / total) * 100) : 0;
    elements.quizScreen.hidden = true;
    elements.resultScreen.hidden = false;
    elements.correctCount.textContent = String(correct);
    elements.reviewCount.textContent = String(review);
    elements.finishedCount.textContent = String(total);
    elements.scorePercent.textContent = `${score}%`;
    elements.scoreFraction.textContent = `${correct} / ${total} correctas`;
    elements.resultSummary.textContent = `${elements.sessionSubject.textContent === "MODO GENERAL" ? "Modo general" : elements.sessionSubject.textContent} · ${total} preguntas completadas.`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function returnToSetup() {
    elements.quizScreen.hidden = true;
    elements.resultScreen.hidden = true;
    elements.setupScreen.hidden = false;
    updateSelectionSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  elements.subjectSelect.addEventListener("change", updateSelectionSummary);
  elements.lengthSelect.addEventListener("change", updateSelectionSummary);
  elements.startButton.addEventListener("click", startSession);
  elements.checkButton.addEventListener("click", checkAnswer);
  elements.markCorrect.addEventListener("click", () => markQuestion("correct"));
  elements.markReview.addEventListener("click", () => markQuestion("review"));
  elements.exitButton.addEventListener("click", returnToSetup);
  elements.restartButton.addEventListener("click", returnToSetup);

  updateSelectionSummary();
})();
