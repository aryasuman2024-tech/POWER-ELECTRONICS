# Mathematical & Electrical Simulation Model
**Project:** ESP32-Based Automated Cable Fault Detection and Localization System  
**Document:** Analytical Derivations, Component Transfer Functions, and Electrical Modeling  

---

## 1. Conductor & Cable Electrical Model

### 1.1 Baseline Conductor Resistance
A uniform conductor of length $L$ (metres), cross-sectional area $A$ ($\text{m}^2$), and material resistivity $\rho_0$ ($\Omega\cdot\text{m}$) at reference temperature $T_0 = 25^\circ\text{C}$ ($298.15\text{ K}$) has a total baseline resistance:

$$R_0 = \rho_0 \frac{L}{A} = r_0 \cdot L$$

Where $r_0 = \frac{R_0}{L}$ is the linear resistance density ($\Omega/\text{m}$).

For the educational hardware rig presented in `power electronics.jpeg`:
- The cable is physically constructed from ten series $100\ \Omega$ resistors, representing a total cable length of $L = 10\text{ m}$.
- The nominal linear resistance density is:
  $$r_0 = \frac{1000\ \Omega}{10\text{ m}} = 100\ \Omega/\text{m}$$

### 1.2 Thermal Drift Model
Conductor resistivity increases with temperature according to the linear temperature coefficient $\alpha$ ($1/\text{K}$ or $1/^\circ\text{C}$):

$$R_{\text{cable}}(T) = R_0 \left[1 + \alpha (T - T_0)\right]$$

Material property constants:
- **Copper (Annealed):** $\rho_0 = 1.68 \times 10^{-8}\ \Omega\cdot\text{m}$, $\alpha = 0.00393\ \text{K}^{-1}$
- **Aluminum (EC-grade):** $\rho_0 = 2.82 \times 10^{-8}\ \Omega\cdot\text{m}$, $\alpha = 0.00403\ \text{K}^{-1}$

---

## 2. Fault Network Modeling

Let a fault occur at distance $L_f$ ($0 \le L_f \le L$) from the near-end terminal (Node A).
The cable is split into two sections:
1. **Near-end to fault section:** Length $L_f$, with conductor resistance:
   $$R_f^{\text{cable}}(T) = \left(\frac{L_f}{L}\right) R_{\text{cable}}(T)$$
2. **Fault to far-end section:** Length $(L - L_f)$, with conductor resistance:
   $$R_{\text{rem}}^{\text{cable}}(T) = \left(\frac{L - L_f}{L}\right) R_{\text{cable}}(T)$$

### 2.1 Fault Path to Ground
A ground fault introduces a fault resistance $R_{\text{fault}}$ between the conductor core and physical ground (earth).
- **Bolted Ground Fault (Dead Short):** $R_{\text{fault}} = 0\ \Omega$.
- **High-Resistance / Degradation Fault:** $0 < R_{\text{fault}} < \infty$.

In the breadboard rig shown in `power electronics.jpeg`:
- Resistor 10's bottom terminal is tied to GND.
- When the fault relay energizes at tap #4 ($L_f = 4\text{ m}$), tap 4 connects through the relay contacts (and any fault resistance $R_{\text{fault}}$) to GND.
- The equivalent resistance from Node A to GND is:
  $$R_A(T) = R_f^{\text{cable}}(T) + \left( R_{\text{fault}} \parallel R_{\text{rem}}^{\text{cable}}(T) \right)$$
  $$R_A(T) = R_f^{\text{cable}}(T) + \frac{R_{\text{fault}} \cdot R_{\text{rem}}^{\text{cable}}(T)}{R_{\text{fault}} + R_{\text{rem}}^{\text{cable}}(T)}$$

*Special Cases:*
- When $R_{\text{fault}} = 0\ \Omega$ (Bolted Fault):
  $$R_A(T) = R_f^{\text{cable}}(T) + 0 = \left(\frac{L_f}{L}\right) R_{\text{cable}}(T)$$
  The remaining cable section is completely bypassed. For tap 4 ($L_f = 4\text{ m}$, $T = 25^\circ\text{C}$):
  $$R_A = 4 \times 100\ \Omega = 400\ \Omega$$
- When healthy ($R_{\text{fault}} \to \infty$ or relay open):
  $$R_A(T) = R_{\text{cable}}(T) = 1000\ \Omega$$

---

