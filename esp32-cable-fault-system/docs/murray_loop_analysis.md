# Murray-Loop Fault Localization & Thermal Compensation Analysis
**Project:** ESP32-Based Automated Cable Fault Detection and Localization System  
**Document:** Analytical Derivations, Topologies, Thermal Corrections, and Error Analysis  

---

## 1. Classical Murray Loop Fault Localization Principle

### 1.1 Field Circuit Topology
The Murray Loop test is a classical bridge method specifically developed for locating single line-to-ground faults or core-to-sheath faults in underground power and communication cables.

In the standard field configuration:
1. **Two Conductors Required:** The installation requires the faulted cable conductor (core under test) and a healthy/sound return conductor running parallel to it (often a healthy phase core in the same multicore cable, or a parallel cable).
2. **Far-End Loop:** At the far end of the cable (at distance $L$), the sound conductor and faulty conductor are solidly bonded together with a low-resistance jumper strap.
3. **Total Conductor Path:** The total looped conductor length is:
   $$L_{\text{total}} = 2L$$
4. **Near-End Bridge:** At the test station (near end), two adjustable or fixed ratio arms $R_1$ and $R_2$ are connected between the supply and the two conductor ends.
5. **Detector / Null Indicator:** A sensitive galvanometer (or modern ADC/differential amplifier) is connected across the near-end terminals of the two cable conductors.
6. **Ground Return:** The power supply (battery or DC rail) is connected between the bridge junction and physical earth (GND). The fault itself acts as the internal bridge node connected to earth!

```
                  +---[ R1 ]---+---- Sound Conductor (Length L) ----+
                  |            |                                    | Far-End
          ( + )---|            ( Vout )                             | Shorting Loop
      Bridge      |            |                                    |
      Supply      +---[ R2 ]---+---- Faulted Conductor (Length L) --+
          ( - )                |           |
            |                 Near End     | Fault (at Lf)
           GND ----------------------------+ (Earth ground path)
```

### 1.2 Mathematical Derivation of the Classical Murray Equation
Let:
- $L$ = Total one-way cable length (metres).
- $2L$ = Total looped conductor length (metres).
- $r$ = Linear resistance density of the uniform conductor ($\Omega/\text{m}$).
- $L_f$ = Distance from the near-end test terminal to the fault (metres).
- $R_x$ = Conductor resistance from the near-end of the faulted core to the fault:
  $$R_x = r \cdot L_f$$
- $R_y$ = Conductor resistance from the near-end of the sound core, through the far end, to the fault:
  $$R_y = r \cdot (2L - L_f)$$

At bridge balance (null condition, $V_{\text{out}} = 0$):
$$\frac{R_1}{R_2} = \frac{R_y}{R_x} = \frac{r(2L - L_f)}{r \cdot L_f} = \frac{2L - L_f}{L_f}$$

Add $1$ to both sides of the equation:
$$\frac{R_1}{R_2} + 1 = \frac{2L - L_f}{L_f} + 1$$
$$\frac{R_1 + R_2}{R_2} = \frac{2L - L_f + L_f}{L_f} = \frac{2L}{L_f}$$

Inverting both sides:
$$\frac{R_2}{R_1 + R_2} = \frac{L_f}{2L}$$

Multiplying by $2L$ yields the famous **Murray-Loop Fault Distance Equation**:

$$L_f = \frac{2L \cdot R_2}{R_1 + R_2}$$

---

## 2. Meaning of Variables & Direction of Measurement

1. **$L$ (Cable Length):**  
   The physical length of the cable under test (from test station to far end terminal). Units: metres ($\text{m}$).
2. **$R_1$ and $R_2$ (Bridge Arm Resistances):**  
   - $R_2$ is the ratio arm connected directly to the **faulted cable core** at the near end.
   - $R_1$ is the ratio arm connected to the **sound return cable core** at the near end.
   - Units: ohms ($\Omega$).
3. **$L_f$ (Fault Distance):**  
   The estimated distance from the **near-end test station** along the faulted cable to the ground fault location. Units: metres ($\text{m}$).
4. **Valid Range:**  
   $0 \le L_f \le L$.
   - If $L_f = 0\text{ m}$ (fault at near-end terminal): $R_2 = 0\ \Omega$.
   - If $L_f = L$ (fault at far end): $R_2 = R_1$.

---

## 3. Topologies: Laboratory Breadboard Rig vs. Field Loop

### 3.1 The Laboratory Demonstrator Rig (`power electronics.jpeg`)
In the student's hardware rig:
- Node A connects to a discrete resistor ladder ($10 \times 100\ \Omega = 1000\ \Omega$ to ground).
- Node B connects to the MCP4131 digital potentiometer to ground.
- When the fault relay closes at tap #4 (400 $\Omega$ from Node A), the resistance to ground drops to $400\ \Omega$.
- At bridge balance ($V_A = V_B$), the digital potentiometer matches the grounded cable section:
  $$R_{\text{pot}} = R_{\text{cable\_ground}}$$
- Direct fault distance relationship on this breadboard rig:
  $$L_f = \left(\frac{R_{\text{pot}}}{R_{\text{cable\_total}}}\right) \cdot L$$
  For $R_{\text{pot}} = 400\ \Omega$, $R_{\text{cable\_total}} = 1000\ \Omega$, $L = 10\text{ m}$:
  $$L_f = \frac{400}{1000} \times 10\text{ m} = 4.0\text{ m}$$

