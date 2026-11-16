// VIRTUAL POLARIMETER LABORATORY - EXPERIMENT NO. 07
// APPLIED PHYSICS LABORATORY | MAIT

(function () {
    // --- STATE VARIABLES ---
    let currentAngle = 0.0;           // Analyzer angle in degrees (0 - 360°)
    let currentMedium = "water";       // "water" | "sugar" | "unknown"
    let isWaterMedium = true;          // true: Distilled Water, false: Cane Sugar / Unknown
    let currentConcentration = 10;     // 5, 10, 15 (g/100 cc)
    let tubeLength = 2.0;              // dm (standard polarimeter tube = 2 dm = 20 cm)
    const STANDARD_S = 66.50;          // Standard specific rotation of cane sugar (° dm^-1 (g/cc)^-1 at 20°C)
    const LEAST_COUNT = 0.05;          // Vernier least count = 0.05° (1 MSD = 0.5°, 10 VSD)
    let isDraggingDial = false;
    let chartInstance = null;
    let activeRowIndex = 2;            // 1, 2, or 3 (defaults to 2 for 10 g/100 cc)
    let settingErrors = {};            // Stored human setting errors for each experimental condition

    // Unknown Solution Challenge State (hidden concentration stored only in JS variable)
    let unknownConcentration = null;   // Random concentration between 3 and 18 g/100 cc (0.5 steps, never 5, 10, 15)
    let unknownCW = null;              // Recorded a'u reading
    let unknownCCW = null;             // Recorded b'u reading
    let challengeSubmission = null;    // Stored results if user submitted the unknown challenge

    // Report Generation State
    let isSampleDataLoaded = false;    // Tracks if table is populated with sample data without user modification

    // Helper: Generate candidate concentrations for Unknown Solution Challenge
    function generateUnknownConcentration() {
        const candidates = [];
        for (let c = 3.0; c <= 18.0; c += 0.5) {
            const val = parseFloat(c.toFixed(1));
            if (val !== 5.0 && val !== 10.0 && val !== 15.0) {
                candidates.push(val);
            }
        }
        const idx = Math.floor(Math.random() * candidates.length);
        return candidates[idx];
    }

    // Helper: Normalize concentration input (supports both 5, 10, 15 g/100 cc and 0.05, 0.10, 0.15 g/cc)
    function getEffectiveConcentration(c) {
        if (c >= 1.0) {
            return c / 100.0;
        }
        return c;
    }

    // Helper: Circular distance between two angles (0-360)
    function circularDist(a, b) {
        const diff = Math.abs(a - b) % 360;
        return diff > 180 ? 360 - diff : diff;
    }

    // Helper: Signed angular difference (aPrime - a) handling 360° wrap-around
    function angularDiffSigned(aPrime, a) {
        let diff = (aPrime - a) % 360;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return parseFloat(diff.toFixed(4));
    }

    // --- REALISTIC READING SCATTER: HUMAN SETTING ERROR ---
    // Generates bell-curve-like error (std dev 0.05°, strictly bounded within ±0.15°)
    function generateSettingError() {
        while (true) {
            let u1 = 0, u2 = 0;
            while (u1 === 0) u1 = Math.random();
            while (u2 === 0) u2 = Math.random();
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            const err = z0 * 0.05;
            if (err >= -0.15 && err <= 0.15) {
                return parseFloat(err.toFixed(4));
            }
        }
    }

    function getSettingError(mediumKey, concVal, lengthVal, nullIndex) {
        const cStr = mediumKey === "water" ? "0" : parseFloat(concVal).toFixed(2);
        const lStr = parseFloat(lengthVal).toFixed(2);
        const key = `${mediumKey}_c${cStr}_l${lStr}_null${nullIndex}`;
        if (!Object.prototype.hasOwnProperty.call(settingErrors, key)) {
            settingErrors[key] = generateSettingError();
        }
        return settingErrors[key];
    }

    function getEffectiveNullPositions() {
        let thetaOpt = 0.0;
        let med = "water";
        let c = 0;

        if (currentMedium === "water") {
            med = "water";
            c = 0;
            thetaOpt = 0.0;
        } else if (currentMedium === "sugar") {
            med = "sugar";
            c = currentConcentration;
            const cEff = getEffectiveConcentration(currentConcentration);
            thetaOpt = STANDARD_S * tubeLength * cEff;
        } else if (currentMedium === "unknown") {
            med = "unknown";
            c = unknownConcentration !== null ? unknownConcentration : 10;
            const cEff = getEffectiveConcentration(c);
            thetaOpt = STANDARD_S * tubeLength * cEff;
        }

        const err1 = getSettingError(med, c, tubeLength, 1);
        const err2 = getSettingError(med, c, tubeLength, 2);

        const n1 = (((thetaOpt + err1) % 360) + 360) % 360;
        const n2 = (((thetaOpt + 180 + err2) % 360) + 360) % 360;

        return { thetaOpt, err1, err2, n1, n2 };
    }

    // --- DOM REFERENCES ---
    const rotatableAnalyzer = document.getElementById("rotatableAnalyzer");
    const analyzerSymbol = document.getElementById("analyzerSymbol");
    const mainScaleTicks = document.getElementById("mainScaleTicks");
    const vernierScaleTicks = document.getElementById("vernierScaleTicks");
    const dialContainer = document.getElementById("dialContainer");
    const polarimeterSvg = document.getElementById("polarimeterSvg");

    const msrDisplay = document.getElementById("msrDisplay");
    const vsrDisplay = document.getElementById("vsrDisplay");
    const totalAngleDisplay = document.getElementById("totalAngleDisplay");

    const leftHalf = document.getElementById("leftHalf");
    const rightHalf = document.getElementById("rightHalf");
    const leftIntensityVal = document.getElementById("leftIntensityVal");
    const rightIntensityVal = document.getElementById("rightIntensityVal");
    const nullBadge = document.getElementById("nullBadge");
    const brightnessStatus = document.getElementById("brightnessStatus");
    const observationText = document.getElementById("observation");

    const btnMediumWater = document.getElementById("btnMediumWater");
    const btnMediumSugar = document.getElementById("btnMediumSugar");
    const btnMediumUnknown = document.getElementById("btnMediumUnknown");
    const sugarParams = document.getElementById("sugarParams");
    const sugarConcentrationInput = document.getElementById("sugarConcentration");
    const simTubeLengthInput = document.getElementById("simTubeLength");
    const presetButtons = document.querySelectorAll(".preset-btn");

    const btnRecordUnknownCW = document.getElementById("btnRecordUnknownCW");
    const btnRecordUnknownCCW = document.getElementById("btnRecordUnknownCCW");
    const btnStartChallenge = document.getElementById("btnStartChallenge");
    const btnNewChallenge = document.getElementById("btnNewChallenge");
    const btnRevealAnswer = document.getElementById("btnRevealAnswer");
    const btnSubmitChallenge = document.getElementById("btnSubmitChallenge");
    const chEstimatedConc = document.getElementById("chEstimatedConc");

    const recordedBadge = document.getElementById("recordedBadge");
    const calculateButton = document.getElementById("calculateButton");
    const btnSampleData = document.getElementById("btnSampleData");
    const resetCalculation = document.getElementById("resetCalculation");
    const resetAnalyzer = document.getElementById("resetAnalyzer");
    const btnFindNull = document.getElementById("btnFindNull");

    // --- 1. GENERATE FIXED MAIN SCALE GRADUATIONS (0° to 360°) ---
    function generateMainScale() {
        if (!mainScaleTicks) return;
        mainScaleTicks.innerHTML = "";
        const cx = 160, cy = 160;
        const rOuter = 148;

        for (let deg = 0; deg < 360; deg += 0.5) {
            const rad = ((deg - 90) * Math.PI) / 180;
            const isMajor = deg % 10 === 0;
            const isMedium = deg % 5 === 0 && !isMajor;
            const isDegree = deg % 1 === 0 && !isMedium && !isMajor;

            let tickLen = 4;
            let strokeColor = "#37597b";
            let strokeWidth = 1;

            if (isMajor) {
                tickLen = 14;
                strokeColor = "#93c5ec";
                strokeWidth = 1.6;
            } else if (isMedium) {
                tickLen = 9;
                strokeColor = "#6297c4";
                strokeWidth = 1.2;
            } else if (isDegree) {
                tickLen = 6;
                strokeColor = "#446e96";
                strokeWidth = 1;
            }

            const x1 = cx + rOuter * Math.cos(rad);
            const y1 = cy + rOuter * Math.sin(rad);
            const x2 = cx + (rOuter - tickLen) * Math.cos(rad);
            const y2 = cy + (rOuter - tickLen) * Math.sin(rad);

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("stroke", strokeColor);
            line.setAttribute("stroke-width", strokeWidth);
            mainScaleTicks.appendChild(line);

            // Add Degree numbers every 30°
            if (deg % 30 === 0) {
                const textR = rOuter - 22;
                const tx = cx + textR * Math.cos(rad);
                const ty = cy + textR * Math.sin(rad) + 3.5;

                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", tx);
                text.setAttribute("y", ty);
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("fill", "#bcdbf4");
                text.setAttribute("font-size", "8.5");
                text.setAttribute("font-family", "Arial, sans-serif");
                text.setAttribute("font-weight", "bold");
                text.textContent = deg + "°";
                mainScaleTicks.appendChild(text);
            }
        }
    }

    // --- 2. GENERATE ROTATING VERNIER SCALE (10 divisions spanning 9 MSD = 4.5°) ---
    function generateVernierScale() {
        if (!vernierScaleTicks) return;
        vernierScaleTicks.innerHTML = "";
        const cx = 160, cy = 160;
        const rInner = 106;
        // 10 Vernier Divisions span 9 Main Scale Divisions (9 * 0.5° = 4.5°)
        // Each Vernier division = 4.5° / 10 = 0.45°
        const vernierDivisionAngle = 0.45;

        for (let i = 0; i <= 10; i++) {
            const vAngle = i * vernierDivisionAngle;
            // The Vernier scale starts at top 0-mark (-90° in standard SVG coords)
            const rad = ((vAngle - 90) * Math.PI) / 180;
            const isEndOrMid = i === 0 || i === 5 || i === 10;
            const tickLen = isEndOrMid ? 11 : 7;
            const strokeColor = isEndOrMid ? "#ffdd53" : "#68d2f7";
            const strokeWidth = isEndOrMid ? 1.5 : 1;

            const x1 = cx + rInner * Math.cos(rad);
            const y1 = cy + rInner * Math.sin(rad);
            const x2 = cx + (rInner - tickLen) * Math.cos(rad);
            const y2 = cy + (rInner - tickLen) * Math.sin(rad);

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("stroke", strokeColor);
            line.setAttribute("stroke-width", strokeWidth);
            vernierScaleTicks.appendChild(line);

            if (isEndOrMid) {
                const textR = rInner - 17;
                // Offset "0" label slightly so it does not overlap the needle pointer
                const labelAngle = (i === 0) ? -1.0 : vAngle;
                const labelRad = ((labelAngle - 90) * Math.PI) / 180;
                const tx = cx + textR * Math.cos(labelRad);
                const ty = cy + textR * Math.sin(labelRad) + 3;

                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", tx);
                text.setAttribute("y", ty);
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("fill", "#ffdd53");
                text.setAttribute("font-size", "7.5");
                text.setAttribute("font-weight", "bold");
                text.textContent = i;
                vernierScaleTicks.appendChild(text);
            }
        }
    }

    // --- 3. COMPUTE VERNIER & MAIN SCALE READINGS WITH VSR CARRY-OVER ---
    function calculateScaleReadings(angle) {
        // Normalize angle to [0, 360)
        let normalized = ((angle % 360) + 360) % 360;

        // 1 Main Scale Division (M.S.D) = 0.5°
        let msr = Math.floor(normalized / 0.5) * 0.5;
        const remainder = normalized - msr;

        // Least Count = 0.05°
        let vsr = Math.round(remainder / LEAST_COUNT);
        // When vernier reading rounds up to 10, carry it over to main scale (+0.5°)
        if (vsr >= 10) {
            vsr = 0;
            msr += 0.5;
            if (msr >= 360) {
                msr -= 360;
            }
        }

        const totalReading = (msr + vsr * LEAST_COUNT) % 360;

        return {
            msr: msr,
            vsr: vsr,
            total: totalReading,
            rawAngle: normalized
        };
    }

    // --- 4. OPTICAL PHYSICS: HALF-SHADE FIELD & SENSITIVE NULL POSITION ---
    function updateTelescopeView(readings) {
        const { n1, n2 } = getEffectiveNullPositions();

        // Relative analyzer angle compared to nearest effective null position (including setting error)
        const currentTotal = readings.total;
        const d1 = angularDiffSigned(currentTotal, n1);
        const d2 = angularDiffSigned(currentTotal, n2);
        const delta = Math.abs(d1) <= Math.abs(d2) ? d1 : d2;

        // Half-shade angle alpha (~2.5° half angle)
        const alpha = 2.5;
        const deltaRad = (delta * Math.PI) / 180;
        const alphaRad = (alpha * Math.PI) / 180;

        // Transmitted intensity through each half
        const iLeft = Math.sin(deltaRad - alphaRad) ** 2;
        const iRight = Math.sin(deltaRad + alphaRad) ** 2;

        const scaleIntensity = (i) => Math.min(1, Math.max(0, 0.08 + Math.sqrt(i) * 0.92));
        const lumLeft = scaleIntensity(iLeft);
        const lumRight = scaleIntensity(iRight);

        function getFieldColor(lum) {
            const r = Math.round(18 + lum * 225);
            const g = Math.round(24 + lum * 195);
            const b = Math.round(36 + lum * 70);
            return `rgb(${r}, ${g}, ${b})`;
        }

        leftHalf.style.backgroundColor = getFieldColor(lumLeft);
        rightHalf.style.backgroundColor = getFieldColor(lumRight);

        leftIntensityVal.textContent = Math.round(lumLeft * 100) + "%";
        rightIntensityVal.textContent = Math.round(lumRight * 100) + "%";

        // Sensitive Null Position (equally dark within ±0.20°)
        const isNullPosition = Math.abs(delta) <= 0.20;

        if (isNullPosition) {
            nullBadge.classList.add("equal-dark");
            brightnessStatus.textContent = "✦ Equal Darkness Position (Sensitive Null)";
            brightnessStatus.style.color = "#39dba0";
            observationText.innerHTML = `<b>Equal darkness observed!</b> Both halves are equally dim/dark. This is the precise observation point for recording (θ = ${currentTotal.toFixed(2)}°).`;
        } else if (delta < 0) {
            nullBadge.classList.remove("equal-dark");
            brightnessStatus.textContent = "Left Half Brighter / Right Darker";
            brightnessStatus.style.color = "#ffdd53";
            observationText.innerHTML = "Left half is brighter than the right half. Rotate the analyzer clockwise (positive) to reach the equally dark position.";
        } else {
            nullBadge.classList.remove("equal-dark");
            brightnessStatus.textContent = "Right Half Brighter / Left Darker";
            brightnessStatus.style.color = "#ffdd53";
            observationText.innerHTML = "Right half is brighter than the left half. Rotate the analyzer anti-clockwise (negative) to reach the equally dark position.";
        }
    }

    // --- 5. UPDATE FULL SIMULATION ---
    function updateSimulation() {
        const readings = calculateScaleReadings(currentAngle);

        // Update SVG Dial rotation
        if (rotatableAnalyzer) {
            rotatableAnalyzer.setAttribute("transform", `rotate(${readings.rawAngle}, 160, 160)`);
        }

        // Update Optical arrangement analyzer symbol
        if (analyzerSymbol) {
            analyzerSymbol.style.transform = `rotate(${readings.rawAngle}deg)`;
        }

        // Update Digital Vernier Readout
        msrDisplay.textContent = readings.msr.toFixed(1) + "°";
        vsrDisplay.textContent = `${readings.vsr} × 0.05°`;
        totalAngleDisplay.textContent = readings.total.toFixed(2) + "°";

        // Update accessibility attributes on dial slider
        if (dialContainer) {
            dialContainer.setAttribute("aria-valuenow", readings.total.toFixed(2));
        }

        // Update Telescope view
        updateTelescopeView(readings);
    }

    // --- 6. INTERACTIVE SVG DIAL CONTROLS (POINTER EVENTS, WHEEL & KEYBOARD) ---
    function getPointerAngle(e) {
        const rect = polarimeterSvg.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let clientX = e.clientX;
        let clientY = e.clientY;

        // Fix: correctly handle clientX = 0 without treating it as falsy
        if (typeof clientX !== "number" && e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        const rad = Math.atan2(clientY - centerY, clientX - centerX);
        let deg = (rad * 180) / Math.PI + 90;
        deg = ((deg % 360) + 360) % 360;
        return deg;
    }

    let lastPointerAngle = 0;
    let accumulatedAngle = 0;

    function onDialPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return; // Primary button only
        isDraggingDial = true;
        lastPointerAngle = getPointerAngle(e);
        accumulatedAngle = currentAngle;

        if (dialContainer) {
            dialContainer.classList.add("dragging");
            if (dialContainer.setPointerCapture) {
                try {
                    dialContainer.setPointerCapture(e.pointerId);
                } catch (_) {}
            }
        }
        e.preventDefault();
    }

    function onDialPointerMove(e) {
        if (!isDraggingDial) return;
        const ptrAngle = getPointerAngle(e);

        // Relative dragging: rotate by change in pointer angle only
        let diff = angularDiffSigned(ptrAngle, lastPointerAngle);

        // Slow-drag mode: while Shift is held, rotate at 10% speed
        if (e.shiftKey) {
            diff *= 0.1;
        }

        accumulatedAngle += diff;
        lastPointerAngle = ptrAngle;

        // Snapping: round to 0.05° (vernier least count)
        const normalized = ((accumulatedAngle % 360) + 360) % 360;
        currentAngle = parseFloat((Math.round(normalized / LEAST_COUNT) * LEAST_COUNT).toFixed(2));
        updateSimulation();
        e.preventDefault();
    }

    function onDialPointerUp(e) {
        if (!isDraggingDial) return;
        isDraggingDial = false;
        if (dialContainer) {
            dialContainer.classList.remove("dragging");
            if (dialContainer.releasePointerCapture && e && e.pointerId) {
                try {
                    dialContainer.releasePointerCapture(e.pointerId);
                } catch (_) {}
            }
        }
    }

    // Mouse wheel over the dial: 1° per notch; Shift+wheel = 0.05°; Alt+wheel = 5°. Scroll up = clockwise (+).
    function onDialWheel(e) {
        e.preventDefault(); // Prevent default scroll strictly when over dial

        // Handle Shift+wheel turning into deltaX in some browsers
        const deltaVal = (e.deltaY !== 0 ? e.deltaY : e.deltaX);
        if (!deltaVal) return;

        const direction = deltaVal < 0 ? 1 : -1;

        let step = 1.0;
        if (e.altKey) {
            step = 5.0;
        } else if (e.shiftKey) {
            step = 0.05;
        }

        const change = direction * step;
        const newAngle = ((currentAngle + change) % 360 + 360) % 360;
        currentAngle = parseFloat((Math.round(newAngle / LEAST_COUNT) * LEAST_COUNT).toFixed(2));
        accumulatedAngle = currentAngle;
        updateSimulation();
    }

    // Keyboard accessibility for slider dial
    function onDialKeyDown(e) {
        let step = 0;
        let handled = false;

        switch (e.key) {
            case "ArrowLeft":
            case "ArrowDown":
                step = e.shiftKey ? -1.0 : -0.05;
                handled = true;
                break;
            case "ArrowRight":
            case "ArrowUp":
                step = e.shiftKey ? 1.0 : 0.05;
                handled = true;
                break;
            case "PageUp":
                step = 5.0;
                handled = true;
                break;
            case "PageDown":
                step = -5.0;
                handled = true;
                break;
            case "Home":
                currentAngle = 0.0;
                accumulatedAngle = 0.0;
                handled = true;
                updateSimulation();
                break;
        }

        if (handled) {
            e.preventDefault();
            if (step !== 0) {
                const newAngle = ((currentAngle + step) % 360 + 360) % 360;
                currentAngle = parseFloat((Math.round(newAngle / LEAST_COUNT) * LEAST_COUNT).toFixed(2));
                accumulatedAngle = currentAngle;
                updateSimulation();
            }
        }
    }

    if (dialContainer) {
        dialContainer.addEventListener("pointerdown", onDialPointerDown);
        dialContainer.addEventListener("pointermove", onDialPointerMove);
        dialContainer.addEventListener("pointerup", onDialPointerUp);
        dialContainer.addEventListener("pointercancel", onDialPointerUp);

        dialContainer.addEventListener("wheel", onDialWheel, { passive: false });
        dialContainer.addEventListener("keydown", onDialKeyDown);
    }

    // --- 7. FINE ANGLE STEP BUTTONS ---
    document.querySelectorAll(".step-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const step = parseFloat(btn.dataset.step);
            if (!isNaN(step)) {
                const newAngle = ((currentAngle + step) % 360 + 360) % 360;
                currentAngle = parseFloat((Math.round(newAngle / LEAST_COUNT) * LEAST_COUNT).toFixed(2));
                accumulatedAngle = currentAngle;
                updateSimulation();
            }
        });
    });

    // Reset Analyzer button
    if (resetAnalyzer) {
        resetAnalyzer.addEventListener("click", () => {
            currentAngle = 0.0;
            accumulatedAngle = 0.0;
            updateSimulation();
        });
    }

    // 1. "Align to Nearest Null" toggles between the two equal-dark positions (including setting error)
    if (btnFindNull) {
        btnFindNull.addEventListener("click", () => {
            const { n1, n2 } = getEffectiveNullPositions();

            // Align to nearest vernier least-count division (0.05°)
            const target1 = parseFloat((Math.round(n1 / LEAST_COUNT) * LEAST_COUNT).toFixed(2));
            const target2 = parseFloat((Math.round(n2 / LEAST_COUNT) * LEAST_COUNT).toFixed(2));

            const d1 = circularDist(currentAngle, target1);
            const d2 = circularDist(currentAngle, target2);

            // If already at or very close to null 1 (<= 0.25°), toggle to null 2
            if (d1 <= 0.25) {
                currentAngle = target2;
            } else if (d2 <= 0.25) {
                // If already at or very close to null 2, toggle to null 1
                currentAngle = target1;
            } else {
                // If not at a null position, align to the nearest null position
                currentAngle = d1 <= d2 ? target1 : target2;
            }
            accumulatedAngle = currentAngle;
            updateSimulation();
        });
    }

    // --- 8. TUBE MEDIUM & CONCENTRATION TOGGLES ---
    function selectMedium(medium) {
        currentMedium = medium;
        isWaterMedium = (medium === "water");

        if (btnMediumWater) btnMediumWater.classList.toggle("active", medium === "water");
        if (btnMediumSugar) btnMediumSugar.classList.toggle("active", medium === "sugar");
        if (btnMediumUnknown) btnMediumUnknown.classList.toggle("active", medium === "unknown");

        if (sugarParams) {
            sugarParams.style.display = (medium === "sugar") ? "flex" : "none";
        }

        updateRecordButtonsVisibility();
        updateSimulation();
    }

    if (btnMediumWater) {
        btnMediumWater.addEventListener("click", () => selectMedium("water"));
    }

    if (btnMediumSugar) {
        btnMediumSugar.addEventListener("click", () => selectMedium("sugar"));
    }

    if (btnMediumUnknown) {
        btnMediumUnknown.addEventListener("click", () => {
            if (!btnMediumUnknown.disabled) {
                selectMedium("unknown");
            }
        });
    }

    if (sugarConcentrationInput) {
        sugarConcentrationInput.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                currentConcentration = val;
                presetButtons.forEach((b) => b.classList.remove("active"));
                updateSimulation();
            }
        });
    }

    if (simTubeLengthInput) {
        simTubeLengthInput.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                tubeLength = val;
                updateSimulation();
            }
        });
    }

    presetButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            presetButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentConcentration = parseFloat(btn.dataset.c);
            if (sugarConcentrationInput) {
                sugarConcentrationInput.value = currentConcentration;
            }

            // Select corresponding row in observation table
            if (currentConcentration === 5 || currentConcentration === 0.05) activeRowIndex = 1;
            else if (currentConcentration === 10 || currentConcentration === 0.10) activeRowIndex = 2;
            else if (currentConcentration === 15 || currentConcentration === 0.15) activeRowIndex = 3;
            highlightActiveRow(activeRowIndex);

            updateSimulation();
        });
    });

    function highlightActiveRow(idx) {
        [1, 2, 3].forEach((i) => {
            const r = document.getElementById("row" + i);
            if (r) {
                if (i === idx) r.classList.add("active-row");
                else r.classList.remove("active-row");
            }
        });
    }

    // Helper: Display warning message in badge
    function showWarning(msg) {
        if (recordedBadge) {
            recordedBadge.textContent = msg;
            recordedBadge.style.color = "#ff6b6b";
            recordedBadge.classList.add("input-recorded-flash");
            setTimeout(() => recordedBadge.classList.remove("input-recorded-flash"), 600);
        }
    }

    // --- 9. RECORD READINGS DIRECTLY TO OBSERVATION TABLE WITH VALIDATION ---
    // 2. Record buttons only work when:
    //    - halves are equally dark (null position)
    //    - tube medium matches the button (water or sugar)
    //    - CW and CCW readings of a row are about 180° apart (otherwise show warning)
    function recordReadingToTable(fieldPrefix, label, mediumType, direction) {
        // Check 1: Tube medium matches button
        if (mediumType === "water" && !isWaterMedium) {
            showWarning("⚠️ Cannot record: Tube currently contains Sugar Solution. Switch tube contents to Distilled Water to record pure water readings.");
            return;
        }
        if (mediumType === "sugar" && isWaterMedium) {
            showWarning("⚠️ Cannot record: Tube currently contains Distilled Water. Switch tube contents to Cane Sugar Solution to record sugar readings.");
            return;
        }

        // Check 2: Two halves are equally dark (null position with setting error)
        const readings = calculateScaleReadings(currentAngle);
        const { n1, n2 } = getEffectiveNullPositions();
        const d1 = angularDiffSigned(readings.total, n1);
        const d2 = angularDiffSigned(readings.total, n2);
        const delta = Math.abs(d1) <= Math.abs(d2) ? d1 : d2;
        const isNullPosition = Math.abs(delta) <= 0.20;

        if (!isNullPosition) {
            showWarning("⚠️ Cannot record: Field halves are not equally dark. Align analyzer to the null position before recording.");
            return;
        }

        // Check 3: CW and CCW readings of this row must be about 180° apart
        const counterpartPrefix = (mediumType === "water")
            ? (direction === "CW" ? "tblWaterCCW" : "tblWaterCW")
            : (direction === "CW" ? "tblSugarCCW" : "tblSugarCW");
        const counterpartEl = document.getElementById(counterpartPrefix + activeRowIndex);
        const counterpartVal = counterpartEl ? counterpartEl.value.trim() : "";

        if (counterpartVal !== "") {
            const otherAngle = parseFloat(counterpartVal);
            if (!isNaN(otherAngle)) {
                const diff = Math.abs(readings.total - otherAngle) % 360;
                const cDist = diff > 180 ? 360 - diff : diff;
                if (Math.abs(cDist - 180) > 5.0) {
                    showWarning(`⚠️ Warning: CW and CCW readings in Row ${activeRowIndex} must be about 180° apart (Observed difference: ${cDist.toFixed(2)}°). Rotate to the opposite null.`);
                    return;
                }
            }
        }

        // Record reading
        const targetTot = document.getElementById(fieldPrefix + activeRowIndex);
        const targetMS = document.getElementById(fieldPrefix + "_MS" + activeRowIndex);
        const targetVS = document.getElementById(fieldPrefix + "_VS" + activeRowIndex);

        if (targetTot) targetTot.value = readings.total.toFixed(2);
        if (targetMS) targetMS.value = readings.msr.toFixed(1);
        if (targetVS) targetVS.value = readings.vsr;

        // Auto-populate concentration if empty in active row
        const concInput = document.getElementById("tblConc" + activeRowIndex);
        if (concInput && concInput.value.trim() === "") {
            concInput.value = currentConcentration;
        }

        [targetTot, targetMS, targetVS].forEach((el) => {
            if (el) {
                el.classList.add("input-recorded-flash");
                setTimeout(() => el.classList.remove("input-recorded-flash"), 600);
            }
        });

        if (recordedBadge) {
            recordedBadge.textContent = `✓ Recorded ${label} [M.S.=${readings.msr.toFixed(1)}°, V.S.=${readings.vsr}, Tot=${readings.total.toFixed(2)}°] into Row ${activeRowIndex}`;
            recordedBadge.style.color = "#79d7a8";
        }
        isSampleDataLoaded = false;
        calculateAllTableRows();
    }

    const btnRecordWaterCW = document.getElementById("btnRecordWaterCW");
    const btnRecordWaterCCW = document.getElementById("btnRecordWaterCCW");
    const btnRecordSugarCW = document.getElementById("btnRecordSugarCW");
    const btnRecordSugarCCW = document.getElementById("btnRecordSugarCCW");

    // Show only active medium record buttons (water, sugar, or unknown)
    function updateRecordButtonsVisibility() {
        const isWater = (currentMedium === "water");
        const isSugar = (currentMedium === "sugar");
        const isUnknown = (currentMedium === "unknown");

        if (btnRecordWaterCW) btnRecordWaterCW.style.display = isWater ? "" : "none";
        if (btnRecordWaterCCW) btnRecordWaterCCW.style.display = isWater ? "" : "none";
        if (btnRecordSugarCW) btnRecordSugarCW.style.display = isSugar ? "" : "none";
        if (btnRecordSugarCCW) btnRecordSugarCCW.style.display = isSugar ? "" : "none";
        if (btnRecordUnknownCW) btnRecordUnknownCW.style.display = isUnknown ? "" : "none";
        if (btnRecordUnknownCCW) btnRecordUnknownCCW.style.display = isUnknown ? "" : "none";
    }

    if (btnRecordWaterCW) {
        btnRecordWaterCW.addEventListener("click", () => {
            recordReadingToTable("tblWaterCW", "Water Clockwise (a)", "water", "CW");
        });
    }
    if (btnRecordWaterCCW) {
        btnRecordWaterCCW.addEventListener("click", () => {
            recordReadingToTable("tblWaterCCW", "Water Anti-Clockwise (b)", "water", "CCW");
        });
    }
    if (btnRecordSugarCW) {
        btnRecordSugarCW.addEventListener("click", () => {
            recordReadingToTable("tblSugarCW", "Sugar Clockwise (a')", "sugar", "CW");
        });
    }
    if (btnRecordSugarCCW) {
        btnRecordSugarCCW.addEventListener("click", () => {
            recordReadingToTable("tblSugarCCW", "Sugar Anti-Clockwise (b')", "sugar", "CCW");
        });
    }

    // 4. Record Unknown buttons (only at equal darkness, CW and CCW readings about 180° apart)
    if (btnRecordUnknownCW) {
        btnRecordUnknownCW.addEventListener("click", () => {
            if (currentMedium !== "unknown") {
                showWarning("⚠️ Cannot record: Switch tube contents to Unknown Solution.");
                return;
            }

            const readings = calculateScaleReadings(currentAngle);
            const { n1, n2 } = getEffectiveNullPositions();
            const d1 = angularDiffSigned(readings.total, n1);
            const d2 = angularDiffSigned(readings.total, n2);
            const delta = Math.abs(d1) <= Math.abs(d2) ? d1 : d2;
            const isNullPosition = Math.abs(delta) <= 0.20;

            if (!isNullPosition) {
                showWarning("⚠️ Cannot record: Field halves are not equally dark. Align analyzer to the null position before recording.");
                return;
            }

            if (unknownCCW !== null) {
                const diff = Math.abs(readings.total - unknownCCW) % 360;
                const cDist = diff > 180 ? 360 - diff : diff;
                if (Math.abs(cDist - 180) > 5.0) {
                    showWarning(`⚠️ Warning: CW and CCW readings must be about 180° apart (Observed difference: ${cDist.toFixed(2)}°). Rotate to the opposite null.`);
                    return;
                }
            }

            unknownCW = readings.total;
            updateChallengeCalculations();

            if (recordedBadge) {
                recordedBadge.textContent = `✓ Recorded Unknown CW (a'ᵤ) = ${readings.total.toFixed(2)}°`;
                recordedBadge.style.color = "#79d7a8";
            }
        });
    }

    if (btnRecordUnknownCCW) {
        btnRecordUnknownCCW.addEventListener("click", () => {
            if (currentMedium !== "unknown") {
                showWarning("⚠️ Cannot record: Switch tube contents to Unknown Solution.");
                return;
            }

            const readings = calculateScaleReadings(currentAngle);
            const { n1, n2 } = getEffectiveNullPositions();
            const d1 = angularDiffSigned(readings.total, n1);
            const d2 = angularDiffSigned(readings.total, n2);
            const delta = Math.abs(d1) <= Math.abs(d2) ? d1 : d2;
            const isNullPosition = Math.abs(delta) <= 0.20;

            if (!isNullPosition) {
                showWarning("⚠️ Cannot record: Field halves are not equally dark. Align analyzer to the null position before recording.");
                return;
            }

            if (unknownCW !== null) {
                const diff = Math.abs(readings.total - unknownCW) % 360;
                const cDist = diff > 180 ? 360 - diff : diff;
                if (Math.abs(cDist - 180) > 5.0) {
                    showWarning(`⚠️ Warning: CW and CCW readings must be about 180° apart (Observed difference: ${cDist.toFixed(2)}°). Rotate to the opposite null.`);
                    return;
                }
            }

            unknownCCW = readings.total;
            updateChallengeCalculations();

            if (recordedBadge) {
                recordedBadge.textContent = `✓ Recorded Unknown CCW (b'ᵤ) = ${readings.total.toFixed(2)}°`;
                recordedBadge.style.color = "#79d7a8";
            }
        });
    }

    // Two-way synchronization between M.S. + V.S. and Total reading
    const prefixes = ["tblWaterCW", "tblWaterCCW", "tblSugarCW", "tblSugarCCW"];
    for (let i = 1; i <= 3; i++) {
        prefixes.forEach((pref) => {
            const msEl = document.getElementById(pref + "_MS" + i);
            const vsEl = document.getElementById(pref + "_VS" + i);
            const totEl = document.getElementById(pref + i);

            if (msEl && vsEl && totEl) {
                const onMSVSChange = () => {
                    if (msEl.value.trim() === "" && vsEl.value.trim() === "") {
                        totEl.value = "";
                    } else {
                        let ms = parseFloat(msEl.value) || 0;
                        let vs = parseInt(vsEl.value, 10) || 0;
                        if (vs >= 10) {
                            ms += Math.floor(vs / 10) * 0.5;
                            vs = vs % 10;
                            msEl.value = ms.toFixed(1);
                            vsEl.value = vs;
                        }
                        totEl.value = ((ms + vs * LEAST_COUNT) % 360).toFixed(2);
                    }
                    calculateAllTableRows();
                };
                msEl.addEventListener("input", onMSVSChange);
                vsEl.addEventListener("input", onMSVSChange);

                totEl.addEventListener("input", () => {
                    if (totEl.value.trim() === "") {
                        msEl.value = "";
                        vsEl.value = "";
                    } else {
                        const tot = parseFloat(totEl.value);
                        if (!isNaN(tot)) {
                            const scale = calculateScaleReadings(tot);
                            msEl.value = scale.msr.toFixed(1);
                            vsEl.value = scale.vsr;
                        }
                    }
                    calculateAllTableRows();
                });
            }
        });
    }

    // --- 10. OBSERVATION TABLE CALCULATION LOGIC ---
    // 3. Calculate θ1 = a' - a and θ2 = b' - b as signed values (no absolute value),
    //    handling 360° -> 0° wrap-around. Ignore any row with empty boxes.
    function calculateAllTableRows() {
        const rowData = [];

        for (let i = 1; i <= 3; i++) {
            const concEl = document.getElementById("tblConc" + i);
            const wCWEl = document.getElementById("tblWaterCW" + i);
            const wCCWEl = document.getElementById("tblWaterCCW" + i);
            const sCWEl = document.getElementById("tblSugarCW" + i);
            const sCCWEl = document.getElementById("tblSugarCCW" + i);

            const elTheta1 = document.getElementById("tblTheta1_" + i);
            const elTheta2 = document.getElementById("tblTheta2_" + i);
            const elMeanTheta = document.getElementById("tblMeanTheta" + i);
            const elSpec = document.getElementById("tblSpecific" + i);

            const strConc = concEl ? concEl.value.trim() : "";
            const strWCW = wCWEl ? wCWEl.value.trim() : "";
            const strWCCW = wCCWEl ? wCCWEl.value.trim() : "";
            const strSCW = sCWEl ? sCWEl.value.trim() : "";
            const strSCCW = sCCWEl ? sCCWEl.value.trim() : "";

            // Ignore row if any box is empty
            const elDelta = document.getElementById("cardDelta" + i);
            const elCardConc = document.getElementById("cardConc" + i);

            // Update observation card concentration dynamically (empty if no concentration entered)
            if (elCardConc) {
                elCardConc.textContent = strConc !== "" ? `c = ${strConc} g/100 cc` : "";
            }

            if (strConc === "" || strWCW === "" || strWCCW === "" || strSCW === "" || strSCCW === "") {
                if (elTheta1) elTheta1.textContent = "-";
                if (elTheta2) elTheta2.textContent = "-";
                if (elMeanTheta) elMeanTheta.textContent = "-";
                if (elSpec) elSpec.textContent = "—";
                if (elDelta) {
                    elDelta.textContent = "Δ = —";
                    elDelta.style.color = "#8faac4";
                }
                continue;
            }

            const concRaw = parseFloat(strConc);
            const a = parseFloat(strWCW);
            const b = parseFloat(strWCCW);
            const aPrime = parseFloat(strSCW);
            const bPrime = parseFloat(strSCCW);

            if (isNaN(concRaw) || isNaN(a) || isNaN(b) || isNaN(aPrime) || isNaN(bPrime)) {
                if (elTheta1) elTheta1.textContent = "-";
                if (elTheta2) elTheta2.textContent = "-";
                if (elMeanTheta) elMeanTheta.textContent = "-";
                if (elSpec) elSpec.textContent = "—";
                if (elDelta) {
                    elDelta.textContent = "Δ = —";
                    elDelta.style.color = "#8faac4";
                }
                continue;
            }

            const concEff = getEffectiveConcentration(concRaw);

            // θ1 = a' - a (signed, handling 360° wrap-around)
            const theta1 = angularDiffSigned(aPrime, a);
            // θ2 = b' - b (signed, handling 360° wrap-around)
            const theta2 = angularDiffSigned(bPrime, b);
            // Mean theta = (theta1 + theta2) / 2
            const meanTheta = (theta1 + theta2) / 2.0;

            // Specific rotation S = theta / (l * c)
            let sVal = 0;
            if (concEff > 0 && tubeLength > 0) {
                sVal = meanTheta / (tubeLength * concEff);
            }

            // Update row displays
            if (elTheta1) elTheta1.textContent = (theta1 >= 0 ? "+" : "") + theta1.toFixed(2) + "°";
            if (elTheta2) elTheta2.textContent = (theta2 >= 0 ? "+" : "") + theta2.toFixed(2) + "°";
            if (elMeanTheta) elMeanTheta.textContent = (meanTheta >= 0 ? "+" : "") + meanTheta.toFixed(2) + "°";
            if (elSpec) elSpec.textContent = sVal.toFixed(2);

            if (elCardConc) elCardConc.textContent = "c = " + concRaw + " g/100 cc";
            if (elDelta) {
                const diffStd = sVal - STANDARD_S;
                const sign = diffStd >= 0 ? "+" : "";
                elDelta.textContent = `Δ = ${sign}${diffStd.toFixed(2)} from standard`;
                elDelta.style.color = Math.abs(diffStd) < 0.05 ? "#49e4a3" : (Math.abs(diffStd) <= 1.0 ? "#72b3dc" : "#ffd15c");
            }

            if (concEff > 0) {
                rowData.push({ conc: concRaw, concEff: concEff, theta: meanTheta, s: sVal });
            }
        }

        // Summary Statistics
        const elFinalMean = document.getElementById("finalMeanS");
        const elPercErr = document.getElementById("percentageError");
        const elResultMsg = document.getElementById("resultMessage");

        if (rowData.length > 0) {
            const sumS = rowData.reduce((acc, curr) => acc + curr.s, 0);
            const meanS = sumS / rowData.length;
            const percErr = Math.abs((meanS - STANDARD_S) / STANDARD_S) * 100;

            if (elFinalMean) elFinalMean.textContent = meanS.toFixed(2);
            if (elPercErr) elPercErr.textContent = percErr.toFixed(2) + "%";
            if (elResultMsg) {
                elResultMsg.innerHTML = `Calculation verified! Mean specific rotation is <b>${meanS.toFixed(2)}° dm⁻¹ (g/cc)⁻¹</b>.`;
            }
            updateThetaGraph(rowData);
        } else {
            if (elFinalMean) elFinalMean.textContent = "-";
            if (elPercErr) elPercErr.textContent = "-";
            if (elResultMsg) {
                elResultMsg.textContent = "Enter or record observations in the table to compute specific rotation.";
            }
            updateThetaGraph([]); // Clears graph when table is empty
        }

        // Keep unknown challenge calculations & calibration slope synchronized with main table
        updateChallengeCalculations();
    }

    // --- 11. PLOT GRAPH: SCATTER CHART WITH BEST-FIT LINE THROUGH ORIGIN ---
    // Helper: Calculate clean even maximum for Y-axis above data and best-fit line
    function calculateYAxisMax(points, yMax) {
        const maxTheta = (points && points.length > 0) ? points.reduce((m, p) => Math.max(m, p.theta), 0) : 0;
        const rawMax = Math.max(maxTheta, yMax, 0);
        let yMaxEven = Math.ceil(rawMax);
        if (yMaxEven % 2 !== 0) {
            yMaxEven += 1;
        } else if (yMaxEven <= rawMax) {
            yMaxEven += 2;
        }
        return Math.max(yMaxEven, 4);
    }

    // Custom Chart.js plugin to draw dotted guide lines, axis dots, and value labels for observed points
    function createGuideLinesPlugin(points, isPrint = false) {
        return {
            id: "guideLinesPlugin",
            afterDatasetsDraw(chart) {
                if (!points || points.length === 0) return;

                const { ctx, chartArea, scales } = chart;
                if (!scales.x || !scales.y || !chartArea) return;

                const xLeft = chartArea.left;
                const yBottom = chartArea.bottom;

                ctx.save();

                // 1. Clip to chartArea so dotted lines stay inside plot area
                ctx.beginPath();
                ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
                ctx.clip();

                const orangeLine = "#ff9f43";
                const blueLine = "#4dabf7";

                // Draw vertical & horizontal dotted lines for each observed point
                points.forEach((p) => {
                    const xPix = scales.x.getPixelForValue(p.conc);
                    const yPix = scales.y.getPixelForValue(p.theta);

                    // Vertical dotted line: orange (#ff9f43), width 1.5px, dash pattern [5, 4] from point DOWN to x-axis
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = orangeLine;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([5, 4]);
                    ctx.moveTo(xPix, yPix);
                    ctx.lineTo(xPix, yBottom);
                    ctx.stroke();
                    ctx.restore();

                    // Horizontal dotted line: sky blue (#4dabf7), width 1.5px, dash pattern [5, 4] from point LEFT to y-axis
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = blueLine;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([5, 4]);
                    ctx.moveTo(xPix, yPix);
                    ctx.lineTo(xLeft, yPix);
                    ctx.stroke();
                    ctx.restore();
                });

                // Small filled dots (about 4px, same colour as line) where each dotted line touches an axis
                points.forEach((p) => {
                    const xPix = scales.x.getPixelForValue(p.conc);
                    const yPix = scales.y.getPixelForValue(p.theta);

                    // Dot on x-axis (orange)
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(xPix, yBottom, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = orangeLine;
                    ctx.fill();
                    ctx.restore();

                    // Dot on y-axis (sky blue)
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(xLeft, yPix, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = blueLine;
                    ctx.fill();
                    ctx.restore();
                });

                // Re-draw observed scatter dots so they appear cleanly ON TOP of the dotted lines
                points.forEach((p) => {
                    const xPix = scales.x.getPixelForValue(p.conc);
                    const yPix = scales.y.getPixelForValue(p.theta);
                    ctx.save();
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.arc(xPix, yPix, 6, 0, Math.PI * 2);
                    ctx.fillStyle = isPrint ? "#b45309" : "#ffdd53";
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = isPrint ? "#78350f" : "#ffffff";
                    ctx.stroke();
                    ctx.restore();
                });

                // Unclip for drawing axis labels
                ctx.restore();

                // Draw labels where lines meet the axes
                ctx.save();
                ctx.font = "bold 12px Arial, sans-serif";

                const orangeText = isPrint ? "#c2410c" : "#ff9f43";
                const blueText = isPrint ? "#0369a1" : "#4dabf7";

                // X-axis value labels: "c = 10" (orange, bold, 12px), placed just inside plot area above the axis
                const sortedByX = [...points].sort((a, b) => a.conc - b.conc);
                const xLabels = sortedByX.map((p) => ({
                    text: `c = ${p.conc}`,
                    x: scales.x.getPixelForValue(p.conc),
                    y: yBottom - 6
                }));

                for (let i = 1; i < xLabels.length; i++) {
                    if (xLabels[i].x - xLabels[i - 1].x < 46) {
                        xLabels[i].y = (xLabels[i - 1].y === yBottom - 6) ? yBottom - 22 : yBottom - 6;
                    }
                }

                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                ctx.fillStyle = orangeText;
                xLabels.forEach((lbl) => {
                    const textWidth = ctx.measureText(lbl.text).width;
                    ctx.save();
                    ctx.fillStyle = isPrint ? "rgba(255, 255, 255, 0.9)" : "rgba(9, 19, 33, 0.85)";
                    ctx.fillRect(lbl.x - textWidth / 2 - 3, lbl.y - 13, textWidth + 6, 14);
                    ctx.restore();

                    ctx.fillText(lbl.text, lbl.x, lbl.y);
                });

                // Y-axis value labels: "θ = 13.30°" (sky blue, bold, 12px), placed just inside plot area to the right of y-axis
                const sortedByY = [...points].sort((a, b) => scales.y.getPixelForValue(a.theta) - scales.y.getPixelForValue(b.theta));
                const yLabels = sortedByY.map((p) => ({
                    text: `θ = ${p.theta.toFixed(2)}°`,
                    x: xLeft + 6,
                    y: scales.y.getPixelForValue(p.theta)
                }));

                for (let i = 1; i < yLabels.length; i++) {
                    if (Math.abs(yLabels[i].y - yLabels[i - 1].y) < 16) {
                        yLabels[i].y = yLabels[i - 1].y + 16;
                    }
                }
                yLabels.forEach((lbl) => {
                    if (lbl.y > yBottom - 10) lbl.y = yBottom - 10;
                    if (lbl.y < chartArea.top + 10) lbl.y = chartArea.top + 10;
                });

                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillStyle = blueText;
                yLabels.forEach((lbl) => {
                    const textWidth = ctx.measureText(lbl.text).width;
                    ctx.save();
                    ctx.fillStyle = isPrint ? "rgba(255, 255, 255, 0.9)" : "rgba(9, 19, 33, 0.85)";
                    ctx.fillRect(lbl.x - 2, lbl.y - 7, textWidth + 4, 14);
                    ctx.restore();

                    ctx.fillText(lbl.text, lbl.x, lbl.y);
                });

                ctx.restore();
            }
        };
    }

    // 5. Scatter chart with numeric x-axis, no curved lines between points,
    //    straight best-fit line through the origin, cleared when table is empty.
    function updateThetaGraph(points) {
        const canvas = document.getElementById("thetaGraphCanvas");
        if (!canvas) return;

        // Clear graph if table has no complete rows
        if (!points || points.length === 0) {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        if (typeof Chart === "undefined") return;

        // Sort by concentration ascending
        points.sort((a, b) => a.conc - b.conc);

        // Best-fit straight line through origin (y = m * x)
        // m = sum(x * y) / sum(x * x)
        let sumXY = 0;
        let sumX2 = 0;
        let maxConc = 0;
        points.forEach((p) => {
            sumXY += p.conc * p.theta;
            sumX2 += p.conc * p.conc;
            if (p.conc > maxConc) maxConc = p.conc;
        });

        const slope = sumX2 > 0 ? sumXY / sumX2 : 0;
        const xMax = maxConc > 0 ? maxConc * 1.15 : 20;
        const yMax = slope * xMax;
        const yAxisMax = calculateYAxisMax(points, yMax);

        if (chartInstance) {
            chartInstance.destroy();
        }

        const ctx = canvas.getContext("2d");
        chartInstance = new Chart(ctx, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        type: "scatter",
                        label: "Observed Data (θ vs c)",
                        data: points.map((p) => ({ x: p.conc, y: parseFloat(p.theta.toFixed(2)) })),
                        backgroundColor: "#ffdd53",
                        borderColor: "#ffffff",
                        borderWidth: 1.5,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        showLine: false
                    },
                    {
                        type: "line",
                        label: `Best-Fit Line (θ = ${slope.toFixed(3)} · c)`,
                        data: [
                            { x: 0, y: 0 },
                            { x: parseFloat(xMax.toFixed(2)), y: parseFloat(yMax.toFixed(2)) }
                        ],
                        borderColor: "#49e4a3",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: "linear",
                        position: "bottom",
                        min: 0,
                        title: {
                            display: true,
                            text: "Concentration of Solution c (g/100 cc)",
                            color: "#8dc6f1",
                            font: { size: 12, weight: "bold" }
                        },
                        grid: { color: "#1d3a56" },
                        ticks: { color: "#c1ddf4", font: { size: 12 } }
                    },
                    y: {
                        type: "linear",
                        min: 0,
                        max: yAxisMax,
                        title: {
                            display: true,
                            text: "Angle of Rotation θ (Degrees)",
                            color: "#8dc6f1",
                            font: { size: 12, weight: "bold" }
                        },
                        grid: { color: "#1d3a56" },
                        ticks: {
                            stepSize: 2,
                            color: "#c1ddf4",
                            font: { size: 12 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: "#e8f3ff", font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                if (ctx.dataset.type === "scatter") {
                                    return ` Conc: ${ctx.parsed.x} g/100 cc  |  θ: ${ctx.parsed.y.toFixed(2)}°`;
                                } else {
                                    return ` Best-Fit Line: θ = ${ctx.parsed.y.toFixed(2)}° at c = ${ctx.parsed.x} g/100 cc`;
                                }
                            }
                        }
                    }
                }
            },
            plugins: [createGuideLinesPlugin(points, false)]
        });
    }

    // --- 12. SAMPLE DATA, RESET & RECALCULATE LISTENERS ---
    // 6. Start table blank. Reset clears it. Separate "Show sample data" button for demo values.
    if (calculateButton) {
        calculateButton.addEventListener("click", () => {
            calculateAllTableRows();
        });
    }

    if (btnSampleData) {
        btnSampleData.addEventListener("click", () => {
            const defaults = [
                {
                    c: 5,
                    wCW_MS: "0.0", wCW_VS: 0, wCW: "0.00",
                    wCCW_MS: "180.0", wCCW_VS: 0, wCCW: "180.00",
                    sCW_MS: "6.5", sCW_VS: 3, sCW: "6.65",
                    sCCW_MS: "186.5", sCCW_VS: 3, sCCW: "186.65"
                },
                {
                    c: 10,
                    wCW_MS: "0.0", wCW_VS: 0, wCW: "0.00",
                    wCCW_MS: "180.0", wCCW_VS: 0, wCCW: "180.00",
                    sCW_MS: "13.0", sCW_VS: 6, sCW: "13.30",
                    sCCW_MS: "193.0", sCCW_VS: 6, sCCW: "193.30"
                },
                {
                    c: 15,
                    wCW_MS: "0.0", wCW_VS: 0, wCW: "0.00",
                    wCCW_MS: "180.0", wCCW_VS: 0, wCCW: "180.00",
                    sCW_MS: "19.5", sCW_VS: 9, sCW: "19.95",
                    sCCW_MS: "199.5", sCCW_VS: 9, sCCW: "199.95"
                }
            ];

            defaults.forEach((d, idx) => {
                const i = idx + 1;
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.value = val;
                };

                setVal("tblConc" + i, d.c);
                setVal("tblWaterCW_MS" + i, d.wCW_MS);
                setVal("tblWaterCW_VS" + i, d.wCW_VS);
                setVal("tblWaterCW" + i, d.wCW);

                setVal("tblWaterCCW_MS" + i, d.wCCW_MS);
                setVal("tblWaterCCW_VS" + i, d.wCCW_VS);
                setVal("tblWaterCCW" + i, d.wCCW);

                setVal("tblSugarCW_MS" + i, d.sCW_MS);
                setVal("tblSugarCW_VS" + i, d.sCW_VS);
                setVal("tblSugarCW" + i, d.sCW);

                setVal("tblSugarCCW_MS" + i, d.sCCW_MS);
                setVal("tblSugarCCW_VS" + i, d.sCCW_VS);
                setVal("tblSugarCCW" + i, d.sCCW);
            });

            isSampleDataLoaded = true;
            calculateAllTableRows();
            if (recordedBadge) {
                recordedBadge.textContent = "Sample laboratory data loaded.";
                recordedBadge.style.color = "#79d7a8";
            }
        });
    }

    if (resetCalculation) {
        resetCalculation.addEventListener("click", () => {
            isSampleDataLoaded = false;
            for (let i = 1; i <= 3; i++) {
                const ids = [
                    "tblConc" + i,
                    "tblWaterCW_MS" + i, "tblWaterCW_VS" + i, "tblWaterCW" + i,
                    "tblWaterCCW_MS" + i, "tblWaterCCW_VS" + i, "tblWaterCCW" + i,
                    "tblSugarCW_MS" + i, "tblSugarCW_VS" + i, "tblSugarCW" + i,
                    "tblSugarCCW_MS" + i, "tblSugarCCW_VS" + i, "tblSugarCCW" + i
                ];
                ids.forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.value = "";
                });

                const deltaEl = document.getElementById("cardDelta" + i);
                if (deltaEl) {
                    deltaEl.textContent = "Δ = —";
                    deltaEl.style.color = "#8faac4";
                }
                const cardConcEl = document.getElementById("cardConc" + i);
                if (cardConcEl) {
                    cardConcEl.textContent = "";
                }
            }

            calculateAllTableRows();
            if (recordedBadge) {
                recordedBadge.textContent = "Observation table cleared.";
                recordedBadge.style.color = "#79d7a8";
            }
        });
    }

    // 5. "New Trial" button: regenerates all stored errors for a fresh experimental trial
    const btnNewTrial = document.getElementById("btnNewTrial");
    if (btnNewTrial) {
        btnNewTrial.addEventListener("click", () => {
            settingErrors = {};
            updateSimulation();
            if (recordedBadge) {
                recordedBadge.textContent = "New trial started: Fresh experimental setting errors generated.";
                recordedBadge.style.color = "#79d7a8";
            }
        });
    }

    // Connect table input change listeners for all inputs
    document.querySelectorAll(".tbl-input").forEach((inp) => {
        inp.addEventListener("input", () => {
            isSampleDataLoaded = false;
            calculateAllTableRows();
        });
    });

    // Row selection on click
    [1, 2, 3].forEach((i) => {
        const row = document.getElementById("row" + i);
        if (row) {
            row.addEventListener("click", () => {
                activeRowIndex = i;
                highlightActiveRow(i);
            });
        }
    });

    // --- 12. UNKNOWN SOLUTION CHALLENGE LOGIC ---
    function getMainTableCalibration() {
        const points = [];
        for (let i = 1; i <= 3; i++) {
            const cVal = document.getElementById("tblConc" + i)?.value.trim() || "";
            const aVal = document.getElementById("tblWaterCW" + i)?.value.trim() || "";
            const bVal = document.getElementById("tblWaterCCW" + i)?.value.trim() || "";
            const aPVal = document.getElementById("tblSugarCW" + i)?.value.trim() || "";
            const bPVal = document.getElementById("tblSugarCCW" + i)?.value.trim() || "";

            if (cVal !== "" && aVal !== "" && bVal !== "" && aPVal !== "" && bPVal !== "") {
                const conc = parseFloat(cVal);
                const a = parseFloat(aVal);
                const b = parseFloat(bVal);
                const aPrime = parseFloat(aPVal);
                const bPrime = parseFloat(bPVal);

                if (!isNaN(conc) && !isNaN(a) && !isNaN(b) && !isNaN(aPrime) && !isNaN(bPrime) && conc > 0) {
                    const theta1 = angularDiffSigned(aPrime, a);
                    const theta2 = angularDiffSigned(bPrime, b);
                    const meanTheta = (theta1 + theta2) / 2.0;
                    points.push({ conc, theta: meanTheta });
                }
            }
        }

        if (points.length < 2) {
            return { count: points.length, slope: null };
        }

        let sumXY = 0;
        let sumX2 = 0;
        points.forEach((p) => {
            sumXY += p.conc * p.theta;
            sumX2 += p.conc * p.conc;
        });

        const slope = sumX2 > 0 ? sumXY / sumX2 : 0;
        return { count: points.length, slope: slope };
    }

    function updateChallengeCalculations() {
        const wCWEl = document.getElementById("tblWaterCW1");
        const wCCWEl = document.getElementById("tblWaterCCW1");
        const wCWVal = wCWEl ? wCWEl.value.trim() : "";
        const wCCWVal = wCCWEl ? wCCWEl.value.trim() : "";

        const chWaterCW = document.getElementById("chWaterCW");
        const chWaterCCW = document.getElementById("chWaterCCW");
        const chUnknownCW = document.getElementById("chUnknownCW");
        const chUnknownCCW = document.getElementById("chUnknownCCW");
        const chTheta1 = document.getElementById("chTheta1");
        const chTheta2 = document.getElementById("chTheta2");
        const chMeanTheta = document.getElementById("chMeanTheta");
        const waterNote = document.getElementById("challengeWaterNote");
        const chSlopeDisplay = document.getElementById("chSlopeDisplay");
        const chWorkingDisplay = document.getElementById("chWorkingDisplay");

        const hasWaterZero = (wCWVal !== "" && wCCWVal !== "" && !isNaN(parseFloat(wCWVal)) && !isNaN(parseFloat(wCCWVal)));

        if (hasWaterZero) {
            const wA = parseFloat(wCWVal);
            const wB = parseFloat(wCCWVal);
            if (chWaterCW) chWaterCW.textContent = wA.toFixed(2) + "°";
            if (chWaterCCW) chWaterCCW.textContent = wB.toFixed(2) + "°";
            if (waterNote) {
                waterNote.innerHTML = `✓ <b>Water Reference Zero loaded:</b> <i>a</i> = ${wA.toFixed(2)}°, <i>b</i> = ${wB.toFixed(2)}° from Row 1.`;
                waterNote.style.color = "#79d7a8";
            }
        } else {
            if (chWaterCW) chWaterCW.textContent = "—";
            if (chWaterCCW) chWaterCCW.textContent = "—";
            if (waterNote) {
                waterNote.innerHTML = `⚠️ <b style="color:#ffaa55;">Record water readings in the main table first</b> (Row 1 water <i>a</i> and <i>b</i> are needed as the zero reference).`;
                waterNote.style.color = "#ffaa55";
            }
        }

        if (chUnknownCW) chUnknownCW.textContent = unknownCW !== null ? unknownCW.toFixed(2) + "°" : "—";
        if (chUnknownCCW) chUnknownCCW.textContent = unknownCCW !== null ? unknownCCW.toFixed(2) + "°" : "—";

        let theta1U = null;
        let theta2U = null;
        let meanThetaU = null;

        if (hasWaterZero) {
            const wA = parseFloat(wCWVal);
            const wB = parseFloat(wCCWVal);

            if (unknownCW !== null) {
                theta1U = angularDiffSigned(unknownCW, wA);
                if (chTheta1) chTheta1.textContent = (theta1U >= 0 ? "+" : "") + theta1U.toFixed(2) + "°";
            } else {
                if (chTheta1) chTheta1.textContent = "—";
            }

            if (unknownCCW !== null) {
                theta2U = angularDiffSigned(unknownCCW, wB);
                if (chTheta2) chTheta2.textContent = (theta2U >= 0 ? "+" : "") + theta2U.toFixed(2) + "°";
            } else {
                if (chTheta2) chTheta2.textContent = "—";
            }

            if (theta1U !== null && theta2U !== null) {
                meanThetaU = (theta1U + theta2U) / 2.0;
                if (chMeanTheta) chMeanTheta.textContent = (meanThetaU >= 0 ? "+" : "") + meanThetaU.toFixed(2) + "°";
            } else {
                if (chMeanTheta) chMeanTheta.textContent = "—";
            }
        } else {
            if (chTheta1) chTheta1.textContent = "—";
            if (chTheta2) chTheta2.textContent = "—";
            if (chMeanTheta) chMeanTheta.textContent = "—";
        }

        // Calibration slope & working
        const calib = getMainTableCalibration();
        if (calib.count < 2) {
            if (chSlopeDisplay) chSlopeDisplay.textContent = "Complete at least 2 rows of the main table first";
            if (chWorkingDisplay) chWorkingDisplay.innerHTML = "<i>c</i> = <i>θ<sub>u</sub></i> / slope = — (Calibration slope required)";
        } else {
            if (chSlopeDisplay) chSlopeDisplay.textContent = `Calibration slope = S·l = ${calib.slope.toFixed(3)}`;
            if (meanThetaU !== null) {
                const calcC = calib.slope > 0 ? meanThetaU / calib.slope : 0;
                if (chWorkingDisplay) {
                    chWorkingDisplay.innerHTML = `<i>c</i> = <i>θ<sub>u</sub></i> / slope = ${meanThetaU.toFixed(2)}° / ${calib.slope.toFixed(3)} = <b>${calcC.toFixed(2)} g/100 cc</b>`;
                }
            } else {
                if (chWorkingDisplay) {
                    chWorkingDisplay.innerHTML = `<i>c</i> = <i>θ<sub>u</sub></i> / ${calib.slope.toFixed(3)} = Record unknown CW & CCW to calculate`;
                }
            }
        }
    }

    function startNewChallenge() {
        unknownConcentration = generateUnknownConcentration();
        unknownCW = null;
        unknownCCW = null;
        challengeSubmission = null;

        const chEstimatedConc = document.getElementById("chEstimatedConc");
        if (chEstimatedConc) chEstimatedConc.value = "";

        const feedbackBox = document.getElementById("chFeedbackBox");
        if (feedbackBox) feedbackBox.style.display = "none";

        if (btnMediumUnknown) {
            btnMediumUnknown.disabled = false;
            btnMediumUnknown.removeAttribute("title");
        }

        if (btnStartChallenge) btnStartChallenge.style.display = "none";
        if (btnNewChallenge) btnNewChallenge.style.display = "";
        if (btnRevealAnswer) btnRevealAnswer.style.display = "";

        const challengeBanner = document.getElementById("challengeBanner");
        if (challengeBanner) {
            challengeBanner.innerHTML = `<span>✨ <b>Challenge Active:</b> An unknown cane sugar solution has been placed in the polarimeter tube. Find its equal-darkness null positions and record <i>a'<sub>u</sub></i> and <i>b'<sub>u</sub></i>!</span>`;
        }

        selectMedium("unknown");
        updateChallengeCalculations();

        if (recordedBadge) {
            recordedBadge.textContent = "Unknown solution challenge started. Tube contents switched to Unknown Solution.";
            recordedBadge.style.color = "#a78bfa";
        }
    }

    if (btnStartChallenge) {
        btnStartChallenge.addEventListener("click", startNewChallenge);
    }
    if (btnNewChallenge) {
        btnNewChallenge.addEventListener("click", startNewChallenge);
    }

    if (btnRevealAnswer) {
        btnRevealAnswer.addEventListener("click", () => {
            if (unknownConcentration === null) {
                alert("Please click 'Start Challenge' first to begin.");
                return;
            }

            const feedbackBox = document.getElementById("chFeedbackBox");
            const resEstimate = document.getElementById("chResEstimate");
            const resTrue = document.getElementById("chResTrue");
            const resError = document.getElementById("chResError");
            const resVerdict = document.getElementById("chResVerdict");

            const estInput = document.getElementById("chEstimatedConc");
            const estVal = parseFloat(estInput ? estInput.value.trim() : "");

            if (!isNaN(estVal) && estVal > 0) {
                const percErr = Math.abs((estVal - unknownConcentration) / unknownConcentration) * 100;
                if (resEstimate) resEstimate.textContent = estVal.toFixed(2) + " g/100 cc";
                if (resError) resError.textContent = percErr.toFixed(2) + "%";
            } else {
                if (resEstimate) resEstimate.textContent = "Not entered";
                if (resError) resError.textContent = "—";
            }

            if (resTrue) resTrue.textContent = unknownConcentration.toFixed(2) + " g/100 cc";
            if (resVerdict) {
                resVerdict.className = "feedback-message-pill revealed";
                resVerdict.innerHTML = `👁️ <b>Revealed Answer:</b> The true concentration of the unknown solution is <b>${unknownConcentration.toFixed(2)} g/100 cc</b>.`;
            }
            if (feedbackBox) {
                feedbackBox.style.display = "block";
            }
        });
    }

    if (btnSubmitChallenge) {
        btnSubmitChallenge.addEventListener("click", () => {
            if (unknownConcentration === null) {
                alert("Please click 'Start Challenge' first to begin.");
                return;
            }

            const estInput = document.getElementById("chEstimatedConc");
            const estVal = parseFloat(estInput ? estInput.value.trim() : "");
            if (isNaN(estVal) || estVal <= 0) {
                alert("Please enter a valid estimated concentration in g/100 cc (e.g. 8.5).");
                return;
            }

            const trueC = unknownConcentration;
            const percErr = Math.abs((estVal - trueC) / trueC) * 100;

            const feedbackBox = document.getElementById("chFeedbackBox");
            const resEstimate = document.getElementById("chResEstimate");
            const resTrue = document.getElementById("chResTrue");
            const resError = document.getElementById("chResError");
            const resVerdict = document.getElementById("chResVerdict");

            if (resEstimate) resEstimate.textContent = estVal.toFixed(2) + " g/100 cc";
            if (resTrue) resTrue.textContent = trueC.toFixed(2) + " g/100 cc";
            if (resError) resError.textContent = percErr.toFixed(2) + "%";

            let msg = "";
            let cls = "";
            if (percErr <= 5.0) {
                cls = "excellent";
                msg = "🌟 Excellent! Your estimation is within 5% of the true concentration.";
            } else if (percErr <= 10.0) {
                cls = "good";
                msg = "👍 Good, but check your readings (Error is between 5% and 10%).";
            } else {
                cls = "retry";
                msg = "⚠️ Check your readings and try again (Error is above 10%).";
            }

            if (resVerdict) {
                resVerdict.className = "feedback-message-pill " + cls;
                resVerdict.textContent = msg;
            }
            if (feedbackBox) {
                feedbackBox.style.display = "block";
            }

            // Save challenge submission details for official report export
            const wCWVal = document.getElementById("tblWaterCW1")?.value.trim() || "";
            const wCCWVal = document.getElementById("tblWaterCCW1")?.value.trim() || "";
            const wA = parseFloat(wCWVal) || 0;
            const wB = parseFloat(wCCWVal) || 0;
            const t1 = unknownCW !== null ? angularDiffSigned(unknownCW, wA) : null;
            const t2 = unknownCCW !== null ? angularDiffSigned(unknownCCW, wB) : null;
            const mT = (t1 !== null && t2 !== null) ? (t1 + t2) / 2.0 : null;
            const calib = getMainTableCalibration();

            challengeSubmission = {
                estimatedConc: estVal,
                trueConc: trueC,
                percentageError: percErr,
                unknownCW: unknownCW,
                unknownCCW: unknownCCW,
                waterCW: wA,
                waterCCW: wB,
                theta1U: t1,
                theta2U: t2,
                meanThetaU: mT,
                slope: calib.slope,
                verdict: msg
            };
        });
    }

    // --- 13. DOWNLOAD REPORT / A4 PDF PRINT GENERATION ---
    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function isTableComplete() {
        for (let i = 1; i <= 3; i++) {
            const cVal = document.getElementById("tblConc" + i)?.value.trim() || "";
            const aVal = document.getElementById("tblWaterCW" + i)?.value.trim() || "";
            const bVal = document.getElementById("tblWaterCCW" + i)?.value.trim() || "";
            const aPVal = document.getElementById("tblSugarCW" + i)?.value.trim() || "";
            const bPVal = document.getElementById("tblSugarCCW" + i)?.value.trim() || "";

            if (cVal === "" || aVal === "" || bVal === "" || aPVal === "" || bPVal === "") {
                return false;
            }
            if (isNaN(parseFloat(cVal)) || isNaN(parseFloat(aVal)) || isNaN(parseFloat(bVal)) || isNaN(parseFloat(aPVal)) || isNaN(parseFloat(bPVal))) {
                return false;
            }
        }
        return true;
    }

    function generatePrintableChartImage(points) {
        if (!points || points.length === 0 || typeof Chart === "undefined") {
            return "";
        }
        const printCanvas = document.createElement("canvas");
        printCanvas.width = 650;
        printCanvas.height = 340;
        printCanvas.style.display = "none";
        document.body.appendChild(printCanvas);

        let sumXY = 0;
        let sumX2 = 0;
        let maxConc = 0;
        points.forEach((p) => {
            sumXY += p.conc * p.theta;
            sumX2 += p.conc * p.conc;
            if (p.conc > maxConc) maxConc = p.conc;
        });
        const slope = sumX2 > 0 ? sumXY / sumX2 : 0;
        const xMax = maxConc > 0 ? maxConc * 1.15 : 20;
        const yMax = slope * xMax;
        const yAxisMax = calculateYAxisMax(points, yMax);

        const pctx = printCanvas.getContext("2d");
        pctx.fillStyle = "#ffffff";
        pctx.fillRect(0, 0, printCanvas.width, printCanvas.height);

        const tempChart = new Chart(pctx, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        type: "scatter",
                        label: "Observed Points (θ vs c)",
                        data: points.map((p) => ({ x: p.conc, y: parseFloat(p.theta.toFixed(2)) })),
                        backgroundColor: "#b45309",
                        borderColor: "#78350f",
                        borderWidth: 1.5,
                        pointRadius: 6,
                        showLine: false
                    },
                    {
                        type: "line",
                        label: `Best-Fit Line (θ = ${slope.toFixed(3)} · c)`,
                        data: [
                            { x: 0, y: 0 },
                            { x: parseFloat(xMax.toFixed(2)), y: parseFloat(yMax.toFixed(2)) }
                        ],
                        borderColor: "#059669",
                        backgroundColor: "transparent",
                        borderWidth: 2.5,
                        pointRadius: 0,
                        tension: 0,
                        fill: false
                    }
                ]
            },
            options: {
                animation: false,
                responsive: false,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: "linear",
                        position: "bottom",
                        min: 0,
                        title: {
                            display: true,
                            text: "Concentration of Sugar Solution c (g/100 cc)",
                            color: "#0f172a",
                            font: { size: 12, weight: "bold" }
                        },
                        grid: { color: "#e2e8f0" },
                        ticks: { color: "#1e293b", font: { size: 12 } }
                    },
                    y: {
                        type: "linear",
                        min: 0,
                        max: yAxisMax,
                        title: {
                            display: true,
                            text: "Optical Rotation Angle θ (Degrees)",
                            color: "#0f172a",
                            font: { size: 12, weight: "bold" }
                        },
                        grid: { color: "#e2e8f0" },
                        ticks: {
                            stepSize: 2,
                            color: "#1e293b",
                            font: { size: 12 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: "#0f172a", font: { size: 11, weight: "bold" } }
                    }
                }
            },
            plugins: [
                {
                    id: "custom_canvas_background_color",
                    beforeDraw: (chart) => {
                        const { ctx } = chart;
                        ctx.save();
                        ctx.globalCompositeOperation = "destination-over";
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, chart.width, chart.height);
                        ctx.restore();
                    }
                },
                createGuideLinesPlugin(points, true)
            ]
        });

        const dataUrl = printCanvas.toDataURL("image/png");
        tempChart.destroy();
        printCanvas.remove();
        return dataUrl;
    }

    function populatePrintReport() {
        const printContainer = document.getElementById("printReportSection");
        if (!printContainer) return;

        const nameInput = document.getElementById("rptStudentName");
        const rollInput = document.getElementById("rptRollNumber");
        const secInput = document.getElementById("rptSectionGroup");
        const dateInput = document.getElementById("rptDate");

        const studentName = nameInput ? nameInput.value.trim() : "";
        const rollNumber = rollInput ? rollInput.value.trim() : "";
        const sectionGroup = secInput ? secInput.value.trim() : "";
        const expDate = dateInput ? dateInput.value.trim() : "";

        // Build observation table rows
        let rowsHtml = "";
        const points = [];
        for (let i = 1; i <= 3; i++) {
            const conc = document.getElementById("tblConc" + i)?.value.trim() || "";
            const a = document.getElementById("tblWaterCW" + i)?.value.trim() || "";
            const b = document.getElementById("tblWaterCCW" + i)?.value.trim() || "";
            const aP = document.getElementById("tblSugarCW" + i)?.value.trim() || "";
            const bP = document.getElementById("tblSugarCCW" + i)?.value.trim() || "";
            const theta1 = document.getElementById("tblTheta1_" + i)?.textContent.trim() || "—";
            const theta2 = document.getElementById("tblTheta2_" + i)?.textContent.trim() || "—";
            const meanTheta = document.getElementById("tblMeanTheta" + i)?.textContent.trim() || "—";
            const spec = document.getElementById("tblSpecific" + i)?.textContent.trim() || "—";

            const numConc = parseFloat(conc);
            const numMeanTheta = parseFloat(meanTheta.replace("°", ""));
            if (!isNaN(numConc) && !isNaN(numMeanTheta)) {
                points.push({ conc: numConc, theta: numMeanTheta });
            }

            rowsHtml += `
                <tr>
                    <td><b>${i}</b></td>
                    <td>${escapeHtml(a)}°</td>
                    <td>${escapeHtml(b)}°</td>
                    <td class="highlight">${escapeHtml(conc)}</td>
                    <td>${escapeHtml(aP)}°</td>
                    <td>${escapeHtml(bP)}°</td>
                    <td>${escapeHtml(theta1)}</td>
                    <td>${escapeHtml(theta2)}</td>
                    <td class="highlight">${escapeHtml(meanTheta)}</td>
                    <td class="highlight"><b>${escapeHtml(spec)}</b></td>
                </tr>
            `;
        }

        const meanS = document.getElementById("finalMeanS")?.textContent.trim() || "—";
        const percError = document.getElementById("percentageError")?.textContent.trim() || "—";
        const s1 = document.getElementById("tblSpecific1")?.textContent.trim() || "—";
        const s2 = document.getElementById("tblSpecific2")?.textContent.trim() || "—";
        const s3 = document.getElementById("tblSpecific3")?.textContent.trim() || "—";

        // Graph image with white background
        let graphDataUrl = "";
        try {
            graphDataUrl = generatePrintableChartImage(points);
        } catch (e) {
            console.error("Error generating printable graph:", e);
        }

        // Unknown Challenge section if submitted
        let unknownSectionHtml = "";
        const hasChallenge = (challengeSubmission !== null);
        if (hasChallenge) {
            const cs = challengeSubmission;
            const t1Str = cs.theta1U !== null ? (cs.theta1U >= 0 ? "+" : "") + cs.theta1U.toFixed(2) + "°" : "—";
            const t2Str = cs.theta2U !== null ? (cs.theta2U >= 0 ? "+" : "") + cs.theta2U.toFixed(2) + "°" : "—";
            const mTStr = cs.meanThetaU !== null ? (cs.meanThetaU >= 0 ? "+" : "") + cs.meanThetaU.toFixed(2) + "°" : "—";
            const slopeStr = cs.slope !== null ? cs.slope.toFixed(3) : "—";
            const calcCStr = (cs.slope && cs.meanThetaU !== null) ? (cs.meanThetaU / cs.slope).toFixed(2) : "—";

            unknownSectionHtml = `
                <div class="print-avoid-break">
                    <div class="print-sec-heading">6. Unknown Solution Challenge Analysis</div>
                    <div class="print-meta-bar">
                        <span>Water Zero Reference: <i>a</i> = ${cs.waterCW.toFixed(2)}°, <i>b</i> = ${cs.waterCCW.toFixed(2)}°</span> &nbsp;|&nbsp;
                        <span>Unknown Readings: <i>a'<sub>u</sub></i> = ${cs.unknownCW !== null ? cs.unknownCW.toFixed(2) + '°' : '—'}, <i>b'<sub>u</sub></i> = ${cs.unknownCCW !== null ? cs.unknownCCW.toFixed(2) + '°' : '—'}</span>
                    </div>
                    <table class="print-table">
                        <thead>
                            <tr>
                                <th>&theta;<sub>1u</sub> = a'<sub>u</sub> &minus; a</th>
                                <th>&theta;<sub>2u</sub> = b'<sub>u</sub> &minus; b</th>
                                <th>Mean &theta;<sub>u</sub></th>
                                <th>Calibration Slope (S &middot; l)</th>
                                <th>Estimated Conc.</th>
                                <th>True Conc.</th>
                                <th>Percentage Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${t1Str}</td>
                                <td>${t2Str}</td>
                                <td class="highlight">${mTStr}</td>
                                <td>${slopeStr}</td>
                                <td><b>${cs.estimatedConc.toFixed(2)} g/100 cc</b></td>
                                <td class="highlight"><b>${cs.trueConc.toFixed(2)} g/100 cc</b></td>
                                <td><b>${cs.percentageError.toFixed(2)}%</b></td>
                            </tr>
                        </tbody>
                    </table>
                    <p style="margin: 2px 0 6px 0; font-size: 9.5pt;">
                        <b>Working Formula:</b> Concentration <i>c</i> = &theta;<sub>u</sub> / Slope = ${mTStr} / ${slopeStr} = <b>${calcCStr} g/100 cc</b>.<br>
                        <b>Result Evaluation:</b> ${escapeHtml(cs.verdict || 'Submitted')}
                    </p>
                </div>
            `;
        }

        const secNumberPrecautions = hasChallenge ? "7" : "6";

        printContainer.innerHTML = `
            <div class="print-report-wrapper">
                ${isSampleDataLoaded ? '<div class="print-sample-banner">⚠️ SAMPLE DATA, NOT EXPERIMENTAL READINGS</div>' : ''}

                <div class="print-header">
                    <div class="print-institution">MAHARAJA AGRASEN INSTITUTE OF TECHNOLOGY (MAIT)</div>
                    <div class="print-dept">Department of Applied Sciences &bull; Applied Physics Laboratory</div>
                    <div class="print-title">Experiment No. 7: Specific Rotation of Cane Sugar using a Polarimeter</div>
                </div>

                <div class="print-student-card">
                    <div class="print-student-grid">
                        <div><b>Student Name:</b> ${escapeHtml(studentName || '—')}</div>
                        <div><b>Roll Number:</b> ${escapeHtml(rollNumber || '—')}</div>
                        <div><b>Section / Group:</b> ${escapeHtml(sectionGroup || '—')}</div>
                        <div><b>Date of Experiment:</b> ${escapeHtml(expDate || '—')}</div>
                    </div>
                </div>

                <div class="print-avoid-break">
                    <div class="print-sec-heading">1. Aim &amp; Apparatus Used</div>
                    <p style="margin: 4px 0 4px 0; font-size: 9.5pt;"><b>Aim:</b> To determine the specific rotation of cane sugar solution at room temperature using a Laurent's half-shade polarimeter.</p>
                    <p style="margin: 0 0 6px 0; font-size: 9.5pt;"><b>Apparatus:</b> Laurent's half-shade polarimeter, monochromatic sodium vapor lamp (&lambda; = 589.3 nm), polarimeter glass tube (length 20 cm = 2.0 dm), cane sugar solutions of varying concentrations (5%, 10%, 15%), distilled water, chemical balance, and measuring flask.</p>
                </div>

                <div class="print-avoid-break">
                    <div class="print-sec-heading">2. Formulae Used</div>
                    <p style="margin: 4px 0 4px 0; font-size: 9.5pt;">The specific rotation <i>S</i> of an optically active substance in solution is governed by Biot's law:</p>
                    <div style="text-align: center; font-size: 11pt; font-weight: bold; margin: 4px 0; padding: 4px; background: #f8fafc; border: 1px solid #e2e8f0;">
                        S = &theta; / (l &times; c) &nbsp;&nbsp;[&deg; dm<sup>-1</sup> (g/cc)<sup>-1</sup>]
                    </div>
                    <ul class="print-list">
                        <li><b>&theta;</b> = Mean optical rotation = (&theta;<sub>1</sub> + &theta;<sub>2</sub>) / 2 in degrees, where &theta;<sub>1</sub> = (a' &minus; a) and &theta;<sub>2</sub> = (b' &minus; b).</li>
                        <li><b>a, b</b> = Zero reference analyzer readings for pure distilled water (Clockwise and Anti-Clockwise).</li>
                        <li><b>a', b'</b> = Analyzer readings for sugar solution (Clockwise and Anti-Clockwise).</li>
                        <li><b>l</b> = Length of polarimeter tube in decimeters (<i>l</i> = 2.0 dm = 20 cm).</li>
                        <li><b>c</b> = Concentration of cane sugar solution in g/cc [<i>c</i> (g/cc) = <i>c</i> (g/100 cc) / 100].</li>
                        <li><b>Percentage Error</b> = |Experimental <i>S</i> &minus; Standard <i>S</i>| / Standard <i>S</i> &times; 100%, where Standard <i>S</i> = +66.50&deg; dm<sup>-1</sup> (g/cc)<sup>-1</sup> at 20&deg;C.</li>
                    </ul>
                </div>

                <div class="print-avoid-break">
                    <div class="print-sec-heading">3. Observation Table</div>
                    <div class="print-meta-bar">
                        <span>Length of Polarimeter Tube (<i>l</i>) = 2.0 dm (20 cm)</span> &nbsp;|&nbsp;
                        <span>Room Temperature = 20&deg;C</span> &nbsp;|&nbsp;
                        <span>Vernier Scale Least Count = 0.05&deg;</span>
                    </div>
                    <table class="print-table">
                        <thead>
                            <tr>
                                <th rowspan="2" style="width: 5%;">Obs. No.</th>
                                <th colspan="2">Reading with Pure Water</th>
                                <th rowspan="2" style="width: 12%;">Concentration <i>c</i><br>(g/100 cc)</th>
                                <th colspan="2">Reading with Sugar Soln.</th>
                                <th colspan="2">Rotation Angle (&deg;)</th>
                                <th rowspan="2" style="width: 10%;">Mean &theta;<br>(&deg;)</th>
                                <th rowspan="2" style="width: 14%;">Specific Rot. <i>S</i><br>(&deg; dm<sup>-1</sup> (g/cc)<sup>-1</sup>)</th>
                            </tr>
                            <tr>
                                <th style="width: 10%;">CW (<i>a</i>)</th>
                                <th style="width: 10%;">CCW (<i>b</i>)</th>
                                <th style="width: 10%;">CW (<i>a'</i>)</th>
                                <th style="width: 10%;">CCW (<i>b'</i>)</th>
                                <th style="width: 9%;">&theta;<sub>1</sub> = a'&minus;a</th>
                                <th style="width: 9%;">&theta;<sub>2</sub> = b'&minus;b</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>

                <div class="print-avoid-break">
                    <div class="print-sec-heading">4. Specific Rotation Results Summary</div>
                    <div class="print-results-grid">
                        <div class="print-result-box">
                            <span class="label">Observed Specific Rotations</span>
                            <span class="val" style="font-size: 10pt;">
                                S<sub>1</sub> = ${s1}&deg; &bull; S<sub>2</sub> = ${s2}&deg; &bull; S<sub>3</sub> = ${s3}&deg;
                            </span>
                            <span class="sub">&deg; dm<sup>-1</sup> (g/cc)<sup>-1</sup></span>
                        </div>
                        <div class="print-result-box">
                            <span class="label">Mean Experimental S</span>
                            <span class="val" style="color: #059669;">${meanS}&deg;</span>
                            <span class="sub">&deg; dm<sup>-1</sup> (g/cc)<sup>-1</sup></span>
                        </div>
                        <div class="print-result-box">
                            <span class="label">Literature Value &amp; Error</span>
                            <span class="val" style="color: #1e3a8a;">Std: +66.50&deg;</span>
                            <span class="sub">Error: <b>${percError}</b></span>
                        </div>
                    </div>
                </div>

                <div class="print-avoid-break">
                    <div class="print-sec-heading">5. Graphical Analysis (&theta; vs Concentration c)</div>
                    <p style="margin: 2px 0 6px 0; font-size: 9.5pt;">According to Biot's law, &theta; is directly proportional to concentration <i>c</i>. The slope of the best-fit line through the origin equals <i>l &times; (S / 100)</i>.</p>
                    ${graphDataUrl ? `<img class="print-graph-img" src="${graphDataUrl}" alt="Graph of Optical Rotation vs Concentration"><p style="margin: 4px 0 0 0; font-size: 8.5pt; color: #475569; text-align: center; font-style: italic;">Dotted lines: orange = concentration (c), blue = rotation (θ) for each observation</p>` : '<p style="color:#64748b; font-style:italic;">Graph unavailable.</p>'}
                </div>

                ${unknownSectionHtml}

                <div class="print-avoid-break">
                    <div class="print-sec-heading">${secNumberPrecautions}. Precautions &amp; Sources of Error</div>
                    <p style="margin: 3px 0 2px 0; font-weight: bold; font-size: 9.5pt;">Precautions:</p>
                    <ul class="print-list">
                        <li>The polarimeter tube must be completely filled so that no air bubble is entrapped inside the optical path.</li>
                        <li>The optical glass cover slips at both ends of the tube must be cleaned thoroughly with lens tissue before mounting.</li>
                        <li>Both clockwise (CW) and counter-clockwise (CCW) readings (180&deg; apart) must be recorded to eliminate scale eccentricity errors.</li>
                        <li>The analyzer should be aligned to the equally dark shade rather than bright field, as the human eye is far more sensitive to intensity matching at low illumination.</li>
                    </ul>
                    <p style="margin: 4px 0 2px 0; font-weight: bold; font-size: 9.5pt;">Sources of Error:</p>
                    <ul class="print-list">
                        <li>Subjective visual error in matching the equal darkness of the two half-shade fields.</li>
                        <li>Inaccuracies in preparing sugar solutions of exact concentrations.</li>
                        <li>Variations in ambient laboratory temperature during optical rotation measurements.</li>
                        <li>Slight mechanical backlash or reading parallax on the circular vernier scale.</li>
                    </ul>
                </div>

                <div class="print-avoid-break">
                    <div class="print-signatures-row">
                        <div class="print-signature-box">Student Signature &amp; Date</div>
                        <div class="print-signature-box">Faculty / Lab Instructor Signature &amp; Remarks</div>
                    </div>
                </div>
            </div>
        `;
    }

    const btnDownloadReport = document.getElementById("btnDownloadReport");
    const reportStatusMsg = document.getElementById("reportStatusMsg");

    if (btnDownloadReport) {
        btnDownloadReport.addEventListener("click", () => {
            if (!isTableComplete()) {
                if (reportStatusMsg) {
                    reportStatusMsg.textContent = "⚠️ Complete the observation table first.";
                    reportStatusMsg.style.color = "#f87171";
                }
                return;
            }

            if (reportStatusMsg) {
                reportStatusMsg.textContent = "Preparing report...";
                reportStatusMsg.style.color = "#38bdf8";
            }

            populatePrintReport();

            setTimeout(() => {
                if (reportStatusMsg) {
                    reportStatusMsg.textContent = "";
                }
                window.print();
            }, 250);
        });
    }

    // Default Date to today
    const rptDate = document.getElementById("rptDate");
    if (rptDate && !rptDate.value) {
        rptDate.value = new Date().toISOString().split("T")[0];
    }

    // --- 14. INITIALIZATION ---
    generateMainScale();
    generateVernierScale();
    updateRecordButtonsVisibility();
    updateSimulation();
    calculateAllTableRows();
    updateChallengeCalculations();
})();
