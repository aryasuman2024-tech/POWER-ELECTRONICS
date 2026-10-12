/**
 * ============================================================================
 * ESP32 CABLE FAULT DETECTION - DASHBOARD CONTROLLER & UI APP
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new CableFaultSimulationEngine();

  // Operating Mode
  let isHardwareMode = false;
  let isRunning = true;
  let autoBalancingActive = false;
  let simulationTimer = null;
  let serialPort = null;
  let serialReader = null;

  // Chart Buffers (max 50 points)
  const MAX_POINTS = 50;
  const timeLabels = [];
  const voltageData = [];
  const potResistanceData = [];
  const cableResistanceData = [];
  const temperatureData = [];

  // Measurement Records for CSV Export
  const measurementRecords = [];

  // DOM Elements
  const elStatusPill = document.getElementById('status-pill');
  const elModeBadge = document.getElementById('mode-badge');
  const elBtnBalance = document.getElementById('btn-balance');
  const elBtnPause = document.getElementById('btn-pause');
  const elBtnReset = document.getElementById('btn-reset');
  const elBtnRelay = document.getElementById('btn-relay');
  const elBtnExport = document.getElementById('btn-export');
  const elBtnSerial = document.getElementById('btn-serial');

  // Meters
  const valVout = document.getElementById('val-vout');
  const valDistEst = document.getElementById('val-dist-est');
  const valDistRef = document.getElementById('val-dist-ref');
  const valErrAbs = document.getElementById('val-err-abs');
  const valErrPct = document.getElementById('val-err-pct');
  const valPotPos = document.getElementById('val-pot-pos');
  const valPotRes = document.getElementById('val-pot-res');
  const valTemp = document.getElementById('val-temp');
  const valSteps = document.getElementById('val-steps');

  // LEDs
  const ledGreen = document.getElementById('led-green');
  const ledRed = document.getElementById('led-red');
  const ledAmber = document.getElementById('led-amber');

  // Sliders & Inputs
  const inputCableLen = document.getElementById('input-cable-len');
  const inputFaultDist = document.getElementById('input-fault-dist');
  const inputFaultRes = document.getElementById('input-fault-res');
  const inputTemp = document.getElementById('input-temp');
  const selectMaterial = document.getElementById('select-material');

  const lblCableLen = document.getElementById('lbl-cable-len');
  const lblFaultDist = document.getElementById('lbl-fault-dist');
  const lblFaultRes = document.getElementById('lbl-fault-res');
  const lblTemp = document.getElementById('lbl-temp');

  // Visualizer
  const visualTrackFaulted = document.getElementById('visual-track-faulted');
  const visualPinMarker = document.getElementById('visual-pin-marker');
  const visualPinText = document.getElementById('visual-pin-text');

  // History Table
  const tableBody = document.getElementById('table-body');

  // Canvas Oscilloscopes
  const canvasVoltage = document.getElementById('canvas-voltage');
  const ctxVoltage = canvasVoltage.getContext('2d');
  const canvasResistance = document.getElementById('canvas-resistance');
  const ctxResistance = canvasResistance.getContext('2d');

  // --------------------------------------------------------------------------
  // INPUT EVENT LISTENERS
  // --------------------------------------------------------------------------
  inputCableLen.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    engine.cableLength = val;
    lblCableLen.textContent = `${val.toFixed(1)} m`;
    inputFaultDist.max = val;
    if (parseFloat(inputFaultDist.value) > val) {
      inputFaultDist.value = val;
      engine.faultDistance = val;
      lblFaultDist.textContent = `${val.toFixed(1)} m`;
    }
    updateVisualizer();
  });

  inputFaultDist.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    engine.faultDistance = val;
    lblFaultDist.textContent = `${val.toFixed(1)} m`;
    updateVisualizer();
  });

  inputFaultRes.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    engine.faultResistance = val;
    lblFaultRes.textContent = `${val.toFixed(1)} Ω`;
  });

  inputTemp.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    engine.temperature = val;
    lblTemp.textContent = `${val.toFixed(1)} °C`;
  });

  selectMaterial.addEventListener('change', (e) => {
    engine.conductorMaterial = e.target.value;
  });

  // Buttons
  elBtnBalance.addEventListener('click', () => {
    engine.startBalancing();
    autoBalancingActive = true;
    updateStatusUI('SEARCHING');
  });

  elBtnPause.addEventListener('click', () => {
    isRunning = !isRunning;
    elBtnPause.textContent = isRunning ? 'Pause Sim' : 'Resume Sim';
    elBtnPause.classList.toggle('btn-primary', !isRunning);
  });

  elBtnReset.addEventListener('click', () => {
    engine.resetSimulation();
    autoBalancingActive = false;
    updateStatusUI('IDLE');
  });

  elBtnRelay.addEventListener('click', () => {
    engine.relayActive = !engine.relayActive;
    elBtnRelay.textContent = engine.relayActive ? 'Clear Fault (Relay OFF)' : 'Inject Fault (Relay ON)';
    elBtnRelay.classList.toggle('btn-danger', engine.relayActive);
    updateVisualizer();
  });

  elBtnExport.addEventListener('click', exportCSV);

  // Web Serial API (Optional live ESP32 connection)
  if (navigator.serial) {
    elBtnSerial.addEventListener('click', connectWebSerial);
  } else {
    elBtnSerial.title = 'Web Serial API is available in Chrome/Edge over HTTPS/localhost';
  }

  // --------------------------------------------------------------------------
  // VISUALIZER UPDATE
  // --------------------------------------------------------------------------
  function updateVisualizer() {
    const frac = Math.max(0, Math.min(1, engine.faultDistance / engine.cableLength));
    const pct = (frac * 100).toFixed(1);

    if (engine.relayActive) {
      visualTrackFaulted.style.width = `${pct}%`;
      visualPinMarker.style.left = `${pct}%`;
      visualPinMarker.style.display = 'flex';
      visualPinText.textContent = `Fault: ${engine.faultDistance.toFixed(1)}m`;
    } else {
      visualTrackFaulted.style.width = '0%';
      visualPinMarker.style.display = 'none';
    }
  }

  // --------------------------------------------------------------------------
  // UI UPDATE LOOP
  // --------------------------------------------------------------------------
  function tick() {
    if (!isRunning) return;

    let state;
    if (autoBalancingActive && engine.status === 'SEARCHING') {
      state = engine.stepBalancing();
      if (engine.status === 'BALANCED' || engine.status.includes('ERROR')) {
        autoBalancingActive = false;
      }
    } else {
      state = engine.calculateState();
    }

    updateMeters(state);
    updateCharts(state);
    recordTelemetry(state);
  }

  function updateMeters(state) {
    valVout.textContent = (state.vDiff * 1000).toFixed(1);
    valDistEst.textContent = state.estimatedDistance.toFixed(3);
    valDistRef.textContent = state.referenceDistance.toFixed(3);
    valErrAbs.textContent = state.absError.toFixed(3);
    valErrPct.textContent = state.pctError.toFixed(2);
    valPotPos.textContent = `${state.potPosition} / 128`;
    valPotRes.textContent = state.rPot.toFixed(1);
    valTemp.textContent = state.temperature.toFixed(1);
    valSteps.textContent = state.stepCount;

    // LED status indicators
    ledGreen.className = 'led-lamp green' + (state.status === 'BALANCED' ? ' on' : '');
    ledAmber.className = 'led-lamp amber' + (state.status === 'SEARCHING' ? ' on' : '');
    ledRed.className = 'led-lamp red' + (state.status.includes('ERROR') || engine.relayActive ? ' on' : '');

    updateStatusUI(state.status);
  }

  function updateStatusUI(status) {
    elStatusPill.className = `status-pill ${status.toLowerCase()}`;
    elStatusPill.textContent = status;
  }

  // --------------------------------------------------------------------------
  // CANVAS OSCILLOSCOPES / CHARTS
  // --------------------------------------------------------------------------
  function updateCharts(state) {
    voltageData.push(state.vDiff);
    potResistanceData.push(state.rPot);
    cableResistanceData.push(state.rCableGnd);

    if (voltageData.length > MAX_POINTS) {
      voltageData.shift();
      potResistanceData.shift();
      cableResistanceData.shift();
    }

    drawVoltageScope();
    drawResistanceScope();
  }

  function drawVoltageScope() {
    const w = canvasVoltage.width;
    const h = canvasVoltage.height;
    ctxVoltage.fillStyle = '#090d16';
    ctxVoltage.fillRect(0, 0, w, h);

    // Center Zero line
    ctxVoltage.strokeStyle = '#1e293b';
    ctxVoltage.lineWidth = 1;
    ctxVoltage.beginPath();
    ctxVoltage.moveTo(0, h / 2);
    ctxVoltage.lineTo(w, h / 2);
    ctxVoltage.stroke();

    // Threshold bands (±50 mV)
    const threshY1 = h / 2 - (0.05 / 2.0) * (h / 2);
    const threshY2 = h / 2 + (0.05 / 2.0) * (h / 2);
    ctxVoltage.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctxVoltage.fillRect(0, threshY1, w, threshY2 - threshY1);

    if (voltageData.length < 2) return;

    // Plot Vdiff curve
    ctxVoltage.strokeStyle = '#38bdf8';
    ctxVoltage.lineWidth = 2;
    ctxVoltage.beginPath();

    const dx = w / (MAX_POINTS - 1);
    for (let i = 0; i < voltageData.length; i++) {
      const v = voltageData[i];
      // Scale: -2.0V to +2.0V maps to [h, 0]
      const y = h / 2 - (v / 2.0) * (h / 2);
      if (i === 0) ctxVoltage.moveTo(0, y);
      else ctxVoltage.lineTo(i * dx, y);
    }
    ctxVoltage.stroke();
  }

  function drawResistanceScope() {
    const w = canvasResistance.width;
    const h = canvasResistance.height;
    ctxResistance.fillStyle = '#090d16';
    ctxResistance.fillRect(0, 0, w, h);

    if (potResistanceData.length < 2) return;

    const dx = w / (MAX_POINTS - 1);

    // Cable Resistance Line (Amber)
    ctxResistance.strokeStyle = '#f59e0b';
    ctxResistance.lineWidth = 1.5;
    ctxResistance.setLineDash([4, 4]);
    ctxResistance.beginPath();
    for (let i = 0; i < cableResistanceData.length; i++) {
      const r = cableResistanceData[i];
      const y = h - (r / 2000.0) * h;
      if (i === 0) ctxResistance.moveTo(0, y);
      else ctxResistance.lineTo(i * dx, y);
    }
    ctxResistance.stroke();
    ctxResistance.setLineDash([]);

    // Pot Resistance Line (Green)
    ctxResistance.strokeStyle = '#10b981';
    ctxResistance.lineWidth = 2;
    ctxResistance.beginPath();
    for (let i = 0; i < potResistanceData.length; i++) {
      const r = potResistanceData[i];
      const y = h - (r / 2000.0) * h;
      if (i === 0) ctxResistance.moveTo(0, y);
      else ctxResistance.lineTo(i * dx, y);
    }
    ctxResistance.stroke();
  }

  // --------------------------------------------------------------------------
  // TELEMETRY RECORDING & CSV EXPORT
  // --------------------------------------------------------------------------
  let recordCounter = 0;
  function recordTelemetry(state) {
    recordCounter++;
    if (recordCounter % 5 !== 0) return; // Record every 500 ms

    const record = {
      timestamp: Date.now(),
      bridge_voltage: state.vDiff.toFixed(4),
      R1: state.r1.toFixed(2),
      R2: state.r2.toFixed(2),
      temperature: state.temperature.toFixed(2),
      estimated_fault_distance: state.estimatedDistance.toFixed(3),
      reference_fault_distance: state.referenceDistance.toFixed(3),
      distance_error: state.absError.toFixed(3),
      pot_position: state.potPosition,
      status: state.status
    };

    measurementRecords.push(record);
    if (measurementRecords.length > 200) measurementRecords.shift();

    // Add table row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${record.timestamp % 100000}</td>
      <td>${record.bridge_voltage}</td>
      <td>${record.R2}</td>
      <td>${record.estimated_fault_distance}</td>
      <td>${record.distance_error}</td>
      <td>${record.pot_position}</td>
      <td><span class="status-pill ${record.status.toLowerCase()}">${record.status}</span></td>
    `;
    tableBody.insertBefore(tr, tableBody.firstChild);
    if (tableBody.children.length > 25) {
      tableBody.removeChild(tableBody.lastChild);
    }
  }

  function exportCSV() {
    if (measurementRecords.length === 0) {
      alert('No measurements recorded yet.');
      return;
    }
    const headers = [
      'timestamp',
      'bridge_voltage',
      'R1',
      'R2',
      'temperature',
      'estimated_fault_distance',
      'reference_fault_distance',
      'distance_error',
      'pot_position',
      'status'
    ];
    const rows = measurementRecords.map(r => [
      r.timestamp,
      r.bridge_voltage,
      r.R1,
      r.R2,
      r.temperature,
      r.estimated_fault_distance,
      r.reference_fault_distance,
      r.distance_error,
      r.pot_position,
      r.status
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cable_fault_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --------------------------------------------------------------------------
  // WEB SERIAL API (Physical ESP32 Live Link)
  // --------------------------------------------------------------------------
  async function connectWebSerial() {
    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 115200 });

      isHardwareMode = true;
      elModeBadge.textContent = 'MODE: LIVE HARDWARE (ESP32 COM)';
      elModeBadge.classList.add('live');
      elBtnSerial.textContent = 'Disconnect ESP32';
      elBtnSerial.classList.add('btn-danger');

      readSerialStream();
    } catch (err) {
      console.warn('Web Serial connection cancelled or failed:', err);
    }
  }

  async function readSerialStream() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = serialPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep unfinished line
      for (const line of lines) {
        parseSerialCSVLine(line);
      }
    }
  }

  function parseSerialCSVLine(line) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('timestamp')) return;
    const parts = line.split(',');
    if (parts.length >= 10) {
      const state = {
        timestamp: parseInt(parts[0]),
        vDiff: parseFloat(parts[1]),
        r1: parseFloat(parts[2]),
        r2: parseFloat(parts[3]),
        temperature: parseFloat(parts[4]),
        estimatedDistance: parseFloat(parts[5]),
        referenceDistance: parseFloat(parts[6]),
        absError: parseFloat(parts[7]),
        potPosition: parseInt(parts[8]),
        status: parts[9].trim().toUpperCase(),
        stepCount: 0,
        pctError: 0
      };
      updateMeters(state);
      updateCharts(state);
    }
  }

  // Start engine loop at 10 Hz (100 ms)
  simulationTimer = setInterval(tick, 100);
  updateVisualizer();
});
