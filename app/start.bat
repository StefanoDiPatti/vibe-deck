@echo off
setlocal
title Vibe Deck
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto run

echo.
echo Node.js non e' installato.
where winget >nul 2>nul
if errorlevel 1 goto manual

choice /M "Installo Node.js LTS adesso con winget"
if errorlevel 2 goto manual
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto run
echo.
echo Installazione completata: chiudi questa finestra e riapri start.bat
pause
exit /b 0

:manual
echo Scarica Node.js LTS da https://nodejs.org, installalo e riapri start.bat
pause
exit /b 1

:run
if /i "%~1"=="--console" goto console

node scripts\bootstrap.js --prepare %*
if errorlevel 1 goto failed
echo.
echo Avvio la dock in background: cerca l'icona vicino all'orologio.
wscript.exe "%~dp0scripts\windows\start-hidden.vbs"
exit /b 0

:console
node scripts\bootstrap.js
if errorlevel 1 pause
exit /b

:failed
echo.
echo Preparazione non riuscita: controlla i messaggi qui sopra.
pause
exit /b 1
