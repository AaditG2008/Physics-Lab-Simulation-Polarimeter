// VIRTUAL POLARIMETER LABORATORY - EXPERIMENT NO. 07
// APPLIED PHYSICS LABORATORY | MAIT

(function () {
    // --- STATE VARIABLES ---
    let currentAngle = 0.0;           // Analyzer angle in degrees (0 - 360°)
    let isWaterMedium = true;          // true: Distilled Water, false: Cane Sugar Solution
    let currentConcentration = 0.10;   // gm/c.c.
    let tubeLength = 2.0;              // dm (standard polarimeter tube = 2 dm = 20 cm)
    const STANDARD_S = 66.50;          // Standard specific rotation of cane sugar (° dm^-1 (gm/c.c.)^-1 at 20°C)
    const LEAST_COUNT = 0.05;          // Vernier least count = 0.05° (1 MSD = 0.5°, 10 VSD)
    let isDraggingDial = false;
    let chartInstance = null;
    let activeRowIndex = 2;            // 1, 2, or 3 (defaults to 2 for 0.10 gm/c.c.)

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
    const sugarParams = document.getElementById("sugarParams");
    const sugarConcentrationInput = document.getElementById("sugarConcentration");
    const simTubeLengthInput = document.getElementById("simTubeLength");
    const presetButtons = document.querySelectorAll(".preset-btn");

    const recordedBadge = document.getElementById("recordedBadge");
    const calculateButton = document.getElementById("calculateButton");
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
                const tx = cx + textR * Math.cos(rad);
                const ty = cy + textR * Math.sin(rad) + 3;

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

    // --- 3. COMPUTE VERNIER & MAIN SCALE READINGS ---
    function calculateScaleReadings(angle) {
        // Normalize angle to [0, 360)
        let normalized = ((angle % 360) + 360) % 360;

        // 1 Main Scale Division (M.S.D) = 0.5°
        const msr = Math.floor(normalized / 0.5) * 0.5;
        const remainder = normalized - msr;

        // Least Count = 0.05°
        let vsr = Math.round(remainder / LEAST_COUNT);
        if (vsr >= 10) vsr = 9;

        const totalReading = msr + vsr * LEAST_COUNT;

        return {
            msr: msr,
            vsr: vsr,
            total: totalReading,
            rawAngle: normalized
        };
    }

    // --- 4. OPTICAL PHYSICS: HALF-SHADE FIELD & SENSITIVE NULL POSITION ---
    function updateTelescopeView(readings) {
        // Optical rotation produced by solution
        let thetaOpt = 0.0;
        if (!isWaterMedium) {
            // S = theta / (l * c) => theta = S * l * c
            thetaOpt = STANDARD_S * tubeLength * currentConcentration;
        }

        // Relative analyzer angle compared to transmission null
        // Extinction null occurs at thetaOpt and thetaOpt + 180°
        const currentTotal = readings.total;
        let delta = (currentTotal - thetaOpt) % 180;
        if (delta > 90) delta -= 180;
        if (delta < -90) delta += 180;

        // Half-shade angle alpha (~2.5° half angle)
        const alpha = 2.5;
        const deltaRad = (delta * Math.PI) / 180;
        const alphaRad = (alpha * Math.PI) / 180;

        // Transmitted intensity through each half
        // I_left ~ sin^2(delta - alpha), I_right ~ sin^2(delta + alpha)
        const iLeft = Math.sin(deltaRad - alphaRad) ** 2;
        const iRight = Math.sin(deltaRad + alphaRad) ** 2;

        // Convert to display luminance with high-contrast sodium D monochromatic yellow tint
        // Null point (delta = 0): both halves equally dark (intensity = sin^2(2.5°) ~ 0.0019)
        const scaleIntensity = (i) => Math.min(1, Math.max(0, 0.08 + Math.sqrt(i) * 0.92));
        const lumLeft = scaleIntensity(iLeft);
        const lumRight = scaleIntensity(iRight);

        // Sodium D lamp monochromatic color: warm golden yellow when illuminated, dark slate when extinguished
        function getFieldColor(lum) {
            const r = Math.round(18 + lum * 225);
            const g = Math.round(24 + lum * 195);
            const b = Math.round(36 + lum * 70);
            return `rgb(${r}, ${g}, ${b})`;
        }

        leftHalf.style.backgroundColor = getFieldColor(lumLeft);
        rightHalf.style.backgroundColor = getFieldColor(lumRight);

        // Display intensity %
        leftIntensityVal.textContent = Math.round(lumLeft * 100) + "%";
        rightIntensityVal.textContent = Math.round(lumRight * 100) + "%";

        // Check if aligned to Sensitive Null Position (equally dark)
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

        // Update Telescope view
        updateTelescopeView(readings);
    }

    // --- 6. INTERACTIVE SVG DIAL DRAG CONTROLS ---
    function getAngleFromEvent(e) {
        const rect = polarimeterSvg.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        // Angle in radians relative to center
        let rad = Math.atan2(clientY - centerY, clientX - centerX);
        // Convert to degrees with 0° at the top (12 o'clock)
        let deg = (rad * 180) / Math.PI + 90;
        if (deg < 0) deg += 360;

        return deg;
    }

    function onPointerDown(e) {
        isDraggingDial = true;
        currentAngle = getAngleFromEvent(e);
        updateSimulation();
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!isDraggingDial) return;
        currentAngle = getAngleFromEvent(e);
        updateSimulation();
        e.preventDefault();
    }

    function onPointerUp() {
        isDraggingDial = false;
    }

    if (dialContainer) {
        dialContainer.addEventListener("mousedown", onPointerDown);
        window.addEventListener("mousemove", onPointerMove);
        window.addEventListener("mouseup", onPointerUp);

        dialContainer.addEventListener("touchstart", onPointerDown, { passive: false });
        window.addEventListener("touchmove", onPointerMove, { passive: false });
        window.addEventListener("touchend", onPointerUp);
    }

    // --- 7. FINE ANGLE STEP BUTTONS ---
    document.querySelectorAll(".step-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const step = parseFloat(btn.dataset.step);
            if (!isNaN(step)) {
                currentAngle = ((currentAngle + step) % 360 + 360) % 360;
                updateSimulation();
            }
        });
    });

    // Reset Analyzer button
    if (resetAnalyzer) {
        resetAnalyzer.addEventListener("click", () => {
            currentAngle = 0.0;
            updateSimulation();
        });
    }

    // Align to Nearest Null Point
    if (btnFindNull) {
        btnFindNull.addEventListener("click", () => {
            let thetaOpt = 0.0;
            if (!isWaterMedium) {
                thetaOpt = STANDARD_S * tubeLength * currentConcentration;
            }
            // Find whether 0° or 180° is closer
            const null1 = thetaOpt;
            const null2 = thetaOpt + 180;
            const d1 = Math.abs(currentAngle - null1);
            const d2 = Math.abs(currentAngle - null2);
            currentAngle = d1 < d2 ? null1 : null2;
            updateSimulation();
        });
    }

    // --- 8. TUBE MEDIUM & CONCENTRATION TOGGLES ---
    if (btnMediumWater) {
        btnMediumWater.addEventListener("click", () => {
            isWaterMedium = true;
            btnMediumWater.classList.add("active");
            btnMediumSugar.classList.remove("active");
            sugarParams.style.display = "none";
            updateSimulation();
        });
    }

    if (btnMediumSugar) {
        btnMediumSugar.addEventListener("click", () => {
            isWaterMedium = false;
            btnMediumSugar.classList.add("active");
            btnMediumWater.classList.remove("active");
            sugarParams.style.display = "flex";
            updateSimulation();
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
            sugarConcentrationInput.value = currentConcentration.toFixed(2);

            // Select corresponding row in observation table
            if (currentConcentration === 0.05) activeRowIndex = 1;
            else if (currentConcentration === 0.10) activeRowIndex = 2;
            else if (currentConcentration === 0.15) activeRowIndex = 3;
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

    // --- 9. RECORD READINGS DIRECTLY TO OBSERVATION TABLE ---
    function recordReadingToTable(fieldPrefix, label) {
        const readings = calculateScaleReadings(currentAngle);
        const targetInput = document.getElementById(fieldPrefix + activeRowIndex);
        if (targetInput) {
            targetInput.value = readings.total.toFixed(2);
            targetInput.style.backgroundColor = "#1b4d77";
            setTimeout(() => {
                targetInput.style.backgroundColor = "";
            }, 600);
            recordedBadge.textContent = `✓ Recorded ${label} (${readings.total.toFixed(2)}°) into Row ${activeRowIndex}`;
            calculateAllTableRows();
        }
    }

    const btnRecordWaterCW = document.getElementById("btnRecordWaterCW");
    const btnRecordWaterCCW = document.getElementById("btnRecordWaterCCW");
    const btnRecordSugarCW = document.getElementById("btnRecordSugarCW");
    const btnRecordSugarCCW = document.getElementById("btnRecordSugarCCW");

    if (btnRecordWaterCW) {
        btnRecordWaterCW.addEventListener("click", () => {
            recordReadingToTable("tblWaterCW", "Water Clockwise (a)");
        });
    }
    if (btnRecordWaterCCW) {
        btnRecordWaterCCW.addEventListener("click", () => {
            recordReadingToTable("tblWaterCCW", "Water Anti-Clockwise (b)");
        });
    }
    if (btnRecordSugarCW) {
        btnRecordSugarCW.addEventListener("click", () => {
            recordReadingToTable("tblSugarCW", "Sugar Clockwise (a')");
        });
    }
    if (btnRecordSugarCCW) {
        btnRecordSugarCCW.addEventListener("click", () => {
            recordReadingToTable("tblSugarCCW", "Sugar Anti-Clockwise (b')");
        });
    }

    // --- 10. OBSERVATION TABLE CALCULATION LOGIC ---
    function calculateAllTableRows() {
        const rowData = [];

        for (let i = 1; i <= 3; i++) {
            const conc = parseFloat(document.getElementById("tblConc" + i).value) || 0;
            const wCW = parseFloat(document.getElementById("tblWaterCW" + i).value) || 0;
            const wCCW = parseFloat(document.getElementById("tblWaterCCW" + i).value) || 0;
            const sCW = parseFloat(document.getElementById("tblSugarCW" + i).value) || 0;
            const sCCW = parseFloat(document.getElementById("tblSugarCCW" + i).value) || 0;

            // Difference for CW: theta1 = |sCW - wCW|
            const theta1 = Math.abs(sCW - wCW);
            // Difference for CCW: theta2 = |sCCW - wCCW|
            const theta2 = Math.abs(sCCW - wCCW);
            // Mean theta = (theta1 + theta2) / 2
            const meanTheta = (theta1 + theta2) / 2;

            // Specific rotation S = theta / (l * c)
            let sVal = 0;
            if (conc > 0 && tubeLength > 0) {
                sVal = meanTheta / (tubeLength * conc);
            }

            // Update row display
            document.getElementById("tblWaterAvg" + i).textContent = ((wCW + wCCW) / 2).toFixed(2) + "°";
            document.getElementById("tblSugarAvg" + i).textContent = ((sCW + sCCW) / 2).toFixed(2) + "°";
            document.getElementById("tblTheta1_" + i).textContent = theta1.toFixed(2) + "°";
            document.getElementById("tblTheta2_" + i).textContent = theta2.toFixed(2) + "°";
            document.getElementById("tblMeanTheta" + i).textContent = meanTheta.toFixed(2) + "°";
            document.getElementById("tblSpecific" + i).textContent = sVal.toFixed(2);

            if (conc > 0 && meanTheta > 0) {
                rowData.push({ conc: conc, theta: meanTheta, s: sVal });
            }
        }

        // Summary Statistics
        if (rowData.length > 0) {
            const sumS = rowData.reduce((acc, curr) => acc + curr.s, 0);
            const meanS = sumS / rowData.length;
            const percErr = Math.abs((meanS - STANDARD_S) / STANDARD_S) * 100;

            document.getElementById("finalMeanS").textContent = meanS.toFixed(2);
            document.getElementById("percentageError").textContent = percErr.toFixed(2) + "%";

            // Update Chart.js graph
            updateThetaGraph(rowData);
        }
    }

    // --- 11. PLOT GRAPH: THETA VS CONCENTRATION (AS PER LAB MANUAL PAGE 35) ---
    function updateThetaGraph(points) {
        const canvas = document.getElementById("thetaGraphCanvas");
        if (!canvas || typeof Chart === "undefined") return;

        // Sort by concentration ascending
        points.sort((a, b) => a.conc - b.conc);
        const labels = points.map((p) => p.conc.toFixed(2));
        const thetaVals = points.map((p) => parseFloat(p.theta.toFixed(2)));

        if (chartInstance) {
            chartInstance.destroy();
        }

        const ctx = canvas.getContext("2d");
        chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Observed Optical Rotation θ (°)",
                        data: thetaVals,
                        borderColor: "#49e4a3",
                        backgroundColor: "rgba(73, 228, 163, 0.2)",
                        pointBackgroundColor: "#ffdd53",
                        pointBorderColor: "#ffffff",
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        tension: 0.1,
                        fill: false,
                        borderWidth: 2.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Concentration c (gm/c.c.)",
                            color: "#8dc6f1",
                            font: { size: 12, weight: "bold" }
                        },
                        grid: { color: "#1d3a56" },
                        ticks: { color: "#c1ddf4" }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Angle of Rotation θ (Degrees)",
                            color: "#8dc6f1",
                            font: { size: 12, weight: "bold" }
                        },
                        grid: { color: "#1d3a56" },
                        ticks: { color: "#c1ddf4" },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: "#e8f3ff", font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ` Conc: ${ctx.label} gm/c.c.  |  θ: ${ctx.parsed.y}°`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- 12. RESET & RECALCULATE LISTENERS ---
    if (calculateButton) {
        calculateButton.addEventListener("click", () => {
            calculateAllTableRows();
        });
    }

    if (resetCalculation) {
        resetCalculation.addEventListener("click", () => {
            // Restore default lab readings
            const defaults = [
                { c: 0.05, wCW: 0.0, wCCW: 180.0, sCW: 6.65, sCCW: 186.65 },
                { c: 0.10, wCW: 0.0, wCCW: 180.0, sCW: 13.3, sCCW: 193.3 },
                { c: 0.15, wCW: 0.0, wCCW: 180.0, sCW: 19.95, sCCW: 199.95 }
            ];

            defaults.forEach((d, idx) => {
                const i = idx + 1;
                document.getElementById("tblConc" + i).value = d.c.toFixed(2);
                document.getElementById("tblWaterCW" + i).value = d.wCW.toFixed(2);
                document.getElementById("tblWaterCCW" + i).value = d.wCCW.toFixed(2);
                document.getElementById("tblSugarCW" + i).value = d.sCW.toFixed(2);
                document.getElementById("tblSugarCCW" + i).value = d.sCCW.toFixed(2);
            });

            calculateAllTableRows();
            recordedBadge.textContent = "Table reset to default verified observations.";
        });
    }

    // Connect table input change listeners
    document.querySelectorAll(".tbl-input").forEach((inp) => {
        inp.addEventListener("input", calculateAllTableRows);
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

    // --- 13. INITIALIZATION ---
    generateMainScale();
    generateVernierScale();
    updateSimulation();
    calculateAllTableRows();
})();