### 3.2 Dual Compatibility in Firmware and Simulation Engine
To ensure complete academic accuracy and full syllabus compliance with the student's presentation (Slide 11) and original Arduino code, our simulation engine and firmware support:
1. **Ratio Arm Murray Formulation:**  
   $R_1$ and $R_2$ are configured to represent the bridge balance arms:
   $$L_f = \frac{2L \cdot R_2}{R_1 + R_2}$$
2. **Direct Breadboard Mode:**  
   The digital pot directly balances the ladder tap resistance, and the calculated position is cross-verified against the discrete tap position.

---

## 4. Temperature Compensation

### 4.1 Theoretical Principle
Conductor electrical resistance varies directly with ambient and operating temperature according to:

$$R(T) = R_0 \left[1 + \alpha (T - T_0)\right]$$

Where:
- $T_0 = 25^\circ\text{C}$ (Standard reference temperature, $298.15\text{ K}$)
- $R_0$ = Conductor resistance at $T_0$
- $T$ = Real-time temperature measured by the NTC thermistor ($^\circ\text{C}$)
- $\alpha$ = Conductor temperature coefficient of resistance ($1/^\circ\text{C}$ or $1/\text{K}$)

| Material | Resistivity $\rho_0$ ($\Omega\cdot\text{m}$ at $25^\circ\text{C}$) | Temp. Coeff. $\alpha$ ($1/^\circ\text{C}$) | Notes |
| :--- | :--- | :--- | :--- |
| **Annealed Copper** | $1.68 \times 10^{-8}$ | $0.00393$ | Standard power cable conductor |
| **Hard-Drawn Copper**| $1.77 \times 10^{-8}$ | $0.00381$ | Overhead & aerial conductors |
| **Aluminum (EC grade)** | $2.82 \times 10^{-8}$ | $0.00403$ | Common underground distribution cable |

### 4.2 Where Should Temperature Compensation Be Applied?
A fundamental question in electrical instrumentation is:  
*Does temperature compensation affect the Murray ratio equation?*

1. **Uniform Temperature Along Entire Loop:**  
   If both the sound conductor and faulted conductor are inside the same underground trench or multicore jacket at uniform temperature $T$:
   $$r(T) = r_0 [1 + \alpha (T - T_0)]$$
   $$\frac{R_y}{R_x} = \frac{r(T) \cdot (2L - L_f)}{r(T) \cdot L_f} = \frac{2L - L_f}{L_f}$$
   The temperature factor $[1 + \alpha (T - T_0)]$ **cancels algebraically** out of the pure ratio!
2. **When Temperature Compensation IS Essential:**  
   - **Absolute Resistance Calculation:** When converting the measured balanced potentiometer resistance $R_{\text{pot}}$ into an absolute conductor length ($L_f = R_{\text{pot}} / r(T)$). If $r_0$ at $25^\circ\text{C}$ is used when the ground temperature is $45^\circ\text{C}$, the estimated distance will have an error of:
     $$\Delta L = 0.00393 \times (45 - 25) = +7.86\% \text{ error!}$$
     Applying thermal correction:
     $$r(T) = r_0 \left[1 + \alpha (T - T_0)\right] \implies L_f = \frac{R_{\text{pot}}}{r(T)}$$
     restores true physical distance accuracy.
   - **Non-Uniform Loop Temperature:** When the sound return conductor runs along a separate trench or surface conduit at temperature $T_{\text{sound}}$, while the faulted cable is underground at $T_{\text{fault}}$.
   - **Resistor Ladder Breadboard Simulation:** On breadboard rigs where carbon or metal-film resistors are heated or cooled, their thermal drift modifies the bridge balance point.

In our firmware:
$$\text{Correction Factor } k_T = 1.0 + \alpha (T - T_0)$$
$$R_{\text{corrected}} = \frac{R_{\text{measured}}}{k_T}$$
$$L_f = \frac{2L \cdot R_{2,\text{corrected}}}{R_{1,\text{corrected}} + R_{2,\text{corrected}}}$$

---

## 5. Error Metrics and Accuracy Analysis

To benchmark the automated fault detection system, the following mathematical error metrics are evaluated at every measurement cycle:

### 5.1 Absolute Distance Error ($\Delta L$)
$$\Delta L = |L_{f,\text{estimated}} - L_{\text{reference}}| \quad (\text{metres})$$

### 5.2 Percentage Distance Error ($\% \text{ Error}$)
When the reference fault distance $L_{\text{reference}} > 0$:

$$\% \text{ Error} = \frac{|L_{f,\text{estimated}} - L_{\text{reference}}|}{L_{\text{reference}}} \times 100\%$$

When $L_{\text{reference}} = 0$:
$$\% \text{ Error} = 0.0\% \quad (\text{if } L_f \le \epsilon), \quad \text{otherwise defined as } \frac{|L_f|}{L} \times 100\%$$

### 5.3 Sources of Practical Measurement Uncertainty
1. **MCP4131 Quantization:** Step resolution $\approx 78.1\ \Omega$ limits continuous null seeking.
2. **Parasitic Wiper Resistance:** $R_W \approx 75\ \Omega$ sets the lower resistance bound.
3. **LM358 Single-Supply Saturation:** Ground clamping prevents detection of negative bridge imbalance.
4. **ESP32 ADC Quantization & Non-Linearity:** 12-bit SAR ADC noise and INL errors.
5. **Connecting Lead Wire Resistance:** Resistance of test clips ($R_{\text{leads}}$) adds to the bridge arms unless four-wire Kelvin connections or null offset calibrations are applied.
