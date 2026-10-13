@echo off
echo ==============================================
echo   Arresto Servizio MySQL Server
echo ==============================================
taskkill /F /IM mysqld.exe
echo [OK] MySQL Server arrestato.
pause