## 3. Wheatstone Bridge Equations

The bridge is excited by the regulated $V_{\text{bridge}} = 3.3\text{V}$ rail.

### 3.1 Node A Voltage ($V_A$)
Node A forms a voltage divider between the fixed top resistor $R_{\text{top1}} = 1000\ \Omega$ and the equivalent cable-to-ground resistance $R_A$:

$$V_A = V_{\text{bridge}} \cdot \frac{R_A}{R_{\text{top1}} + R_A}$$

### 3.2 Node B Voltage ($V_B$)
Node B forms a voltage divider between the fixed top resistor $R_{\text{top2}} = 1000\ \Omega$ and the MCP4131 digital potentiometer resistance to ground $R_{\text{pot}}$:

$$V_B = V_{\text{bridge}} \cdot \frac{R_{\text{pot}}}{R_{\text{top2}} + R_{\text{pot}}}$$

### 3.3 Theoretical Bridge Imbalance Voltage
The true differential imbalance across the detector nodes is:

$$\Delta V_{\text{bridge}} = V_B - V_A = V_{\text{bridge}} \left[ \frac{R_{\text{pot}}}{R_{\text{top2}} + R_{\text{pot}}} - \frac{R_A}{R_{\text{top1}} + R_A} \right]$$

At the **Null (Balanced) Condition**:
$$\Delta V_{\text{bridge}} = 0 \iff V_B = V_A \iff \frac{R_{\text{pot}}}{R_{\text{top2}} + R_{\text{pot}}} = \frac{R_A}{R_{\text{top1}} + R_A}$$

Since $R_{\text{top1}} = R_{\text{top2}} = 1000\ \Omega$, this simplifies directly to:
$$R_{\text{pot}} = R_A$$

---

## 4. MCP4131 Digital Potentiometer Mathematical Model

The MCP4131 is a 7-bit digital potentiometer with:
- $N_{\text{steps}} = 128$ steps (129 wiper tap positions $w \in \{0, 1, 2, \dots, 128\}$).
- Nominal end-to-end resistance $R_{AB} = 10,000\ \Omega$.
- Parasitic internal wiper resistance $R_W \approx 75\ \Omega$ (typical).

### 4.1 Transfer Function (POA to Wiper)
As wired in `power electronics.jpeg`:
- Pin 5 (POA) connects to Node B.
- Pin 6 (Wiper) connects to Common GND.
- Pin 7 (POB) is floating (NC).

The active resistance between POA and Wiper as a function of discrete wiper position $w$ is:

$$R_{\text{pot}}(w) = R_{AB} \cdot \left( \frac{128 - w}{128} \right) + R_W$$

- At $w = 0$ (Wiper at Terminal B):
  $$R_{\text{pot}}(0) = 10,000\ \Omega + 75\ \Omega = 10,075\ \Omega$$
- At $w = 128$ (Wiper at Terminal A):
  $$R_{\text{pot}}(128) = 0 + 75\ \Omega = 75\ \Omega$$
- Step resolution ($\Delta R$):
  $$\Delta R = \frac{R_{AB}}{128} = \frac{10,000}{128} = 78.125\ \Omega/\text{step}$$

### 4.2 Inversion: Required Wiper Position for Balance
To achieve balance ($R_{\text{pot}} \approx R_A$):

$$w_{\text{target}} = \text{round}\left( 128 - \frac{R_A - R_W}{R_{AB}} \cdot 128 \right)$$

Clamped to $0 \le w_{\text{target}} \le 128$.

---

## 5. LM358N Operational Amplifier Signal Conditioning Model

### 5.1 Differential Amplifier Topology
The circuit uses four $10\text{ k}\Omega$ precision resistors:
- $R_{in1} = 10\text{ k}\Omega$ from Node A to inverting pin 2.
- $R_f = 10\text{ k}\Omega$ feedback from pin 1 to pin 2.
- $R_{in2} = 10\text{ k}\Omega$ from Node B to non-inverting pin 3.
- $R_g = 10\text{ k}\Omega$ from pin 3 to GND.

The ideal closed-loop voltage gain is:
$$A_v = \frac{R_f}{R_{in1}} = \frac{10\text{ k}\Omega}{10\text{ k}\Omega} = 1.0\text{ V/V}$$

Ideal output:
$$V_{\text{out, ideal}} = A_v \cdot (V_B - V_A) = V_B - V_A$$

