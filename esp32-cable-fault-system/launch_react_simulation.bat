@echo off
title ESP32 Cable Fault Detection - React Simulation
echo ========================================================
echo  ESP32 Automated Cable Fault Localization System
echo  React 18 Interactive Web Simulation
echo ========================================================
echo Opening browser at http://localhost:3000 ...
start "" "http://localhost:3000"
echo Server is running. Press Ctrl+C to stop.
python -m http.server 3000 --directory "%~dp0react-website"
pause
