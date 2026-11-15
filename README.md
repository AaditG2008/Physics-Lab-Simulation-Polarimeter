# Virtual Polarimeter Laboratory 🔬
### Experiment No. 07: Determination of Specific Rotation of Cane Sugar using Half-Shade Polarimeter
**Applied Physics Laboratory | Maharaja Agrasen Institute of Technology (MAIT)**

---

## 🌟 Live Demo
You can host and use this virtual lab directly in your browser with **GitHub Pages**:
> 👉 `https://<your-username>.github.io/<your-repo-name>/`

---

## 📖 Overview
This project is an interactive virtual physics simulation designed to study the optical activity and rotation of plane-polarized light through cane sugar solutions using a **Laurent's Half-Shade Polarimeter**.

### Key Features
1. **Interactive Optical Arrangement**:
   - Visual schematic showing monochromatic light source, convex lens, polarizer, half-shade plate, polarimeter tube, analyzer, and telescope.
2. **Circular Analyzer Scale with Vernier**:
   - Realistic 360° circular polarimeter dial with interactive rotation.
   - Main Scale division = `0.5°`.
   - Vernier Scale = `10` divisions spanning 9 MSD.
   - **Least Count = 0.05°**.
   - Digital vernier breakdown (`M.S.R + V.S.R × L.C. = Total Reading`).
   - Fine angle controls (`±0.05°`, `±1.0°`, `±5.0°`) and **"Align to Nearest Null Point"** auto-finder.
3. **Realistic Half-Shade Eyepiece View**:
   - Accurate optical physics: differential brightness based on $\sin^2(\delta \pm \alpha)$.
   - Sensitive equal darkness null detector.
4. **Official Laboratory Observation Table**:
   - Matches the MAIT Applied Physics Lab manual.
   - 16 full columns covering Pure Water readings (CW & CCW), Sugar Solution readings (CW & CCW), Concentration ($5$, $10$, $15\text{ gm/c.c.}$), $\theta_1$, $\theta_2$, and mean $\theta$.
   - **One-click scale recording** into active rows with visual highlight feedback.
   - **Two-way live synchronization**: manually changing $M.S.$ or $V.S.$ updates $Total$; changing $Total$ updates scale divisions.
5. **Real-time Calculations & Graph**:
   - Dynamic calculation of optical rotation and specific rotation ($S$).
   - Interactive Chart.js graph plotting $\theta$ vs. $c$, verifying Biot's law with linear slope.
   - Standard literature comparison ($+66.50^\circ\text{ dm}^{-1}(\text{gm/c.c.})^{-1}$) and percentage error reporting.

---

## 📐 Formulas Used

$$\text{Specific Rotation } S = \frac{\theta}{l \times c}$$

Where:
- $\theta = \frac{\theta_1 + \theta_2}{2}$ (Mean angle of rotation)
- $\theta_1 = |a - a'|$ (Clockwise difference between pure water and sugar solution)
- $\theta_2 = |b - b'|$ (Anti-clockwise difference between pure water and sugar solution)
- $l$ = Length of polarimeter tube ($2.0\text{ dm} = 20\text{ cm}$)
- $c$ = Concentration of cane sugar solution in $\text{gm/c.c.}$

---

## 🚀 How to Run Locally

No installations, build steps, or local server packages required!

1. Download or clone this repository:
   ```bash
   git clone https://github.com/<your-username>/<your-repo-name>.git
   ```
2. Navigate into the folder:
   ```bash
   cd "project physics"
   ```
3. Open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Firefox, Brave, Safari):
   - **Windows**: Double-click `index.html` or run `start index.html` in PowerShell.
   - **Mac**: Run `open index.html` in Terminal.
   - **Linux**: Run `xdg-open index.html`.

---

## 📁 Repository Structure
```
├── index.html     # Main application layout, apparatus, dial, observation table, and charts
├── style.css      # Modern dark-theme lab stylesheet, responsive table, and dial aesthetics
├── script.js      # Simulation physics, Vernier scale math, real-time table sync, and Chart.js integration
├── .gitignore     # Ignores system temporary files
└── README.md      # Documentation and project manual
```

---

## 👥 Credits
**Program Made By — TEAM GALAXY**  
*MAIT | Applied Physics Laboratory*