### 5.2 Real-World Operational Amplifier Constraints
The physical LM358N is powered between $V_{CC} = 3.3\text{V}$ and $V_{EE} = 0\text{V}$ (single supply).
1. **Low-Rail Saturation ($V_{OL}$):**  
   The output stage consists of an NPN pull-down transistor and $50\ \mu\text{A}$ current sink. It cannot swing below ground.
   $$V_{\text{out, min}} = V_{OL} \approx 5\text{ mV} \text{ to } 20\text{ mV}$$
   If $V_B < V_A$, the ideal output is negative, but the physical op-amp clamps at $V_{OL}$.
2. **High-Rail Saturation ($V_{OH}$):**  
   The Darlington NPN pull-up stage drops approximately $1.2\text{V}$ to $1.5\text{V}$ below $V_{CC}$.
   $$V_{\text{out, max}} = V_{OH} \approx V_{CC} - 1.2\text{V} \approx 2.1\text{V}$$
3. **Input Common-Mode Range ($V_{ICMR}$):**  
   For LM358 on $3.3\text{V}$, $V_{ICMR} = 0\text{V}$ to $(V_{CC} - 1.5\text{V}) = 1.8\text{V}$.
   In our bridge, $V_A$ and $V_B$ sit between $0.2\text{V}$ and $1.65\text{V}$, safely inside the common-mode window.
4. **Input Offset Voltage ($V_{OS}$):**  
   Typ: $\pm 2\text{ mV}$, Max: $\pm 7\text{ mV}$.

The physical simulation transfer function for the LM358N stage is:

$$V_{\text{out, conditioned}} = \text{clamp}\left( (V_B - V_A) + V_{OS},\ V_{OL},\ V_{OH} \right)$$

---

## 6. NTC Thermistor Thermal Model

### 6.1 Temperature-to-Resistance Function
The NTC thermistor is modeled using the classical B-parameter equation:

$$R_{\text{NTC}}(T) = R_0 \cdot \exp\left[ \beta \left( \frac{1}{T} - \frac{1}{T_0} \right) \right]$$

Where:
- $R_0 = 10,000\ \Omega$ at $T_0 = 298.15\text{ K}$ ($25^\circ\text{C}$).
- $\beta = 3950\text{ K}$.
- $T$ is temperature in Kelvin ($T[\text{K}] = T[^\circ\text{C}] + 273.15$).

### 6.2 Voltage Divider to ADC
The NTC is wired with fixed resistor $R_{\text{div}} = 10,000\ \Omega$ between the NTC node and GND:

$$V_{\text{NTC}} = V_{\text{bridge}} \cdot \frac{R_{\text{div}}}{R_{\text{NTC}}(T) + R_{\text{div}}}$$

### 6.3 Inversion: Voltage to Measured Temperature
From the ADC measurement of $V_{\text{NTC}}$:

$$R_{\text{NTC, measured}} = R_{\text{div}} \cdot \left( \frac{V_{\text{bridge}}}{V_{\text{NTC}}} - 1 \right)$$

$$T_{\text{measured}}[\text{K}] = \frac{1}{\frac{1}{T_0} + \frac{1}{\beta} \ln\left( \frac{R_{\text{NTC, measured}}}{R_0} \right)}$$

$$T_{\text{measured}}[^\circ\text{C}] = T_{\text{measured}}[\text{K}] - 273.15$$

---

## 7. ESP32 ADC Quantization and Noise Model

The ESP32 microcontroller features a 12-bit successive-approximation register (SAR) ADC.

### 7.1 Quantization
$$\text{ADC Counts} = \text{round}\left( \frac{V_{\text{input}}}{V_{\text{ref}}} \times 4095 \right)$$

Where $V_{\text{ref}} = 3.3\text{V}$.
Least Significant Bit resolution ($V_{\text{LSB}}$):
$$V_{\text{LSB}} = \frac{3.3\text{V}}{4096} \approx 0.8057\text{ mV}$$

### 7.2 Measurement Noise & Quantization
$$\tilde{V}_{\text{ADC}} = \text{clamp}\left( \text{round}\left( \frac{V_{\text{conditioned}} + \mathcal{N}(0, \sigma^2)}{V_{\text{LSB}}} \right) \times V_{\text{LSB}},\ 0,\ 3.3 \right)$$

Where $\sigma \approx 2.5\text{ mV}$ models thermal and electronic acquisition noise.
